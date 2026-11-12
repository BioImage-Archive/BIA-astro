"""Publish an allowlisted build artifact; never execute PR code or its image."""
import base64
import binascii
import hashlib
from dataclasses import dataclass
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile

SOURCE = 'BioImage-Archive/BIA-astro'
ALLOWED = {SOURCE, 'bijux/bijux-bia-astro'}
IMAGE = 'ghcr.io/bioimage-archive/bia-astro-preview'
BUILD_TAG = 'preview-build:artifact'
ARTIFACT = re.compile(r'preview-pr-([1-9][0-9]*)-([0-9a-f]{40})\Z')
MAX_ARCHIVE = 2 * 1024 ** 3
MAX_METADATA = 1024 * 1024
SHA256 = re.compile(r'sha256:[0-9a-f]{64}\Z')
OCI = 'application/vnd.oci.image.'
DOCKER = 'application/vnd.docker.'
INDEX_TYPES = {OCI + 'index.v1+json', DOCKER + 'distribution.manifest.list.v2+json'}
MANIFEST_TYPES = {OCI + 'manifest.v1+json', DOCKER + 'distribution.manifest.v2+json'}
CONFIG_TYPES = {OCI + 'config.v1+json', DOCKER + 'container.image.v1+json'}
ATTESTATION_TYPE = DOCKER + 'attestation.manifest.v1+json'
NAME_ANNOTATION = 'io.containerd.image.name'
REF_ANNOTATION = 'org.opencontainers.image.ref.name'


@dataclass(frozen=True)
class ArchiveIdentity:
    config_digest: str
    oci_target_digest: str | None = None
    attestations: frozenset[str] = frozenset()


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


def _json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate JSON field')
            result[key] = value
        return result
    def invalid_constant(value):
        raise ValueError('Invalid JSON constant: ' + value)
    return json.loads(data, object_pairs_hook=unique, parse_constant=invalid_constant)


def _fields(value, allowed):
    # Reject alternate spellings too: Docker's Go JSON decoder is case-insensitive.
    if not isinstance(value, dict) or value.keys() - allowed:
        raise ValueError('Unexpected image metadata fields')
    return value


def _platform(value, os_name, architecture):
    return isinstance(value, dict) and value.get('os') == os_name and value.get('architecture') == architecture


class _Archive:
    """Read a Docker-save tar without extracting or executing any member."""

    def __init__(self, tar):
        self.tar = tar
        self.members = {}
        self.verified = set()
        for member in tar:
            name = member.name.rstrip('/') if member.isdir() else member.name
            self.path(name)
            if name in self.members or not (member.isfile() or member.isdir()):
                raise ValueError('Duplicate or linked archive member')
            self.members[name] = member
            if len(self.members) > 10000 or not 0 <= member.size <= MAX_ARCHIVE:
                raise ValueError('Image archive has too many or oversized members')

    @staticmethod
    def path(name):
        if (not isinstance(name, str) or not name or '\\' in name or '\x00' in name
            or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts
            or PurePosixPath(name).as_posix() != name or name == '.'):
            raise ValueError('Unsafe archive path')

    def member(self, name):
        self.path(name)
        member = self.members.get(name)
        if member is None or not member.isfile():
            raise ValueError('Missing or invalid archive member')
        return member

    def data(self, name):
        member = self.member(name)
        if member.size > MAX_METADATA:
            raise ValueError('Image metadata is too large')
        with self.tar.extractfile(member) as stream:
            return stream.read()

    def json(self, name):
        return _json(self.data(name))

    def blob(self, descriptor):
        _fields(descriptor, {'mediaType', 'digest', 'size', 'annotations', 'platform', 'artifactType', 'data'})
        digest, size = descriptor.get('digest'), descriptor.get('size')
        if (not isinstance(digest, str) or not SHA256.fullmatch(digest)
            or type(size) is not int or not 0 <= size <= MAX_ARCHIVE):
            raise ValueError('Invalid OCI descriptor')
        if 'data' in descriptor:
            try:
                data = base64.b64decode(descriptor['data'], validate=True)
            except (binascii.Error, TypeError, ValueError) as error:
                raise ValueError('Invalid inline OCI data') from error
            if len(data) != size or 'sha256:' + hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('Inline OCI data mismatch')
        annotations = descriptor.get('annotations', {})
        if not isinstance(annotations, dict) or any(not isinstance(v, str) for v in annotations.values()):
            raise ValueError('Invalid OCI annotations')
        name = 'blobs/sha256/' + digest.removeprefix('sha256:')
        member = self.member(name)
        if member.size != size:
            raise ValueError('OCI blob size mismatch')
        if digest not in self.verified:
            checksum = hashlib.sha256()
            with self.tar.extractfile(member) as stream:
                for chunk in iter(lambda: stream.read(MAX_METADATA), b''):
                    checksum.update(chunk)
            if 'sha256:' + checksum.hexdigest() != digest:
                raise ValueError('OCI blob digest mismatch')
            self.verified.add(digest)
        return name

    def document(self, descriptor, types):
        name = self.blob(descriptor)
        document = _fields(self.json(name),
                           {'schemaVersion', 'mediaType', 'manifests', 'config', 'layers',
                            'annotations', 'artifactType', 'subject'})
        if (document.get('schemaVersion') != 2 or descriptor.get('mediaType') not in types
            or document.get('mediaType') != descriptor['mediaType']):
            raise ValueError('Unsupported OCI document')
        return document


