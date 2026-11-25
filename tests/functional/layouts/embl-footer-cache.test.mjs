import assert from 'node:assert/strict';
import { test } from 'node:test';

const moduleUrl = new URL('../../../src/server/embl-footer.mjs', import.meta.url);

test('concurrent and later footer renders reuse a single completed HTML response', async t => {
    let release;
    const response = new Promise(resolve => { release = resolve; });
    const fetch = t.mock.method(globalThis, 'fetch', (_url, options) => {
        assert(options.signal instanceof AbortSignal);
        return response;
    });
    const { getEmblFooterHtml } = await import(moduleUrl.href + '?concurrent');
    const first = getEmblFooterHtml();
    const second = getEmblFooterHtml();
    assert.equal(first, second);
    assert.equal(fetch.mock.callCount(), 1);
    release(new Response('<footer>EMBL</footer>'));
    assert.deepEqual(await Promise.all([first, second]), ['<footer>EMBL</footer>', '<footer>EMBL</footer>']);
    assert.equal(await getEmblFooterHtml(), '<footer>EMBL</footer>');
    assert.equal(fetch.mock.callCount(), 1);
});

test('an unsuccessful footer response is reported and can be retried', async t => {
    let attempts = 0;
    const fetch = t.mock.method(globalThis, 'fetch', async () =>
        ++attempts === 1 ? new Response('', { status: 503 }) : new Response('Recovered footer'));
    const { getEmblFooterHtml } = await import(moduleUrl.href + '?http-error');
    await assert.rejects(getEmblFooterHtml(), /Failed to fetch EMBL footer: 503/);
    assert.equal(await getEmblFooterHtml(), 'Recovered footer');
    assert.equal(fetch.mock.callCount(), 2);
});

test('a timed-out request is reported and does not permanently poison the footer cache', async t => {
    const timeout = new DOMException('Timed out', 'TimeoutError');
    let attempts = 0;
    const fetch = t.mock.method(globalThis, 'fetch', async () => {
        if (++attempts === 1) throw timeout;
        return new Response('Recovered footer');
    });
    const { getEmblFooterHtml } = await import(moduleUrl.href + '?timeout');
    await assert.rejects(getEmblFooterHtml(), error => error === timeout);
    assert.equal(await getEmblFooterHtml(), 'Recovered footer');
    assert.equal(fetch.mock.callCount(), 2);
});
