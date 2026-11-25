import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeImageMetadata } from '../../src/scripts/image-metadata.js';

function page(height = 500) {
  const elements = new Map();
  for (const id of ['meta-wrap', 'meta-content', 'meta-toggle', 'file-path-extra', 'file-path-toggle']) {
    const attributes = new Map([['aria-expanded', 'false']]);
    elements.set(id, {
      dataset: {}, style: {}, scrollHeight: height, hidden: true,
      getAttribute: name => attributes.get(name),
      setAttribute: (name, value) => attributes.set(name, value),
      remove() { elements.delete(id); },
    });
  }
  const document = { getElementById: id => elements.get(id) };
  initializeImageMetadata(document);
  return { document, elements };
}

test('long image metadata reveals its toggle and expands and collapses with matching accessible state', () => {
  const { elements } = page();
  const wrap = elements.get('meta-wrap');
  const content = elements.get('meta-content');
  const toggle = elements.get('meta-toggle');
  assert.equal(toggle.hidden, false);
  assert.equal(wrap.dataset.collapsed, 'true');
  assert.equal(content.style.maxHeight, '250px');
  toggle.onclick();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.innerText, 'See less');
  assert.equal(wrap.dataset.collapsed, 'false');
  assert.equal(content.style.maxHeight, '');
  toggle.onclick();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.innerText, 'See more');
  assert.equal(wrap.dataset.collapsed, 'true');
  assert.equal(content.style.maxHeight, '250px');
});

test('metadata that fits within the limit has no redundant toggle or height restriction', () => {
  for (const height of [0, 250]) {
    const { elements } = page(height);
    assert.equal(elements.has('meta-toggle'), false);
    assert.equal(elements.get('meta-content').style.maxHeight, undefined);
  }
});

test('image file paths expand and collapse independently of short metadata', () => {
  const { elements } = page(100);
  const extra = elements.get('file-path-extra');
  const toggle = elements.get('file-path-toggle');
  toggle.onclick();
  assert.equal(extra.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(toggle.innerText, 'See less');
  toggle.onclick();
  assert.equal(extra.hidden, true);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.innerText, 'See more');
});

test('reinitializing the same image preserves expanded state and does not replace handlers', () => {
  const { document, elements } = page();
  const toggle = elements.get('meta-toggle');
  const handler = toggle.onclick;
  toggle.onclick();
  initializeImageMetadata(document);
  assert.equal(toggle.onclick, handler);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(elements.get('meta-content').style.maxHeight, '');
});

test('image controls tolerate pages with no metadata or file paths', () => {
  assert.doesNotThrow(() => initializeImageMetadata({ getElementById: () => null }));
});
