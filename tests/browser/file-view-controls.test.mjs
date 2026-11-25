import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeFileListViewer } from '../../src/scripts/file-list-viewer.js';

function controls({ omics = false, observe = true, readyState = 'loading', separateContainers = false } = {}) {
  class HTMLElement { blur() {} }
  class HTMLIFrameElement extends HTMLElement {}
  const buttons = (omics ? [] : ['table', 'tree']).map(view => Object.assign(new HTMLElement(), {
    dataset: { view }, pressed: view === 'table' ? 'true' : 'false',
    setAttribute(name, value) { assert.equal(name, 'aria-pressed'); this.pressed = value; },
  }));
  const frames = (omics ? ['table'] : ['table', 'tree']).map(view => {
    const classes = new Set(view === 'table' ? ['is-active'] : []);
    let src = '';
    const frame = Object.assign(new HTMLIFrameElement(), {
      dataset: { src: `https://example.org/${view}` }, classes, navigations: 0,
      classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } },
    });
    Object.defineProperty(frame, 'src', {
      get: () => src,
      set(value) { src = value; frame.navigations++; },
    });
    return frame;
  });
  const groups = separateContainers ? frames.map(frame => [frame]) : [frames];
  const containers = groups.map(group => ({ querySelectorAll: () => group }));
  const observers = [];
  const clicks = [];
  const events = new Map();
  const window = {
    HTMLElement, HTMLIFrameElement,
    addEventListener(event, handler, options) { events.set(event, { handler, options }); },
  };
  if (observe) window.IntersectionObserver = class {
    constructor(callback, options) {
      assert.equal(options.rootMargin, '1200px 0px');
      this.callback = callback;
      observers.push(this);
    }
    observe(container) { assert(containers.includes(container)); this.container = container; }
    disconnect() { this.disconnected = true; }
  };
  const document = {
    defaultView: window, readyState,
    querySelectorAll(selector) {
      if (selector === '.file-list-viewer-frame') return containers;
      if (selector === '.file-list-viewer') return frames;
      assert.equal(selector, '.file-list-view-button'); return buttons;
    },
    getElementById(id) { return frames[['file-list-table-viewer', 'file-list-tree-viewer'].indexOf(id)]; },
    addEventListener(event, handler) { assert.equal(event, 'click'); clicks.push(handler); },
  };
  initializeFileListViewer(document);
  function select(view) {
    const target = Object.assign(new HTMLElement(), {
      closest(selector) { assert.equal(selector, '.file-list-view-button'); return buttons.find(button => button.dataset.view === view); },
    });
    let prevented = false;
    clicks.forEach(click => click({ target, preventDefault() { prevented = true; } }));
    return prevented;
  }
  return { document, buttons, frames, select, observers, events, clicks };
}

test('file views switch the actual iframe and preserve matching pressed state', () => {
  const { buttons, frames, select } = controls();
  assert(select('tree'));
  assert.deepEqual(buttons.map(button => button.pressed), ['false', 'true']);
  assert.deepEqual(frames.map(frame => frame.classes.has('is-active')), [false, true]);
  assert.deepEqual(frames.map(frame => frame.src), ['https://example.org/table', 'https://example.org/tree']);
  assert(select('table'));
  assert.deepEqual(buttons.map(button => button.pressed), ['true', 'false']);
  assert.deepEqual(frames.map(frame => frame.classes.has('is-active')), [true, false]);
  assert.deepEqual(frames.map(frame => frame.navigations), [1, 1]);
});

test('unrelated clicks leave the existing file view state untouched', () => {
  const { buttons, frames, select } = controls();
  assert.equal(select('unrelated'), false);
  assert.deepEqual(buttons.map(button => button.pressed), ['true', 'false']);
  assert(frames.every(frame => frame.src === ''));
});

test('omics iframe loads once when it enters view', () => {
  const { frames: [iframe], observers: [observer] } = controls({ omics: true });
  assert.equal(iframe.navigations, 0);
  observer.callback([{ isIntersecting: false }]);
  assert.equal(iframe.navigations, 0);
  assert.equal(observer.disconnected, undefined);
  observer.callback([{ isIntersecting: true }]);
  assert.equal(iframe.src, 'https://example.org/table');
  assert.equal(observer.disconnected, true);
  observer.callback([{ isIntersecting: true }]);
  assert.equal(iframe.navigations, 1);
});

test('each file-list container loads independently when entering view', () => {
  const { frames, observers } = controls({ separateContainers: true });
  observers[0].callback([{ isIntersecting: true }]);
  assert.deepEqual(frames.map(frame => frame.navigations), [1, 0]);
  observers[1].callback([{ isIntersecting: true }]);
  assert.deepEqual(frames.map(frame => frame.navigations), [1, 1]);
});

test('both component initializers share one observer and click listener', () => {
  const page = controls();
  initializeFileListViewer(page.document);
  assert.equal(page.observers.length, 1);
  assert.equal(page.clicks.length, 1);
});

test('without IntersectionObserver the file list loads on window load', () => {
  const { frames, events } = controls({ observe: false });
  assert(frames.every(frame => frame.navigations === 0));
  assert.equal(events.get('load').options.once, true);
  events.get('load').handler();
  assert.deepEqual(frames.map(frame => frame.navigations), [1, 1]);
});

test('without IntersectionObserver an already loaded document loads its file list immediately', () => {
  const { frames, events } = controls({ observe: false, readyState: 'complete' });
  assert.deepEqual(frames.map(frame => frame.navigations), [1, 1]);
  assert.equal(events.size, 0);
});