def _oci_identity(archive, manifest, config_digest):
    if archive.json('oci-layout') != {'imageLayoutVersion': '1.0.0'}:
        raise ValueError('Unsupported OCI layout')
    index = _fields(archive.json('index.json'), {'schemaVersion', 'mediaType', 'manifests', 'annotations'})
    targets = index.get('manifests')
    if (index.get('schemaVersion') != 2 or index.get('mediaType') not in INDEX_TYPES
        or not isinstance(targets, list) or len(targets) != 1):
        raise ValueError('Exactly one named OCI target is required')
    target = targets[0]
    document = archive.document(target, INDEX_TYPES | MANIFEST_TYPES)
    annotations = target.get('annotations', {})
    if (annotations.get(NAME_ANNOTATION) != 'docker.io/library/' + BUILD_TAG
        or annotations.get(REF_ANNOTATION) != BUILD_TAG.split(':')[1]):
        raise ValueError('Unexpected OCI image tag')
    images, attestations = [], []
    if target['mediaType'] in INDEX_TYPES:
        children = document.get('manifests')
        if not isinstance(children, list):
            raise ValueError('Invalid OCI image index')
        for child in children:
            child_document = archive.document(child, MANIFEST_TYPES)
            annotations = child.get('annotations', {})
            if NAME_ANNOTATION in annotations or REF_ANNOTATION in annotations:
                raise ValueError('Unexpected named OCI child')
            if annotations.get('vnd.docker.reference.type') == 'attestation-manifest':
                attestations.append((child, child_document))
            else:
                if not _platform(child.get('platform'), 'linux', 'amd64'):
                    raise ValueError('Expected a Linux amd64 OCI image')
                images.append((child, child_document))
    else:
        images.append((target, document))
    if len(images) != 1:
        raise ValueError('Exactly one runnable OCI image is required')
    image, document = images[0]
    config = document.get('config')
    archive.blob(config)
    if config.get('mediaType') not in CONFIG_TYPES or config['digest'] != config_digest:
        raise ValueError('Docker and OCI configurations do not match')
    layers = document.get('layers')
    if not isinstance(layers, list) or [archive.blob(layer) for layer in layers] != manifest['Layers']:
        raise ValueError('Docker and OCI layers do not match')
    if document.get('artifactType') or 'subject' in document:
        raise ValueError('Unexpected runnable OCI artifact')
    for descriptor, document in attestations:
        if (not _platform(descriptor.get('platform'), 'unknown', 'unknown')
            or descriptor['annotations'].get('vnd.docker.reference.digest') != image['digest']):
            raise ValueError('Attestation does not reference the validated image')
        config = document.get('config')
        config_data = archive.json(archive.blob(config))
        if document.get('artifactType') == ATTESTATION_TYPE:
            subject = document.get('subject')
            archive.blob(subject)
            if (subject['digest'] != image['digest'] or subject.get('mediaType') != image['mediaType']
                or config.get('mediaType') != 'application/vnd.oci.empty.v1+json' or config_data != {}):
                raise ValueError('Invalid OCI artifact attestation')
        elif (document.get('artifactType') or 'subject' in document
              or config.get('mediaType') not in CONFIG_TYPES
              or not _platform(config_data, 'unknown', 'unknown')):
            raise ValueError('Invalid legacy attestation configuration')
        layers = document.get('layers')
        if not isinstance(layers, list) or not layers:
            raise ValueError('Invalid attestation payloads')
        for layer in layers:
            archive.blob(layer)
            if layer.get('mediaType') != 'application/vnd.in-toto+json':
                raise ValueError('Unsupported attestation payload')
    return ArchiveIdentity(config_digest, target['digest'], frozenset(d['digest'] for d, _ in attestations))


