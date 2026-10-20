import copy
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import publish_preview as publish


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.sha = 'a' * 40
        self.run = {'repository': {'full_name': publish.SOURCE}, 'head_repository': {'full_name': 'bijux/bijux-bia-astro'},
                    'head_sha': self.sha, 'head_branch': 'feature', 'event': 'pull_request',
                    'path': '.github/workflows/preview-image.yml', 'conclusion': 'success'}
        self.artifact = {'name': 'preview-pr-213-' + self.sha, 'size_in_bytes': 100, 'expired': False}
        self.pr = {'number': 213, 'state': 'open', 'draft': False, 'base': {'ref': 'main'},
                   'head': {'sha': self.sha, 'repo': {'full_name': 'bijux/bijux-bia-astro'}}}

    def test_allowlisted_fork_without_run_pull_requests_is_supported(self):
        self.assertEqual(publish.validate(self.run, self.artifact, self.pr), (213, self.sha))

    def test_unrelated_fork_and_stale_commit_are_rejected(self):
        for field, value in [('sha', 'b' * 40), ('repo', {'full_name': 'attacker/fork'})]:
            pr = copy.deepcopy(self.pr)
            pr['head'][field] = value
            with self.assertRaises(ValueError):
                publish.validate(self.run, self.artifact, pr)

    def test_drafts_closed_and_wrong_base_are_rejected(self):
        for field, value in [('state', 'closed'), ('draft', True), ('base', {'ref': 'release'})]:
            pr = copy.deepcopy(self.pr)
            pr[field] = value
            with self.assertRaises(ValueError):
                publish.validate(self.run, self.artifact, pr)

    def test_failed_or_different_workflow_and_event_are_rejected(self):
        for field, value in [('conclusion', 'failure'), ('path', '.github/workflows/other.yml'),
                             ('head_sha', 'b' * 40), ('event', 'push')]:
            run = dict(self.run, **{field: value})
            with self.assertRaises(ValueError):
                publish.validate(run, self.artifact, self.pr)

    def test_manual_build_must_be_from_trusted_main(self):
        run = dict(self.run, event='workflow_dispatch', head_branch='main', head_repository={'full_name': publish.SOURCE})
        self.assertEqual(publish.validate(run, self.artifact, self.pr), (213, self.sha))
        run['head_branch'] = 'feature'
        with self.assertRaises(ValueError):
            publish.validate(run, self.artifact, self.pr)

    def test_artifact_must_identify_pr_and_be_small_and_current(self):
        for field, value in [('name', '../preview'), ('name', 'preview-pr-214-' + self.sha),
                             ('size_in_bytes', publish.MAX_ARCHIVE + 1), ('expired', True)]:
            with self.assertRaises(ValueError):
                publish.validate(self.run, dict(self.artifact, **{field: value}), self.pr)

    def test_image_identity_comes_from_content_not_uploaded_tags(self):
        config = json.dumps({'os': 'linux', 'architecture': 'amd64'}).encode()
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'image.tar'
            with tarfile.open(archive, 'w') as tar:
                for name, data in [('manifest.json', json.dumps([{'Config': 'config.json', 'RepoTags': ['untrusted:tag']}]).encode()), ('config.json', config)]:
                    member = tarfile.TarInfo(name)
                    member.size = len(data)
                    tar.addfile(member, io.BytesIO(data))
            self.assertEqual(publish.image_id(archive), 'sha256:' + hashlib.sha256(config).hexdigest())


if __name__ == '__main__':
    unittest.main()
