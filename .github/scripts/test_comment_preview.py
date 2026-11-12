import copy
import json
import os
import unittest
from unittest.mock import patch

import comment_preview as preview


class PreviewCommentTests(unittest.TestCase):
    def setUp(self):
        self.sha = 'a' * 40
        self.pr = {'number': 213, 'state': 'open', 'draft': False, 'base': {'ref': 'main'},
                   'head': {'sha': self.sha, 'repo': {'full_name': 'bijux/bijux-bia-astro'}}}
        self.run = {'id': 10, 'head_sha': self.sha, 'event': 'pull_request', 'run_number': 1,
                    'run_attempt': 1, 'status': 'completed', 'conclusion': 'success',
                    'html_url': 'https://github.com/example/repo/actions/runs/1'}

    def test_only_current_eligible_pr_can_receive_a_comment(self):
        self.assertTrue(preview.current_pr(self.pr, 213, self.sha))
        for field, value in [('state', 'closed'), ('draft', True), ('base', {'ref': 'release'}),
                             ('number', 214), ('head', {'sha': 'b' * 40}),
                             ('head', {'sha': self.sha, 'repo': {'full_name': 'other/fork'}})]:
            with self.subTest(field=field, value=value):
                pr = copy.deepcopy(self.pr)
                pr[field] = value
                self.assertFalse(preview.current_pr(pr, 213, self.sha))

    def test_latest_run_ignores_other_commits_and_push_events_and_waits_for_reruns(self):
        rerun = dict(self.run, run_attempt=2, status='in_progress')
        unrelated = dict(self.run, head_sha='b' * 40, run_number=10)
        push = dict(self.run, event='push', run_number=20)
        self.assertIs(preview.latest_run([self.run, rerun, unrelated, push], self.sha), rerun)
        self.assertIsNone(preview.latest_run([unrelated, push], self.sha))

    @patch.object(preview.time, 'sleep')
    @patch.object(preview, 'api')
    def test_waits_for_missing_and_running_checks(self, api, sleep):
        running = dict(self.run, status='in_progress', conclusion=None)
        api.side_effect = [
            self.pr, {'workflow_runs': []}, {'workflow_runs': [running]},
            self.pr, {'workflow_runs': [self.run]},
            {'jobs': [dict(self.run, name='tests')]}, {'workflow_runs': [self.run]},
        ]
        checks = preview.wait_for_checks(213, self.sha)
        self.assertEqual(list(checks), [name for name, _ in preview.CHECKS.values()])
        sleep.assert_called_once_with(preview.POLL_SECONDS)

    @patch.object(preview.time, 'sleep')
    @patch.object(preview, 'api')
    def test_netlify_checks_do_not_delay_or_change_the_website_test_result(self, api, sleep):
        for status, conclusion in [('in_progress', None), ('completed', 'failure'),
                                   ('completed', 'timed_out')]:
            with self.subTest(status=status):
                tests = dict(self.run, name='tests')
                netlify = [dict(self.run, name=name, status=status, conclusion=conclusion)
                           for name in ('wait-for-deploy', 'link-check')]
                api.side_effect = [
                    self.pr, {'workflow_runs': [dict(self.run, status=status, conclusion=conclusion)]},
                    {'jobs': [tests, *netlify]}, {'workflow_runs': [self.run]},
                ]
                checks = preview.wait_for_checks(213, self.sha)
                self.assertIs(checks['Website tests'], tests)
                self.assertEqual(checks['Website tests']['conclusion'], 'success')
                sleep.assert_not_called()

    @patch.object(preview.time, 'sleep')
    @patch.object(preview, 'update_comment')
    @patch.object(preview, 'api')
    def test_posts_comment_after_tests_when_netlify_times_out(self, api, update_comment, sleep):
        tests = dict(self.run, name='tests')
        netlify = dict(self.run, id=11, name='wait-for-deploy', conclusion='timed_out')
        api.side_effect = [
            self.pr, {'workflow_runs': [dict(self.run, conclusion='failure')]},
            {'jobs': [tests, netlify]}, {'workflow_runs': [self.run]}, self.pr,
        ]
        with patch.dict(os.environ, {'PR_NUMBER': '213', 'HEAD_SHA': self.sha,
                                     'PREVIEW_BASE_URL': 'https://preview.bioimagearchive.org',
                                     'PUBLISH_RUN_URL': self.run['html_url']}):
            preview.main()
        update_comment.assert_called_once()
        number, body = update_comment.call_args.args
        self.assertEqual(number, 213)
        self.assertIn(f'[Website tests]({tests["html_url"]}): success', body)
        self.assertIn('[Open preview]', body)
        self.assertNotIn('Netlify', body)
        self.assertNotIn('timed_out', body)
        sleep.assert_not_called()

    @patch.object(preview.time, 'sleep')
    @patch.object(preview, 'api')
    def test_reports_failed_tests_without_waiting_for_netlify(self, api, sleep):
        tests = dict(self.run, name='tests', conclusion='failure')
        netlify = dict(self.run, id=11, name='wait-for-deploy', status='in_progress', conclusion=None)
        api.side_effect = [
            self.pr, {'workflow_runs': [dict(self.run, status='in_progress', conclusion=None)]},
            {'jobs': [tests, netlify]}, {'workflow_runs': [self.run]},
        ]
        checks = preview.wait_for_checks(213, self.sha)
        self.assertIs(checks['Website tests'], tests)
        self.assertEqual(checks['Website tests']['conclusion'], 'failure')
        sleep.assert_not_called()

    @patch.object(preview.time, 'sleep')
    @patch.object(preview, 'api')
    def test_waits_for_the_latest_website_test_execution(self, api, sleep):
        rerun = dict(self.run, run_attempt=2, status='in_progress', conclusion=None)
        tests = dict(self.run, name='tests')
        api.side_effect = [
            self.pr, {'workflow_runs': [rerun]}, {'jobs': []}, {'workflow_runs': [self.run]},
            self.pr, {'workflow_runs': [rerun]},
            {'jobs': [dict(tests, status='in_progress', conclusion=None)]},
            {'workflow_runs': [self.run]},
            self.pr, {'workflow_runs': [rerun]}, {'jobs': [tests]}, {'workflow_runs': [self.run]},
        ]
        checks = preview.wait_for_checks(213, self.sha)
        self.assertIs(checks['Website tests'], tests)
        self.assertEqual(sleep.call_count, 2)
        job_requests = [call.args[0] for call in api.call_args_list if '/jobs?' in call.args[0]]
        self.assertEqual(job_requests, ['/actions/runs/10/jobs?filter=all&per_page=100&page=1'] * 3)

    @patch.object(preview, 'api')
    def test_website_test_rerun_supersedes_older_success(self, api):
        older = dict(self.run, id=20, name='tests')
        rerun = dict(older, id=30, status='in_progress', conclusion=None)
        api.return_value = {'jobs': [rerun, older]}
        self.assertIs(preview.latest_job(self.run, 'tests'), rerun)

    @patch.object(preview, 'api')
    def test_netlify_only_rerun_keeps_the_latest_website_test_result(self, api):
        tests = dict(self.run, id=20, name='tests')
        netlify = dict(tests, id=30, name='link-check', status='in_progress', conclusion=None)
        api.return_value = {'jobs': [netlify, tests]}
        self.assertIs(preview.latest_job(dict(self.run, run_attempt=2), 'tests'), tests)

    @patch.object(preview, 'api')
    def test_queued_workflow_does_not_reuse_previous_test_results(self, api):
        self.assertIsNone(preview.latest_job(dict(self.run, status='queued'), 'tests'))
        api.assert_not_called()

    @patch.object(preview, 'api')
    def test_job_history_is_paginated(self, api):
        tests = dict(self.run, name='tests')
        api.side_effect = [{'jobs': [dict(self.run, name='link-check')] * 100}, {'jobs': [tests]}]
        self.assertIs(preview.latest_job(self.run, 'tests'), tests)
        self.assertTrue(api.call_args.args[0].endswith('page=2'))

    @patch.object(preview, 'api')
    def test_stale_head_stops_waiting(self, api):
        api.return_value = dict(self.pr, head={'sha': 'b' * 40})
        self.assertIsNone(preview.wait_for_checks(213, self.sha))
        api.assert_called_once_with('/pulls/213')

    @patch.object(preview.time, 'monotonic', side_effect=[0, preview.WAIT_SECONDS])
    def test_timeout_does_not_post_an_early_comment(self, monotonic):
        with self.assertRaises(TimeoutError):
            preview.wait_for_checks(213, self.sha)

    def test_comment_links_preview_and_reports_failed_checks_without_claiming_readiness(self):
        checks = {'Website checks': dict(self.run, conclusion='failure')}
        body = preview.comment_body(217, self.sha, 'https://preview.bioimagearchive.org/',
                                    'https://github.com/example/repo/actions/runs/2', checks)
        self.assertIn('[Open preview](https://preview.bioimagearchive.org/pr-217/bioimage-archive/)', body)
        self.assertIn(self.sha, body)
        self.assertIn('): failure', body)
        self.assertIn('may still be deploying', body)
        self.assertIn(preview.MARKER, body)

    @patch.object(preview.subprocess, 'run')
    @patch.object(preview.subprocess, 'check_output')
    def test_updates_existing_bot_comment_on_later_page(self, check_output, run):
        check_output.return_value = json.dumps([
            [{'id': 1, 'body': preview.MARKER, 'user': {'login': 'someone'}}],
            [{'id': 2, 'body': preview.MARKER + '\nold', 'user': {'login': 'github-actions[bot]'}}],
        ])
        preview.update_comment(213, 'new body')
        command = run.call_args.args[0]
        self.assertIn('PATCH', command)
        self.assertIn(f'repos/{preview.SOURCE}/issues/comments/2', command)
        self.assertEqual(json.loads(run.call_args.kwargs['input']), {'body': 'new body'})
        self.assertIn('--paginate', check_output.call_args.args[0])

    @patch.object(preview.subprocess, 'run')
    @patch.object(preview.subprocess, 'check_output', return_value='[[]]')
    def test_creates_first_comment(self, check_output, run):
        preview.update_comment(213, 'first preview')
        self.assertIn('POST', run.call_args.args[0])
        self.assertIn(f'repos/{preview.SOURCE}/issues/213/comments', run.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
