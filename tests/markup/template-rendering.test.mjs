import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HtmlValidate } from 'html-validate';

const repository = fileURLToPath(new URL('../../', import.meta.url));
let application;
let html;
let logoHtml;
const validator = new HtmlValidate(JSON.parse(await readFile(path.join(repository, 'configs/quality/htmlvalidate.markup.json'), 'utf8')));
after(async () => { if (application) await rm(application, { recursive: true, force: true }); });
before(async () => {
    const output = path.join(repository, 'artifacts/markup-rendering');
    await mkdir(output, { recursive: true });
    application = await mkdtemp(path.join(output, 'application-'));
    await mkdir(path.join(application, 'src/pages'), { recursive: true });
    for (const directory of ['components', 'layouts', 'styles', 'data', 'news', 'content']) {
        await cp(path.join(repository, 'src', directory), path.join(application, 'src', directory), { recursive: true });
    }
    await symlink(path.join(repository, 'src/assets'), path.join(application, 'src/assets'), 'dir');
    await symlink(path.join(repository, 'node_modules'), path.join(application, 'node_modules'), 'dir');
    await cp(path.join(repository, 'src/pages/logos.mdx'), path.join(application, 'src/pages/logos.mdx'));
    await writeFile(path.join(application, 'package.json'), '{"type":"module"}\n');
    await writeFile(path.join(application, 'astro.config.mjs'), `
import { defineConfig, envField } from 'astro/config';
import mdx from '@astrojs/mdx';
export default defineConfig({ cacheDir: './.astro-cache', vite: { cacheDir: './.vite-cache' }, integrations: [mdx()], env: { schema: {
    PUBLIC_SEARCH_API: envField.string({ access: 'public', context: 'client', default: 'https://alpha.bioimagearchive.org/search/v1' }),
    PUBLIC_WEBSITE_STATE: envField.string({ access: 'public', context: 'client', default: 'DEV' }),
    PUBLIC_GTAG: envField.string({ access: 'public', context: 'client', default: '' })
} } });
`);
    await cp(path.join(repository, 'tests/fixtures/api/image-001b8ef2-7a5e-4b94-b91c-d93f5095ee39-response.json'), path.join(application, 'src/data/image-response.json'));
    await cp(path.join(repository, 'tests/fixtures/api/study-s-biad3335-response.json'), path.join(application, 'src/data/study-response.json'));
    await writeFile(path.join(application, 'src/pages/index.astro'), `---
import BaseLayout from '../layouts/BaseLayout.astro';
import DatasetDetail from '../components/DatasetDetail.astro';
import Specimen from '../components/image/Specimen.astro';
import imageResponse from '../data/image-response.json';
import StudyTitleInfo from '../components/study-page/StudyTitleInfo.astro';
import StudyComponents from '../components/ai-gallery/StudyComponents.astro';
import ImageInfo from '../components/ai-gallery/ImageInfo.astro';
import FileListTable from '../components/FileListTable.astro';
import TomogramCard from '../components/cards/TomogramCard.astro';
import VolumeEMImageCard from '../components/cards/VolumeEMImageCard.astro';
import BenchmarkingTable from '../components/ai-benchmarking/BenchmarkingTable.astro';
import News from '../components/News.astro';
import response from '../data/study-response.json';
import fieldMap from '../data/metadata-field-name-mapping.json';
const specimen = imageResponse.hits.hits[0]._source.creation_process.subject;
const study = response.hits.hits.find(hit => hit._source.accession_id === 'S-BIAD3335')._source;
// Minimal props isolate repeated rendering contracts; the study remains a reusable API snapshot.
const annotations = ['dataset-a', 'dataset-b'].map(uuid => ({ dataset_uuid: uuid, dataset_title: uuid, organism: 'Mouse', imaging: 'OPT', annotation_type: 'mask', annotation_method: 'manual' }));
const tomogram = { name: 'Tomogram', uuid: 'tomogram-id', mrcfile_uri: 'https://example.org/tomogram.mrc', attributes: { _annotated_thumbnail_uri: '', _neuroglancer_link: 'https://example.org/neuroglancer', _vizarr_link: 'https://example.org/vizarr', _molstar_link: 'https://example.org/molstar' }, annotation_files: [{ rendering_colour: 'red', name: 'RNA', starfile_uri: 'https://example.org/rna.star' }] };
const volumeImage = { submitted_in_study_accession: 'EMPIAR-12104', label: 'Volume image', uuid: 'volume-id', view_link: 'https://example.org/viewer', ome_zarr_image_uri: 'https://example.org/image.ome.zarr' };
---
<BaseLayout pageTitle="Markup contracts">
    <StudyTitleInfo study_info={study} pdbLinks={'A <a href="https://example.org/pdb">PDB entry</a>'} emdbLinks={'An <a href="https://example.org/emdb">EMDB entry</a>'} />
    <section id="image-specimen"><Specimen specimen={specimen} /></section>
    <section id="biosamples">{study.dataset[0].biological_entity.map(data => <DatasetDetail data={data} fieldMap={fieldMap.biosample} />)}</section>
    <StudyComponents title="Annotated Datasets" id="annotated_datasets" content={annotations} />
    <section id="repeated-image-metadata">{['Source Image', 'Annotation', 'Annotation 2'].map((text, index) => <ImageInfo text={text} btnID={index === 1 ? 'CopyAnnotationButton' : 'CopyImage' + index} url="https://example.org/image.ome.zarr" imageRep={{ size_x: 100, size_y: 200 }} imageAtrributes={{}} />)}</section>
    <FileListTable file_list_urls={{ table_view: 'https://example.org/table', tree_view: 'https://example.org/tree' }} ftp_path="https://example.org/files" globus_link="https://example.org/globus" />
    <TomogramCard tomogram={tomogram} />
    <VolumeEMImageCard image={volumeImage} />
    <BenchmarkingTable tableRows={[]} studyOrModelPageMode="study" />
    <News />
</BaseLayout>
`);
    await promisify(execFile)(process.execPath, [path.join(repository, 'node_modules/astro/astro.js'), 'build', '--root', application], { cwd: application, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    html = await readFile(path.join(application, 'dist/index.html'), 'utf8');
    logoHtml = await readFile(path.join(application, 'dist/logos/index.html'), 'utf8');
});

test('actual shared templates produce valid raw HTML with repeated metadata, cards and news', async () => {
    const report = await validator.validateString(html);
    assert.equal(report.valid, true, JSON.stringify(report.results.flatMap(result => result.messages)));
});

test('rendered anchors retain destinations and buttons retain action hooks', () => {
    for (const href of ['https://example.org/neuroglancer', 'https://example.org/vizarr', 'https://example.org/molstar', 'https://example.org/tomogram.mrc', 'https://example.org/files', 'https://example.org/globus']) {
        assert.ok(html.includes('href="' + href + '"'), href);
    }
    assert.match(html, /<button[^>]*data-view="tree"/);
    assert.match(html, /<button[^>]*id="CopyAnnotationButton"/);
    assert.match(html, /<button[^>]*onclick="copyURI\(this\)"/);
    assert.doesNotMatch(html, /<a[^>]*>\s*<button|<button[^>]*>\s*<a/);
});

test('repeated annotation panels and viewer metadata have distinct dataset and element hooks', () => {
    for (const uuid of ['dataset-a', 'dataset-b']) assert.ok(html.includes('data-annotation-dataset="' + uuid + '"'));
    assert.equal((html.match(/data-annotation-type/g) ?? []).length, 2);
    assert.match(html, /id="annotated-size"/);
    assert.match(html, /id="CopyImage0-size"/);
    assert.match(html, /id="CopyImage2-size"/);
    assert.doesNotMatch(html, /id="annotation-type"|id="annotation-method"/);
    assert.equal((html.match(/id="newsSlides"/g) ?? []).length, 1);
});

test('the footer import uses the supported named target while content stays in the body', () => {
    assert.match(html, /<head>[\s\S]*<link rel="import"[^>]*data-target="embl-contenthub-footer"[^>]*>[\s\S]*<\/head>/);
    assert.match(html, /<body[^>]*>[\s\S]*<div class="embl-contenthub-footer vf-content-hub-html"><\/div>[\s\S]*<\/body>/);
    assert.equal((html.match(/<body(?:\s|>)/g) ?? []).length, 1);
});

test('actual logo MDX renders headings and captions outside implicit Markdown paragraphs', async () => {
    const report = await validator.validateString(logoHtml);
    assert.equal(report.valid, true, JSON.stringify(report.results.flatMap(result => result.messages)));
    assert.equal((logoHtml.match(/download="/g) ?? []).length, 6);
});
