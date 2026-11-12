"""Update one PR comment after publication, website tests and preview safety checks."""
import json
import os
import re
import subprocess
import time

from publish_preview import ALLOWED, SOURCE, api

MARKER = '<!-- bia-pr-preview -->'
CHECKS = {
    'basic_checks.yaml': ('Website tests', 'tests'),
    'preview-safety.yml': ('Test preview publishing rules', None),
}
WAIT_SECONDS = 20 * 60
POLL_SECONDS = 20


def current_pr(pr, number, sha):
    return (
        pr.get('number') == number
        and pr.get('state') == 'open'
        and not pr.get('draft')
        and pr.get('base', {}).get('ref') == 'main'
        and pr.get('head', {}).get('sha') == sha
        and (pr.get('head', {}).get('repo') or {}).get('full_name') in ALLOWED
    )


def latest_run(runs, sha):
    candidates = [run for run in runs
                  if run.get('head_sha') == sha and run.get('event') == 'pull_request']
    return max(candidates, key=lambda run: (run['run_number'], run['run_attempt']), default=None)


def latest_job(run, name):
    if run.get('status') in {'queued', 'requested', 'waiting', 'pending'}:
        return None
    matches = []
    page = 1
    while True:
        jobs = api(f'/actions/runs/{run["id"]}/jobs?filter=all&per_page=100&page={page}')['jobs']
        matches.extend(job for job in jobs if job.get('name') == name)
        if len(jobs) < 100:
            # Successful jobs may belong to an earlier attempt when only Netlify
            # jobs were rerun. Prefer the newest execution of the selected job.
            return max(matches, key=lambda job: job['id'], default=None)
        page += 1


def wait_for_checks(number, sha):
    deadline = time.monotonic() + WAIT_SECONDS
    while time.monotonic() < deadline:
        if not current_pr(api(f'/pulls/{number}'), number, sha):
            print('PR is no longer eligible or its head changed; skipping comment.')
            return None
        checks = {}
        for filename, (name, job_name) in CHECKS.items():
            runs = api(f'/actions/workflows/{filename}/runs'
                       f'?event=pull_request&head_sha={sha}&per_page=100')['workflow_runs']
            run = latest_run(runs, sha)
            if run and job_name:
                # Use the tests job even when Netlify leaves its workflow running or failed.
                checks[name] = latest_job(run, job_name)
            else:
                checks[name] = run
        if all(run and run.get('status') == 'completed' for run in checks.values()):
            return checks
        print('Waiting for the current commit\'s website tests and preview safety checks.', flush=True)
        time.sleep(POLL_SECONDS)
    raise TimeoutError('PR workflows did not finish within 20 minutes; no preview comment posted')


def comment_body(number, sha, base_url, publish_url, checks):
    url = f'{base_url.rstrip("/")}/pr-{number}/bioimage-archive/'
    lines = [MARKER, '### PR preview', '', f'[Open preview]({url})', '',
             f'Commit: `{sha}`', '', f'[Image build and publication]({publish_url}): success']
    for name, run in checks.items():
        lines.append(f'- [{name}]({run["html_url"]}): {run["conclusion"]}')
    lines += ['', 'The preview may still be deploying; confirm the commit in its banner before reviewing.']
    return '\n'.join(lines) + '\n'


def update_comment(number, body):
    # Paginate so an older preview comment is still found in a busy PR.
    comments = json.loads(subprocess.check_output([
        'gh', 'api', '--paginate', '--slurp',
        f'repos/{SOURCE}/issues/{number}/comments?per_page=100',
    ], text=True))
    existing = next((comment for page in comments for comment in page
                     if comment.get('user', {}).get('login') == 'github-actions[bot]'
                     and MARKER in (comment.get('body') or '')), None)
    path = (f'issues/comments/{existing["id"]}' if existing else f'issues/{number}/comments')
    subprocess.run([
        'gh', 'api', '--method', 'PATCH' if existing else 'POST',
        f'repos/{SOURCE}/{path}', '--input', '-',
    ], input=json.dumps({'body': body}), text=True, check=True, stdout=subprocess.DEVNULL)


def main():
    number = os.environ['PR_NUMBER']
    sha = os.environ['HEAD_SHA']
    if not re.fullmatch(r'[1-9][0-9]*', number) or not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid PR number or head SHA')
    number = int(number)
    checks = wait_for_checks(number, sha)
    if checks is None:
        return
    body = comment_body(number, sha, os.environ['PREVIEW_BASE_URL'],
                        os.environ['PUBLISH_RUN_URL'], checks)
    # A push or closure while waiting must not receive a comment for the old head.
    if current_pr(api(f'/pulls/{number}'), number, sha):
        update_comment(number, body)


if __name__ == '__main__':
    main()
