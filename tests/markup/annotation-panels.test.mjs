import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/components/ai-gallery/SourceAnnotatedImage.astro', import.meta.url), 'utf8');
const script = source.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

function runViewer({ missingProtocol = false } = {}) {
    const annotations = ['dataset-a', 'dataset-b'].map((dataset, index) => ({
        uuid: `image-${index}`, submission_dataset_uuid: dataset,
        representation: [{ image_format: '.ome.zarr', size_x: 100 + index, size_y: 200,
            size_c: 1, size_t: 1, voxel_physical_size_x: 1e-6, voxel_physical_size_y: 1e-6,
            file_uri: [`https://example.org/${dataset}.ome.zarr`] }],
        additional_metadata: [{ name: 'attributes_from_file_reference', value: { attributes: { 'N<C': '<img src=x> & literal' } } }],
    }));
    const panels = ['dataset-a', 'dataset-b'].map(dataset => {
        const fields = { '[data-annotation-type]': { innerText: 'authored type' }, '[data-annotation-method]': { innerText: 'authored method' } };
        return { dataset: { annotationDataset: dataset }, fields, querySelector: selector => fields[selector] };
    });
    const nodes = new Map();
    for (const id of ['annotated-size', 'annotated-pixels', 'annotated-channels', 'annotated-timesteps', 'AnnotatedImageLength', 'OpenAnnotationInVizarr', 'OpenAnnotationInITK']) nodes.set(id, { innerText: 'untouched' });
    nodes.set('CopyAnnotationButton', { dataset: {} });
    nodes.set('slider', { children: annotations.map(image => ({ id: image.uuid })), style: {} });
    const metadata = { children: [], innerHTML: '', appendChild(node) { this.children.push(node); } };
    nodes.set('annotated-metadata', metadata);
    for (const [id, data] of Object.entries({ 'images-length': annotations.length, 'images-json': annotations, 'study-json': panels.map(panel => ({ uuid: panel.dataset.annotationDataset, annotation_process: missingProtocol ? [] : [{ title: panel.dataset.annotationDataset, annotation_criteria: 'criteria-' + panel.dataset.annotationDataset }] })) })) {
        nodes.set(id, { textContent: JSON.stringify(data) });
    }
    const window = {};
    vm.runInNewContext(script, { window, URL, document: {
        getElementById: id => nodes.get(id),
        querySelectorAll: selector => { assert.equal(selector, '[data-annotation-dataset]'); return panels; },
        createElement: tag => ({ tag, children: [], textContent: '', append(...children) { this.children.push(...children); } }),
        createTextNode: text => ({ textContent: text }),
    } });
    return { window, nodes, panels, metadata };
}

test('the real annotation script targets the selected dataset and preserves other panels', () => {
    const { window, panels, nodes } = runViewer();
    assert.equal(panels[0].fields['[data-annotation-type]'].innerText, 'dataset-a');
    assert.equal(panels[1].fields['[data-annotation-type]'].innerText, 'authored type');
    window.slide(1);
    assert.equal(panels[1].fields['[data-annotation-type]'].innerText, 'dataset-b');
    assert.equal(panels[1].fields['[data-annotation-method]'].innerText, 'criteria-dataset-b');
    assert.equal(panels[0].fields['[data-annotation-type]'].innerText, 'dataset-a');
    assert.equal(nodes.get('annotated-pixels').innerText, '101 x 200 pixels');
    assert.equal(nodes.get('CopyAnnotationButton').dataset.url, 'https://example.org/dataset-b.ome.zarr');
    assert.equal(new URL(nodes.get('OpenAnnotationInVizarr').href).searchParams.get('source'), 'https://example.org/dataset-b.ome.zarr');
    window.slide(1);
    assert.equal(nodes.get('annotated-pixels').innerText, '100 x 200 pixels');
});

test('missing annotation protocols retain the empty fallback without a lookup error', () => {
    const { panels, window } = runViewer({ missingProtocol: true });
    window.slide(1);
    for (const panel of panels) {
        assert.equal(panel.fields['[data-annotation-type]'].innerText, '');
        assert.equal(panel.fields['[data-annotation-method]'].innerText, '');
    }
});
