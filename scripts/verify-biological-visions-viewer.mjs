import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../public/biological-visions-viewer/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('build-manifest.json', root)));
for (const [path, expected] of Object.entries(manifest.files)) {
  const actual = createHash('sha256').update(await readFile(new URL(path, root))).digest('hex');
  if (actual !== expected) throw new Error(`Viewer bundle checksum mismatch: ${path}`);
}
console.log(`Verified ${Object.keys(manifest.files).length} viewer files from ${manifest.built_revision}`);
