import copy
from contextlib import contextmanager
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import publish_preview as publish


def encode(value):
    return json.dumps(value, separators=(',', ':')).encode()


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def add_blob(files, value, media_type):
    data = value if isinstance(value, bytes) else encode(value)
    identity = digest(data)
    files['blobs/sha256/' + identity[7:]] = data
    return {'mediaType': media_type, 'digest': identity, 'size': len(data)}


def fixture(*, oci=False, provenance=False, artifact_attestation=False, architecture='amd64',
            extra_config=None, attestation_reference=None, attestation_payload=b'{"predicate":{}}'):
    files = {}
    # A real filesystem layer, although all Docker commands in these tests are mocked.
    layer_stream = io.BytesIO()
    with tarfile.open(fileobj=layer_stream, mode='w') as tar:
        member = tarfile.TarInfo('hello.txt')
        member.size = 5
        tar.addfile(member, io.BytesIO(b'hello'))
    layer = layer_stream.getvalue()
    config = encode({'os': 'linux', 'architecture': architecture,
                     'rootfs': {'type': 'layers', 'diff_ids': [digest(layer)]}, **(extra_config or {})})
    if oci:
        config_descriptor = add_blob(files, config, publish.OCI + 'config.v1+json')
        config_name = 'blobs/sha256/' + config_descriptor['digest'][7:]
        layer_descriptor = add_blob(files, layer, publish.OCI + 'layer.v1.tar')
        layer_name = 'blobs/sha256/' + layer_descriptor['digest'][7:]
        image = add_blob(files, {'schemaVersion': 2, 'mediaType': publish.OCI + 'manifest.v1+json',
                                'config': config_descriptor, 'layers': [layer_descriptor]},
                         publish.OCI + 'manifest.v1+json')
        target = image
        if provenance:
            payload = add_blob(files, attestation_payload, 'application/vnd.in-toto+json')
            if artifact_attestation:
                attestation_config = add_blob(files, b'{}', 'application/vnd.oci.empty.v1+json')
                attestation_config['data'] = 'e30='
                extra = {'artifactType': publish.ATTESTATION_TYPE, 'subject': dict(image)}
            else:
                attestation_config = add_blob(files, {'os': 'unknown', 'architecture': 'unknown',
                                                     'rootfs': {'type': 'layers', 'diff_ids': [digest(attestation_payload)]}},
                                              publish.OCI + 'config.v1+json')
                extra = {}
            attestation = add_blob(files, {'schemaVersion': 2, 'mediaType': publish.OCI + 'manifest.v1+json',
                                          'config': attestation_config, 'layers': [payload], **extra},
                                   publish.OCI + 'manifest.v1+json')
            attestation.update(platform={'os': 'unknown', 'architecture': 'unknown'},
                               annotations={'vnd.docker.reference.type': 'attestation-manifest',
                                            'vnd.docker.reference.digest': attestation_reference or image['digest']})
            target = add_blob(files, {'schemaVersion': 2, 'mediaType': publish.OCI + 'index.v1+json',
                                     'manifests': [dict(image, platform={'os': 'linux', 'architecture': architecture}), attestation]},
                              publish.OCI + 'index.v1+json')
        target['annotations'] = {publish.NAME_ANNOTATION: 'docker.io/library/' + publish.BUILD_TAG,
                                 publish.REF_ANNOTATION: 'artifact'}
        files['index.json'] = encode({'schemaVersion': 2, 'mediaType': publish.OCI + 'index.v1+json',
                                      'manifests': [target]})
        files['oci-layout'] = encode({'imageLayoutVersion': '1.0.0'})
    else:
        config_name, layer_name = 'config.json', 'layer.tar'
        files.update({config_name: config, layer_name: layer})
    files['manifest.json'] = encode([{'Config': config_name, 'RepoTags': [publish.BUILD_TAG], 'Layers': [layer_name]}])
    return files


def mutate_json(files, name, change):
    value = json.loads(files[name])
    change(value)
    files[name] = encode(value)


def mutate_index(files, change):
    wrapper = json.loads(files['index.json'])
    target = wrapper['manifests'][0]
    index = json.loads(files['blobs/sha256/' + target['digest'][7:]])
    change(index)
    replacement = add_blob(files, index, target['mediaType'])
    wrapper['manifests'][0] = dict(replacement, annotations=target['annotations'])
    files['index.json'] = encode(wrapper)


