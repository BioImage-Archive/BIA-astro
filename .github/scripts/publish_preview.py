"""Publish an allowlisted build artifact; never execute PR code or its image."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile

SOURCE = 'BioImage-Archive/BIA-astro'
ALLOWED = {SOURCE, 'bijux/bijux-bia-astro'}
IMAGE = 'ghcr.io/bioimage-archive/bia-astro-preview'
ARTIFACT = re.compile(r'preview-pr-([1-9][0-9]*)-([0-9a-f]{40})\Z')
MAX_ARCHIVE = 2 * 1024 ** 3


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{SOURCE}{path}'], text=True))


def validate(run, artifact, pr):
    match = ARTIFACT.fullmatch(artifact.get('name', ''))
    if not match or artifact.get('expired') or not 0 < artifact.get('size_in_bytes', 0) <= MAX_ARCHIVE:
        raise ValueError('Invalid build artifact')
    number, sha = int(match[1]), match[2]
    repo = (pr.get('head', {}).get('repo') or {}).get('full_name')
    if (pr.get('number') != number or pr.get('state') != 'open' or pr.get('draft')
        or pr.get('base', {}).get('ref') != 'main' or repo not in ALLOWED
        or pr.get('head', {}).get('sha') != sha):
        raise ValueError('Artifact does not match a current eligible PR')
    if (run.get('repository', {}).get('full_name') != SOURCE
        or run.get('path', '').split('@')[0] != '.github/workflows/preview-image.yml'
        or run.get('conclusion') != 'success'):
        raise ValueError('Unexpected build workflow')
    if run.get('event') == 'pull_request':
        if run.get('head_sha') != sha or run.get('head_repository', {}).get('full_name') != repo:
            raise ValueError('PR artifact does not match the build event')
    elif run.get('event') == 'workflow_dispatch':
        # Only repository writers can dispatch this trusted main-branch workflow.
        # Its build step resolves the PR through GitHub before checking out its head.
        if run.get('head_branch') != 'main' or run.get('head_repository', {}).get('full_name') != SOURCE:
            raise ValueError('Manual build must originate from main')
    else:
        raise ValueError('Unexpected build event')
    return number, sha


def image_id(archive):
    if archive.stat().st_size > MAX_ARCHIVE:
        raise ValueError('Image archive is too large')
    # Read metadata without extracting paths from the untrusted Docker archive.
    with tarfile.open(archive) as tar:
        member = tar.getmember('manifest.json')
        if not member.isfile() or member.size > 1024 * 1024:
            raise ValueError('Invalid image manifest')
        manifests = json.load(tar.extractfile(member))
        if not isinstance(manifests, list) or len(manifests) != 1:
            raise ValueError('Exactly one image is required')
        member = tar.getmember(manifests[0]['Config'])
        if not member.isfile() or member.size > 1024 * 1024:
            raise ValueError('Invalid image config')
        config = tar.extractfile(member).read()
        details = json.loads(config)
        if details.get('os') != 'linux' or details.get('architecture') != 'amd64':
            raise ValueError('Expected a Linux amd64 image')
        return 'sha256:' + hashlib.sha256(config).hexdigest()


def main():
    run_id = os.environ['BUILD_RUN_ID']
    if not re.fullmatch(r'[1-9][0-9]*', run_id):
        raise ValueError('Invalid run ID')
    run = api('/actions/runs/' + run_id)
    artifacts = api(f'/actions/runs/{run_id}/artifacts?per_page=100')['artifacts']
    candidates = [a for a in artifacts if ARTIFACT.fullmatch(a.get('name', ''))]
    if len(candidates) != 1:
        raise ValueError('Expected exactly one preview artifact')
    artifact = candidates[0]
    number = int(ARTIFACT.fullmatch(artifact['name'])[1])
    pr = api(f'/pulls/{number}')
    number, sha = validate(run, artifact, pr)
    with tempfile.TemporaryDirectory() as directory:
        # gh downloads only the selected artifact. No downloaded scripts run.
        subprocess.run(['gh', 'run', 'download', run_id, '--repo', SOURCE,
                        '--name', artifact['name'], '--dir', directory], check=True)
        files = list(Path(directory).iterdir())
        archive = Path(directory) / 'image.tar'
        if files != [archive] or archive.is_symlink() or not archive.is_file():
            raise ValueError('Artifact must contain only image.tar')
        identity = image_id(archive)
        subprocess.run(['docker', 'load', '--input', str(archive)], check=True)
        subprocess.run(['docker', 'image', 'inspect', identity], check=True, stdout=subprocess.DEVNULL)
        # Recheck immediately before publishing; old commits never get a new tag.
        validate(run, artifact, api(f'/pulls/{number}'))
        tag = f'{IMAGE}:pr-{number}-{sha}'
        subprocess.run(['docker', 'tag', identity, tag], check=True)
        config = Path(directory) / 'registry-auth'
        env = dict(os.environ, DOCKER_CONFIG=str(config))
        subprocess.run(['docker', 'login', 'ghcr.io', '--username', os.environ['GITHUB_ACTOR'],
                        '--password-stdin'], input=os.environ['GH_TOKEN'], text=True, env=env, check=True)
        try:
            subprocess.run(['docker', 'push', tag], env=env, check=True)
        finally:
            subprocess.run(['docker', 'logout', 'ghcr.io'], env=env, check=True)
        summary = f'Published PR #{number} at `{sha}`: `{tag}`. Kubernetes checks every five minutes.\n'
        print(summary)
        Path(os.environ['GITHUB_STEP_SUMMARY']).write_text(summary)


if __name__ == '__main__':
    main()
