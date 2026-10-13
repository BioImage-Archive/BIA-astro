import { readFile, writeFile } from 'node:fs/promises';

const base = process.env.BIA_COLLECTION_API;
if (!base) throw new Error('Set BIA_COLLECTION_API explicitly, e.g. http://127.0.0.1:8080');
const api = new URL(base);
if (!['https:', 'http:'].includes(api.protocol)) throw new Error('Expected an HTTP(S) API');
const selection = JSON.parse(await readFile(new URL('../src/data/collections/biological-visions-selection.json', import.meta.url)));
if (!Array.isArray(selection) || !selection.length) throw new Error('Select at least one artwork');
const seen = new Set();
const attribute = (object, name) => object.additional_metadata?.find(item => item.name === name)?.value;
const get = async (path) => {
  const response = await fetch(`${base.replace(/\/$/, '')}/v2/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};
const licenceLabels = {
  'https://creativecommons.org/licenses/by/4.0/': 'Creative Commons Attribution 4.0',
  'https://creativecommons.org/publicdomain/zero/1.0/': 'CC0 1.0 Universal — Public Domain Dedication',
};
const images = [];
for (const selected of selection) {
  if (!/^[a-z0-9-]+$/.test(selected.slug) || seen.has(selected.slug)) throw new Error('Invalid/duplicate artwork slug');
  seen.add(selected.slug);
  for (const field of ['title', 'creator', 'caption', 'alt']) {
    if (!selected[field]?.trim()) throw new Error(`${selected.slug}: missing ${field}`);
  }
  const image = await get(`image/${selected.imageUuid}`);
  const dataset = await get(`dataset/${image.submission_dataset_uuid}`);
  const study = await get(`study/${dataset.submitted_in_study_uuid}`);
  const representation = await get(`image_representation/${selected.representationUuid}`);
  if (study.accession_id !== selected.accession || representation.representation_of_uuid !== image.uuid) {
    throw new Error(`${selected.slug}: API identity mismatch`);
  }
  if (representation.image_format !== '.ome.zarr' || representation.size_z !== 1 || representation.size_t !== 1) {
    throw new Error(`${selected.slug}: expected a qualified 2D representation`);
  }
  if (attribute(image, 'recommended_vizarr_representation')?.recommended_vizarr_representation !== representation.uuid) {
    throw new Error(`${selected.slug}: recommended representation mismatch`);
  }
  const previews = Object.entries(attribute(image, 'image_static_display_uri') || {})
    .filter(([key, value]) => key.startsWith('artwork_') && value.representation_uuid === representation.uuid)
    .map(([, value]) => value).sort((a, b) => a.width - b.width);
  if (!previews.length || !study.licence) throw new Error(`${selected.slug}: missing previews or licence`);
  const preview = previews.at(-1);
  for (const item of previews) {
    const response = await fetch(item.uri, { method: 'HEAD' });
    if (!response.ok) throw new Error(`${selected.slug}: preview unavailable`);
  }
  const zarrUri = representation.file_uri[0];
  const response = await fetch(`${zarrUri}/zarr.json`);
  if (!response.ok) throw new Error(`${selected.slug}: OME-Zarr unavailable`);
  const metadata = await response.json();
  if (metadata.attributes?.bia_artwork_display?.version !== 1) throw new Error(`${selected.slug}: unqualified rendering`);
  images.push({ ...selected, description: study.description, licence: study.licence, licenceLabel: licenceLabels[study.licence] || study.licence,
    zarrUri, width: representation.size_x, height: representation.size_y,
    preview: preview.uri, previews });
}
await writeFile(new URL('../src/data/collections/biological-visions.json', import.meta.url), `${JSON.stringify(images, null, 2)}\n`);
const galleriesPath = new URL('../src/data/galleries.json', import.meta.url);
const galleries = JSON.parse(await readFile(galleriesPath));
const entry = { name: 'biological-visions', title: 'Biological Visions',
  subtitle: 'Explore the beauty of life through microscopy', summary_image: images[0].preview };
const existing = galleries.collections.findIndex(collection => collection.name === entry.name);
if (existing >= 0) galleries.collections[existing] = entry;
else galleries.collections.push(entry);
await writeFile(galleriesPath, `${JSON.stringify(galleries, null, 2)}\n`);
console.log(`Verified and exported ${images.length} artwork(s) from ${api.origin}`);