def mutate_attestation(files, change):
    def update(index):
        descriptor = index['manifests'][1]
        attestation = json.loads(files['blobs/sha256/' + descriptor['digest'][7:]])
        change(attestation, index['manifests'][0])
        descriptor.update(add_blob(files, attestation, descriptor['mediaType']))
    mutate_index(files, update)


def write_archive(path, files):
    with tarfile.open(path, 'w') as tar:
        for name, data in files.items() if isinstance(files, dict) else files:
            member = tarfile.TarInfo(name)
            if isinstance(data, tarfile.TarInfo):
                tar.addfile(data)
            else:
                member.size = len(data)
                tar.addfile(member, io.BytesIO(data))


class ArchiveTests(unittest.TestCase):
    def identity(self, files):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'image.tar'
            write_archive(path, files)
            return publish._archive_identity(path)

    def test_valid_fixed_tag_and_configuration_hash(self):
        files = fixture()
        self.assertEqual(self.identity(files), publish.ArchiveIdentity(digest(files['config.json'])))

    def test_valid_oci_image_with_both_attestation_formats(self):
        for provenance, artifact in [(False, False), (True, False), (True, True)]:
            with self.subTest(provenance=provenance, artifact=artifact):
                files = fixture(oci=True, provenance=provenance, artifact_attestation=artifact)
                manifest = json.loads(files['manifest.json'])[0]
                identity = self.identity(files)
                self.assertEqual(identity.config_digest, digest(files[manifest['Config']]))
                self.assertEqual(identity.oci_target_digest, json.loads(files['index.json'])['manifests'][0]['digest'])
                self.assertEqual(len(identity.attestations), int(provenance))

    def test_unexpected_missing_and_additional_tags(self):
        for tags in [None, [], ['untrusted:tag'], [publish.BUILD_TAG, 'untrusted:tag'],
                     ['docker.io/library/' + publish.BUILD_TAG]]:
            with self.subTest(tags=tags):
                files = fixture()
                mutate_json(files, 'manifest.json', lambda m: m[0].update(RepoTags=tags))
                with self.assertRaisesRegex(ValueError, 'Unexpected image tag'):
                    self.identity(files)

    def test_missing_multiple_or_malformed_manifests(self):
        for manifest in [[], [{}, {}], {}, [None], ['image'], [{'repotags': [publish.BUILD_TAG]}]]:
            with self.subTest(manifest=manifest):
                files = fixture()
                files['manifest.json'] = encode(manifest)
                with self.assertRaises(ValueError):
                    self.identity(files)
        files = fixture()
        del files['manifest.json']
        with self.assertRaises(ValueError):
            self.identity(files)

    def test_invalid_missing_and_oversized_configurations(self):
        for config in [None, b'{', b'[]', b'null', b'{}', b'{"value":NaN}',
                       b' ' * (publish.MAX_METADATA + 1)]:
            with self.subTest(config=None if config is None else len(config)):
                files = fixture()
                if config is None:
                    del files['config.json']
                else:
                    files['config.json'] = config
                with self.assertRaises(ValueError):
                    self.identity(files)

    def test_wrong_platform(self):
        for extra in [{'architecture': 'arm64'}, {'os': 'windows'}]:
            files = fixture(extra_config=extra)
            with self.assertRaisesRegex(ValueError, 'Linux amd64'):
                self.identity(files)

    def test_invalid_rootfs_and_layers(self):
        for rootfs in [None, {}, {'type': 'other', 'diff_ids': []}, {'type': 'layers', 'diff_ids': ['invalid']},
                       {'type': 'layers', 'diff_ids': []}]:
            files = fixture(extra_config={'rootfs': rootfs})
            with self.assertRaises(ValueError):
                self.identity(files)
        for layers in [None, 'layer.tar', ['missing.tar'], ['../layer.tar']]:
            files = fixture()
            mutate_json(files, 'manifest.json', lambda m: m[0].update(Layers=layers))
            with self.assertRaises(ValueError):
                self.identity(files)

    def test_duplicate_members_and_json_keys_are_rejected(self):
        files = fixture()
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.identity(list(files.items()) + [('manifest.json', files['manifest.json'])])
        files['config.json'] = files['config.json'].replace(b'"os":"linux"', b'"os":"linux","os":"linux"')
        with self.assertRaisesRegex(ValueError, 'Duplicate JSON'):
            self.identity(files)
        files = fixture()
        mutate_json(files, 'manifest.json', lambda m: m[0].update(repotags=['attacker:tag']))
        with self.assertRaisesRegex(ValueError, 'metadata fields'):
            self.identity(files)

    def test_unsafe_members_and_links_are_rejected(self):
        for name in ['../escape', '/absolute', './manifest.json', 'a/../escape', 'a//b', 'a\\b']:
            with self.subTest(name=name):
                files = fixture()
                files[name] = b'data'
                with self.assertRaisesRegex(ValueError, 'Unsafe'):
                    self.identity(files)
        for name in ['manifest.json', 'config.json', 'layer.tar']:
            for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.DIRTYPE]:
                with self.subTest(name=name, kind=kind):
                    files = fixture()
                    link = tarfile.TarInfo(name)
                    link.type, link.linkname = kind, 'other'
                    files[name] = link
                    with self.assertRaises(ValueError):
                        self.identity(files)

    def test_archive_and_manifest_size_limits(self):
        files = fixture()
        files['manifest.json'] = b' ' * (publish.MAX_METADATA + 1)
        with self.assertRaisesRegex(ValueError, 'metadata is too large'):
            self.identity(files)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'image.tar'
            with path.open('wb') as stream:
                stream.truncate(publish.MAX_ARCHIVE + 1)
            with self.assertRaisesRegex(ValueError, 'archive size'):
                publish._archive_identity(path)

    def test_corrupt_and_compressed_archives_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'image.tar'
            path.write_bytes(b'not a tar')
            with self.assertRaises(ValueError):
                publish._archive_identity(path)
            with tarfile.open(path, 'w:gz'):
                pass
            with self.assertRaises(ValueError):
                publish._archive_identity(path)

    def test_missing_or_unsupported_oci_layout(self):
        for missing in ['oci-layout', 'index.json']:
            files = fixture(oci=True)
            del files[missing]
            with self.assertRaises(ValueError):
                self.identity(files)
        files = fixture(oci=True)
        files['oci-layout'] = encode({'imageLayoutVersion': '2.0.0'})
        with self.assertRaises(ValueError):
            self.identity(files)

    def test_oci_names_and_multiple_named_targets(self):
        for name, value in [(publish.NAME_ANNOTATION, 'evil.example/image:tag'),
                            (publish.REF_ANNOTATION, 'other')]:
            files = fixture(oci=True)
            mutate_json(files, 'index.json', lambda m: m['manifests'][0]['annotations'].update({name: value}))
            with self.assertRaisesRegex(ValueError, 'OCI image tag'):
                self.identity(files)
        files = fixture(oci=True)
        mutate_json(files, 'index.json', lambda m: m['manifests'].append(m['manifests'][0]))
        with self.assertRaisesRegex(ValueError, 'one named OCI target'):
            self.identity(files)

    def test_corrupt_descriptors_and_missing_blobs(self):
        for change in [{'size': 1}, {'size': True}, {'digest': 'sha256:' + 'f' * 64},
                       {'digest': 'sha512:' + 'f' * 128}, {'urls': ['https://evil.example/blob']},
                       {'data': 'not-base64'}, {'data': 'e30='}]:
            with self.subTest(change=change):
                files = fixture(oci=True)
                mutate_json(files, 'index.json', lambda m: m['manifests'][0].update(change))
                with self.assertRaises(ValueError):
                    self.identity(files)
        files = fixture(oci=True)
        target = json.loads(files['index.json'])['manifests'][0]
        name = 'blobs/sha256/' + target['digest'][7:]
        files[name] = files[name].replace(b'"schemaVersion":2', b'"schemaVersion":3')
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            self.identity(files)
        files = fixture(oci=True)
        layer = json.loads(files['manifest.json'])[0]['Layers'][0]
        files[layer] = b'j' * len(files[layer])
        with self.assertRaisesRegex(ValueError, 'digest mismatch'):
            self.identity(files)

    def test_conflicting_docker_and_oci_configuration_or_layers(self):
        files = fixture(oci=True)
        files['other.json'] = fixture(extra_config={'config': {'Env': ['DIFFERENT=yes']}})['config.json']
        mutate_json(files, 'manifest.json', lambda m: m[0].update(Config='other.json'))
        with self.assertRaisesRegex(ValueError, 'configurations do not match'):
            self.identity(files)
        files = fixture(oci=True)
        files['other-layer.tar'] = b'other'
        mutate_json(files, 'manifest.json', lambda m: m[0].update(Layers=['other-layer.tar']))
        with self.assertRaisesRegex(ValueError, 'layers do not match'):
            self.identity(files)

    def test_additional_runnable_images_and_nested_indexes(self):
        files = fixture(oci=True, provenance=True)
        mutate_index(files, lambda m: m['manifests'].append(m['manifests'][0]))
        with self.assertRaisesRegex(ValueError, 'one runnable'):
            self.identity(files)
        files = fixture(oci=True, provenance=True)
        wrapper = json.loads(files['index.json'])
        target = wrapper['manifests'][0]
        nested = add_blob(files, {'schemaVersion': 2, 'mediaType': publish.OCI + 'index.v1+json',
                                  'manifests': [dict(target)]}, publish.OCI + 'index.v1+json')
        wrapper['manifests'][0] = dict(nested, annotations=target['annotations'])
        files['index.json'] = encode(wrapper)
        with self.assertRaisesRegex(ValueError, 'Unsupported OCI document'):
            self.identity(files)

    def test_invalid_attestation_reference_and_platform(self):
        files = fixture(oci=True, provenance=True, attestation_reference='sha256:' + 'f' * 64)
        with self.assertRaisesRegex(ValueError, 'Attestation does not reference'):
            self.identity(files)
        files = fixture(oci=True, provenance=True)
        mutate_index(files, lambda m: m['manifests'][1].update(platform={'os': 'linux', 'architecture': 'amd64'}))
        with self.assertRaisesRegex(ValueError, 'Attestation does not reference'):
            self.identity(files)

    def test_legacy_attestation_configuration_and_payload_types(self):
        cases = [
            (lambda m, image: m.update(config=json.loads(files['blobs/sha256/' + image['digest'][7:]])['config']),
             'legacy attestation configuration'),
            (lambda m, _: m['layers'][0].update(mediaType=publish.OCI + 'layer.v1.tar'),
             'Unsupported attestation payload'),
            (lambda m, _: m.update(layers=[]), 'Invalid attestation payloads'),
            (lambda m, _: m.update(artifactType='unsupported'), 'legacy attestation configuration'),
        ]
        for change, message in cases:
            with self.subTest(message=message):
                files = fixture(oci=True, provenance=True)
                mutate_attestation(files, change)
                with self.assertRaisesRegex(ValueError, message):
                    self.identity(files)

    def test_oci_artifact_subject_and_empty_configuration_are_checked(self):
        for field in ['subject', 'config']:
            files = fixture(oci=True, provenance=True, artifact_attestation=True)
            def change(attestation, image):
                attestation[field] = json.loads(files['blobs/sha256/' + image['digest'][7:]])['config']
            mutate_attestation(files, change)
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'Invalid OCI artifact attestation'):
                self.identity(files)


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

    @contextmanager
    def publisher(self, files=None, exported=None, inspected_id=None, inspected_platform=None,
                  failure=None, final_pr=None, artifacts=None, extra_download=False):
        files = fixture() if files is None else files
        exported = files if exported is None else exported
        commands, events = [], []
        pull_calls = 0
        with tempfile.TemporaryDirectory() as directory:
            summary, output = Path(directory) / 'summary', Path(directory) / 'output'
            environment = {'BUILD_RUN_ID': '42', 'GITHUB_ACTOR': 'maintainer', 'GH_TOKEN': 'test-token',
                           'GITHUB_STEP_SUMMARY': str(summary), 'GITHUB_OUTPUT': str(output)}

            def api(path):
                nonlocal pull_calls
                events.append(('api', path))
                if path == '/actions/runs/42':
                    return self.run
                if path == '/actions/runs/42/artifacts?per_page=100':
                    return {'artifacts': [self.artifact] if artifacts is None else artifacts}
                self.assertEqual(path, f'/pulls/{self.pr["number"]}')
                pull_calls += 1
                return self.pr if pull_calls == 1 or final_pr is None else final_pr

            def record(command, options):
                self.assertTrue(options.get('check', True))
                self.assertFalse(options.get('shell', False))
                commands.append((command, options))
                events.append(tuple(command))
                if failure and command[:len(failure)] == failure:
                    raise subprocess.CalledProcessError(1, command)

            def run(command, **options):
                record(command, options)
                if command[:3] == ['gh', 'run', 'download']:
                    write_archive(Path(command[-1]) / 'image.tar', files)
                    if extra_download:
                        (Path(command[-1]) / 'untrusted.py').write_text('raise RuntimeError("must not run")')
                elif command[:2] == ['docker', 'save']:
                    self.assertEqual(command[-1], publish.BUILD_TAG)
                    self.assertNotIn('--platform', command)
                    write_archive(Path(command[3]), exported)
                return subprocess.CompletedProcess(command, 0)

            def inspect(command, **options):
                record(command, options)
                self.assertEqual(command, ['docker', 'image', 'inspect', publish.BUILD_TAG])
                return json.dumps([{'Id': inspected_id or 'sha256:' + 'c' * 64,
                                    'Os': 'linux', 'Architecture': 'amd64', **(inspected_platform or {})}])

            with patch.dict(os.environ, environment), patch.object(publish, 'api', side_effect=api), \
                 patch.object(publish.subprocess, 'run', side_effect=run), \
                 patch.object(publish.subprocess, 'check_output', side_effect=inspect), \
                 patch('sys.stdout', new=io.StringIO()):
                yield commands, events, summary, output

    def test_publish_accepts_docker_configuration_manifest_and_index_ids(self):
        for files in [fixture(), fixture(oci=True), fixture(oci=True, provenance=True),
                      fixture(oci=True, provenance=True, artifact_attestation=True)]:
            manifest = json.loads(files['manifest.json'])[0]
            config_id = digest(files[manifest['Config']])
            for reported_id in [config_id, 'sha256:' + 'd' * 64, 'sha256:' + 'e' * 64]:
                with self.subTest(oci='index.json' in files, reported_id=reported_id):
                    with self.publisher(files, inspected_id=reported_id) as (commands, events, summary, output):
                        publish.main()
                        tag = f'{publish.IMAGE}:pr-213-{self.sha}'
                        self.assertIn((['docker', 'tag', publish.BUILD_TAG, tag], {'check': True}), commands)
                        self.assertIn(tag, summary.read_text())
                        self.assertEqual(output.read_text(), f'pr=213\nsha={self.sha}\n')
                        push = next(c for c in commands if c[0][:2] == ['docker', 'push'])
                        self.assertEqual(push[0], ['docker', 'push', tag])
                        self.assertEqual(events[events.index(tuple(push[0])) - 1], ('api', '/pulls/213'))
                        for command, options in commands:
                            if command[0] == 'docker':
                                self.assertIn(command[1], ['load', 'image', 'save', 'tag', 'login', 'push', 'logout'])
                            self.assertNotIn('test-token', command)
                            if command[:2] in [['docker', 'login'], ['docker', 'push'], ['docker', 'logout']]:
                                self.assertTrue(options['env']['DOCKER_CONFIG'].endswith('/registry-auth'))
                            else:
                                self.assertNotIn('input', options)
                                self.assertNotIn('env', options)

    def test_configuration_mismatch_aborts_before_tag_login_or_push(self):
        exported = fixture(extra_config={'config': {'Env': ['WRONG=yes']}})
        with self.publisher(exported=exported) as (commands, _, summary, output):
            with self.assertRaisesRegex(ValueError, 'configuration does not match'):
                publish.main()
            self.assertFalse(any(c[0][1] in ['tag', 'login', 'push'] for c in commands if c[0][0] == 'docker'))
            self.assertFalse(summary.exists() or output.exists())

    def test_changed_or_dropped_provenance_aborts_publication(self):
        original = fixture(oci=True, provenance=True)
        for exported in [fixture(), fixture(oci=True),
                         fixture(oci=True, provenance=True, attestation_payload=b'{"predicate":{"changed":true}}')]:
            with self.subTest(exported=list(exported)):
                with self.publisher(original, exported) as (commands, _, _, _):
                    with self.assertRaisesRegex(ValueError, 'preserve the validated provenance'):
                        publish.main()
                    self.assertFalse(any(c[0][:2] == ['docker', 'push'] for c in commands))

    def test_same_configuration_but_changed_attestation_index_is_rejected(self):
        original = fixture(oci=True, provenance=True)
        exported = copy.deepcopy(original)
        mutate_index(exported, lambda m: m.update(annotations={'changed': 'yes'}))
        with self.publisher(original, exported):
            with self.assertRaisesRegex(ValueError, 'preserve the validated provenance'):
                publish.main()

    def test_classic_and_containerd_archive_representations_can_differ_without_provenance(self):
        for original, exported in [(fixture(), fixture(oci=True)), (fixture(oci=True), fixture())]:
            with self.publisher(original, exported):
                publish.main()

    def test_untrusted_tag_is_rejected_before_loading(self):
        files = fixture()
        mutate_json(files, 'manifest.json', lambda m: m[0].update(RepoTags=['attacker:tag']))
        with self.publisher(files) as (commands, _, _, _):
            with self.assertRaisesRegex(ValueError, 'Unexpected image tag'):
                publish.main()
            self.assertFalse(any(c[0][0] == 'docker' for c in commands))

    def test_untrusted_oci_tag_is_rejected_before_loading(self):
        files = fixture(oci=True, provenance=True)
        mutate_json(files, 'index.json', lambda m: m['manifests'][0]['annotations'].update(
            {publish.NAME_ANNOTATION: 'evil.example/image:tag'}))
        with self.publisher(files) as (commands, _, _, _):
            with self.assertRaisesRegex(ValueError, 'Unexpected OCI image tag'):
                publish.main()
            self.assertFalse(any(c[0][0] == 'docker' for c in commands))

    def test_wrong_loaded_platform_aborts_before_save_or_login(self):
        with self.publisher(inspected_platform={'Architecture': 'arm64'}) as (commands, _, _, _):
            with self.assertRaisesRegex(ValueError, 'Loaded image must be Linux amd64'):
                publish.main()
            self.assertFalse(any(c[0][1] in ['save', 'login', 'push'] for c in commands if c[0][0] == 'docker'))

    def test_pr_head_change_immediately_before_push_aborts_and_logs_out(self):
        changed = copy.deepcopy(self.pr)
        changed['head']['sha'] = 'b' * 40
        with self.publisher(final_pr=changed) as (commands, _, summary, output):
            with self.assertRaisesRegex(ValueError, 'current eligible PR'):
                publish.main()
            self.assertFalse(any(c[0][:2] == ['docker', 'push'] for c in commands))
            self.assertEqual(commands[-1][0], ['docker', 'logout', 'ghcr.io'])
            self.assertFalse(summary.exists() or output.exists())

    def test_docker_failures_abort_and_logout_after_push_failure(self):
        for failure in [['docker', 'load'], ['docker', 'image', 'inspect'], ['docker', 'save'],
                        ['docker', 'tag'], ['docker', 'login'], ['docker', 'push']]:
            with self.subTest(failure=failure):
                with self.publisher(failure=failure) as (commands, _, summary, output):
                    with self.assertRaises(subprocess.CalledProcessError):
                        publish.main()
                    if failure == ['docker', 'push']:
                        self.assertEqual(commands[-1][0], ['docker', 'logout', 'ghcr.io'])
                    else:
                        self.assertFalse(any(c[0][:2] == ['docker', 'push'] for c in commands))
                    self.assertFalse(summary.exists() or output.exists())

    def test_two_prs_use_the_same_build_tag_in_isolated_publishing_jobs(self):
        published = []
        for number, sha in [(213, 'a' * 40), (214, 'b' * 40)]:
            self.sha = sha
            self.run['head_sha'] = sha
            self.pr['number'], self.pr['head']['sha'] = number, sha
            self.artifact['name'] = f'preview-pr-{number}-{sha}'
            files = fixture(extra_config={'config': {'Env': [f'PR={number}']}})
            with self.publisher(files) as (commands, _, _, _):
                publish.main()
                published.append(next(c[0][-1] for c in commands if c[0][:2] == ['docker', 'push']))
                self.assertTrue(any(c[0] == ['docker', 'image', 'inspect', publish.BUILD_TAG] for c in commands))
        self.assertEqual(published, [f'{publish.IMAGE}:pr-213-' + 'a' * 40, f'{publish.IMAGE}:pr-214-' + 'b' * 40])

    def test_multiple_preview_artifacts_and_extra_downloaded_files_are_rejected(self):
        with self.publisher(artifacts=[self.artifact, dict(self.artifact)]) as (commands, _, _, _):
            with self.assertRaisesRegex(ValueError, 'one preview artifact'):
                publish.main()
            self.assertEqual(commands, [])
        with self.publisher(extra_download=True) as (commands, _, _, _):
            with self.assertRaisesRegex(ValueError, 'only image.tar'):
                publish.main()
            self.assertFalse(any(c[0][0] == 'docker' for c in commands))


if __name__ == '__main__':
    unittest.main()
