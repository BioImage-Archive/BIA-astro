import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Execute the component's own slideshow logic with controlled DOM and timer inputs.
const sourceUrl = new URL("../../src/components/News.astro", import.meta.url);
let source;
try {
  source = await readFile(sourceUrl, "utf8");
} catch (error) {
  throw new Error("The news component source is required to verify its actual inline slideshow script.", { cause: error });
}
const scripts = [...source.matchAll(/<script\s+type=["']module["']\s*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1,
  "Expected one inline module script; changes to the component script require adapting this harness.");
const clientScript = scripts[0][1];

function createHarness(count) {
  const slides = Array.from({ length: count }, () => ({ style: { display: "" } }));
  const intervals = new Map();
  let nextTimer = 0;
  const window = {
    setInterval(callback, delay) {
      const id = ++nextTimer;
      intervals.set(id, { callback, delay });
      return id;
    },
  };
  const clearInterval = (id) => intervals.delete(id);
  window.clearInterval = clearInterval;
  const context = vm.createContext({
    window, clearInterval,
    document: {
      getElementsByClassName(name) {
        assert.equal(name, "news-article");
        return slides;
      },
    },
  });
  new vm.Script('"use strict";\n' + clientScript, { filename: "News.astro inline script" })
    .runInContext(context, { timeout: 1000 });
  return {
    window, intervals,
    visible() { return slides.flatMap((slide, index) => slide.style.display === "block" ? [index] : []); },
    tick() { for (const { callback } of [...intervals.values()]) callback(); },
  };
}

test("initializes the newest, zero-indexed slide before autoplay", () => {
  assert.deepEqual(createHarness(4).visible(), [0]);
});

test("next traverses older items and wraps from oldest to newest", () => {
  const app = createHarness(4);
  for (const index of [1, 2, 3, 0]) {
    app.window.nextNewsSlide();
    assert.deepEqual(app.visible(), [index]);
  }
});

test("previous wraps from newest to oldest and moves toward newer items", () => {
  const app = createHarness(4);
  for (const index of [3, 2, 1, 0]) {
    app.window.prevNewsSlide();
    assert.deepEqual(app.visible(), [index]);
  }
});

test("autoplay keeps its interval and moves from newest to second newest", () => {
  const app = createHarness(4);
  assert.equal(app.intervals.size, 1);
  assert.equal([...app.intervals.values()][0].delay, 5000);
  app.tick();
  assert.deepEqual(app.visible(), [1]);
});

test("manual navigation pauses autoplay as before", () => {
  const app = createHarness(4);
  app.window.nextNewsSlide();
  assert.equal(app.intervals.size, 0);
  const selected = app.visible();
  app.tick();
  assert.deepEqual(app.visible(), selected);
});

test("a one-item collection remains usable without changing selection", () => {
  const app = createHarness(1);
  assert.deepEqual(app.visible(), [0]);
  app.tick();
  app.window.nextNewsSlide();
  app.window.prevNewsSlide();
  assert.deepEqual(app.visible(), [0]);
});

test("an empty collection does not throw during initialization or navigation", () => {
  const app = createHarness(0);
  app.tick();
  app.window.nextNewsSlide();
  app.window.prevNewsSlide();
  assert.deepEqual(app.visible(), []);
});