def _archive_identity(path):
    if not 0 < path.stat().st_size <= MAX_ARCHIVE:
        raise ValueError('Invalid image archive size')
    # docker save writes an uncompressed tar; do not allow compressed-size limit bypasses.
    try:
        with tarfile.open(path, 'r:') as tar:
            archive = _Archive(tar)
            manifests = archive.json('manifest.json')
            if not isinstance(manifests, list) or len(manifests) != 1:
                raise ValueError('Exactly one image is required')
            manifest = _fields(manifests[0], {'Config', 'RepoTags', 'Layers', 'Parent', 'LayerSources'})
            if manifest.get('RepoTags') != [BUILD_TAG]:
                raise ValueError('Unexpected image tag in archive')
            config = archive.data(manifest.get('Config'))
            details = _json(config)
            if not _platform(details, 'linux', 'amd64'):
                raise ValueError('Expected a Linux amd64 image')
            layers, rootfs = manifest.get('Layers'), details.get('rootfs')
            if (not isinstance(layers, list) or not isinstance(rootfs, dict) or rootfs.get('type') != 'layers'
                or not isinstance(rootfs.get('diff_ids'), list) or len(rootfs['diff_ids']) != len(layers)
                or any(not isinstance(d, str) or not SHA256.fullmatch(d) for d in rootfs['diff_ids'])):
                raise ValueError('Invalid image root filesystem')
            for layer in layers:
                archive.member(layer)
            digest = 'sha256:' + hashlib.sha256(config).hexdigest()
            if 'oci-layout' in archive.members or 'index.json' in archive.members:
                return _oci_identity(archive, manifest, digest)
            return ArchiveIdentity(digest)
    except (tarfile.TarError, UnicodeError, KeyError, TypeError) as error:
        raise ValueError('Invalid image archive metadata') from error


def _load_verified_image(path, directory):
    identity = _archive_identity(path)
    subprocess.run(['docker', 'load', '--input', str(path)], check=True)
    inspected = _json(subprocess.check_output(['docker', 'image', 'inspect', BUILD_TAG], text=True))
    if (not isinstance(inspected, list) or len(inspected) != 1 or not isinstance(inspected[0], dict)
        or inspected[0].get('Os') != 'linux' or inspected[0].get('Architecture') != 'amd64'):
        raise ValueError('Loaded image must be Linux amd64')
    saved = Path(directory) / 'loaded-image.tar'
    subprocess.run(['docker', 'save', '--output', str(saved), BUILD_TAG], check=True)
    loaded = _archive_identity(saved)
    if loaded.config_digest != identity.config_digest:
        raise ValueError('Loaded image configuration does not match the validated archive')
    if (loaded.attestations != identity.attestations
        or (identity.attestations and loaded.oci_target_digest != identity.oci_target_digest)):
        raise ValueError('Docker did not preserve the validated provenance; use a containerd image store')
    print(f'Verified {BUILD_TAG}: archive and loaded configuration {identity.config_digest}; '
          f'Docker ID {inspected[0].get("Id")}; OCI target {loaded.oci_target_digest}; '
          f'preserved attestations {len(loaded.attestations)}')


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
        _load_verified_image(archive, directory)
        tag = f'{IMAGE}:pr-{number}-{sha}'
        subprocess.run(['docker', 'tag', BUILD_TAG, tag], check=True)
        config = Path(directory) / 'registry-auth'
        env = dict(os.environ, DOCKER_CONFIG=str(config))
        subprocess.run(['docker', 'login', 'ghcr.io', '--username', os.environ['GITHUB_ACTOR'],
                        '--password-stdin'], input=os.environ['GH_TOKEN'], text=True, env=env, check=True)
        try:
            # Recheck after login, immediately before push, to reject superseded builds.
            validate(run, artifact, api(f'/pulls/{number}'))
            subprocess.run(['docker', 'push', tag], env=env, check=True)
        finally:
            subprocess.run(['docker', 'logout', 'ghcr.io'], env=env, check=True)
        summary = f'Published PR #{number} at `{sha}`: `{tag}`. Kubernetes checks every five minutes.\n'
        print(summary)
        Path(os.environ['GITHUB_STEP_SUMMARY']).write_text(summary)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'pr={number}\nsha={sha}\n')


if __name__ == '__main__':
    main()
