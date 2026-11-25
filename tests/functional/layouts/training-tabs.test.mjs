import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeTrainingTabs } from '../../../src/scripts/training-tabs.js';

function element(id = '') {
    const attributes = new Map();
    const listeners = new Map();
    const classes = new Set();
    return {
        id, attributes, classes, focused: false,
        setAttribute(name, value) { attributes.set(name, value); },
        addEventListener(name, listener) { listeners.set(name, listener); },
        focus() { this.focused = true; },
        classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } },
        fire(name, key) {
            const event = { key, prevented: false, preventDefault() { this.prevented = true; } };
            listeners.get(name)(event);
            return event;
        },
    };
}

function training(hash = '') {
    const panels = [element('vf-tabs__section--1'), element('vf-tabs__section--2')];
    const tabs = panels.map(panel => ({ ...element(), hash: `#${panel.id}`, parentElement: element() }));
    const list = element();
    list.querySelectorAll = selector => {
        assert.equal(selector, '.vf-tabs__link');
        return tabs;
    };
    const listeners = new Map();
    const window = {
        location: { hash },
        history: { pushState(_state, _title, hash) { window.location.hash = hash; } },
        addEventListener(name, listener) { listeners.set(name, listener); },
    };
    initializeTrainingTabs({
        defaultView: window,
        getElementById: id => panels.find(panel => panel.id === id),
        querySelectorAll(selector) { assert.equal(selector, '[data-vf-js-tabs]'); return [list]; },
    });
    return { list, panels, tabs, window, listeners };
}

test('training tabs use valid roles, distinct IDs and matching accessible panel relationships', () => {
    const { list, tabs, panels } = training();
    assert.equal(list.attributes.get('role'), 'tablist');
    for (const [index, tab] of tabs.entries()) {
        assert.equal(tab.attributes.get('role'), 'tab');
        assert.equal(tab.parentElement.attributes.get('role'), 'presentation');
        assert.equal(tab.attributes.get('aria-controls'), panels[index].id);
        assert.equal(panels[index].attributes.get('role'), 'tabpanel');
        assert.equal(panels[index].attributes.get('aria-labelledby'), tab.id);
        assert.equal(panels[index].tabIndex, 0);
    }
    assert.equal(new Set([...tabs, ...panels].map(element => element.id)).size, 4);
    assert.deepEqual(panels.map(panel => panel.hidden), [false, true]);
    assert.deepEqual(tabs.map(tab => tab.tabIndex), [0, -1]);
});

test('clicking a training tab changes the visible panel, selection, focus and URL fragment', () => {
    const { tabs, panels, window } = training();
    assert(tabs[1].fire('click').prevented);
    assert.deepEqual(panels.map(panel => panel.hidden), [true, false]);
    assert.deepEqual(tabs.map(tab => tab.attributes.get('aria-selected')), ['false', 'true']);
    assert.deepEqual(tabs.map(tab => tab.tabIndex), [-1, 0]);
    assert.deepEqual(tabs.map(tab => tab.classes.has('is-active')), [false, true]);
    assert(tabs[1].focused);
    assert.equal(window.location.hash, '#vf-tabs__section--2');
});

test('training tabs support arrow wrapping, Home, End and moving focus into the selected panel', () => {
    const { tabs, panels } = training();
    for (const [current, key, selected] of [
        [0, 'ArrowLeft', 1], [1, 'ArrowRight', 0], [0, 'End', 1], [1, 'Home', 0],
    ]) {
        assert(tabs[current].fire('keydown', key).prevented);
        assert.equal(tabs[selected].attributes.get('aria-selected'), 'true');
        assert.equal(panels[selected].hidden, false);
        assert(tabs[selected].focused);
    }
    assert(tabs[0].fire('keydown', 'ArrowDown').prevented);
    assert(panels[0].focused);
    assert.equal(tabs[0].fire('keydown', 'Tab').prevented, false);
});

test('training tabs honor initial fragments and follow browser history and fragment changes', () => {
    const { panels, window, listeners } = training('#vf-tabs__section--2');
    assert.deepEqual(panels.map(panel => panel.hidden), [true, false]);
    window.location.hash = '#vf-tabs__section--1';
    listeners.get('popstate')();
    assert.deepEqual(panels.map(panel => panel.hidden), [false, true]);
    window.location.hash = '#vf-tabs__section--2';
    listeners.get('hashchange')();
    assert.deepEqual(panels.map(panel => panel.hidden), [true, false]);
});
