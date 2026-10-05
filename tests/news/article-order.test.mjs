import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { articleDateKey, sortNewsByDate } from "../../src/news/article-order.mjs";

// Entry IDs deliberately differ from date order to catch filename-based sorting.
const exampleEntries = [
  { id: "microscopy-access", data: { articleDate: "2 November 2023" } },
  { id: "ai-analysis", data: { articleDate: "13 October 2025" } },
  { id: "ai4life", data: { articleDate: "17 September 2025" } },
  { id: "elixir", data: { articleDate: "12 January 2026" } },
];
const expected = ["elixir", "ai-analysis", "ai4life", "microscopy-access"];
const ids = (entries) => entries.map((entry) => entry.id);
const item = (id, articleDate) => ({ id, data: { articleDate } });

function permutations(values) {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, i) => i !== index)).map((tail) => [value, ...tail]),
  );
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
for (const [index, month] of months.entries()) {
  test(`parses the full English month ${month}`, () => {
    assert.equal(articleDateKey(`1 ${month} 2026`), 20260001 + (index + 1) * 100);
  });
}

test("supports a zero-padded day without changing its meaning", () => {
  assert.equal(articleDateKey("02 November 2023"), articleDateKey("2 November 2023"));
});

test("validates leap years, including Gregorian century rules", () => {
  assert.equal(articleDateKey("29 February 2024"), 20240229);
  assert.equal(articleDateKey("29 February 2000"), 20000229);
  assert.equal(articleDateKey("29 February 1900"), null);
  assert.equal(articleDateKey("29 February 2100"), null);
});

test("supports valid four-digit years 0001 through 9999", () => {
  assert.equal(articleDateKey("1 January 0001"), 10101);
  assert.equal(articleDateKey("31 December 9999"), 99991231);
});

const invalidValues = [
  undefined, null, false, 0, 20260112, {}, [], new Date("2026-01-12T00:00:00Z"),
  "", " ", "not a date", "0 January 2026", "32 January 2026",
  "31 April 2026", "29 February 2025", "30 February 2024",
  "1 Foo 2026", "1 january 2026", "1 Jan 2026", "1 January 0000",
  "1 January 26", "1 January 10000", "2026-01-12", "12/01/2026",
  " 12 January 2026", "12 January 2026 ", "12  January 2026",
  "12 January 2026T00:00:00Z",
  "12 January 2026\n", "12 January 2026\r\n",
];
for (const [index, value] of invalidValues.entries()) {
  test(`rejects invalid editorial date case ${index + 1}: ${String(value)}`, () => {
    assert.equal(articleDateKey(value), null);
  });
}

test("orders the observed four dates from newest to oldest", () => {
  assert.deepEqual(ids(sortNewsByDate(exampleEntries)), expected);
});

test("all 24 input permutations produce the same chronology", () => {
  for (const input of permutations(exampleEntries)) {
    assert.deepEqual(ids(sortNewsByDate(input)), expected);
  }
});

test("same-day ties are deterministic even when input order changes", () => {
  const input = ["zeta", "alpha", "beta"].map((id) => item(id, "12 January 2026"));
  for (const permutation of permutations(input)) {
    assert.deepEqual(ids(sortNewsByDate(permutation)), ["alpha", "beta", "zeta"]);
  }
});

test("same-day IDs use code-unit order rather than locale collation", () => {
  const input = ["éclair", "alpha", "Zeta"].map((id) => item(id, "12 January 2026"));
  assert.deepEqual(ids(sortNewsByDate(input)), ["Zeta", "alpha", "éclair"]);
});

test("primary date order overrides alphabetical ID order", () => {
  const input = [item("aaa-old", "1 January 2025"), item("zzz-new", "1 January 2026")];
  assert.deepEqual(ids(sortNewsByDate(input)), ["zzz-new", "aaa-old"]);
});

test("handles days, months and years chronologically, not lexically", () => {
  const input = [
    item("december", "31 December 2025"), item("february", "1 February 2026"),
    item("day-two", "2 January 2026"), item("day-ten", "10 January 2026"),
  ];
  assert.deepEqual(ids(sortNewsByDate(input)), ["february", "day-ten", "day-two", "december"]);
});

test("does not mutate the input array, dates, entries or render methods", () => {
  const render = async () => "content";
  const input = Object.freeze(exampleEntries.map((entry) => Object.freeze({
    ...entry, data: Object.freeze({ ...entry.data }), render,
  })));
  const before = ids(input);
  const output = sortNewsByDate(input);
  assert.notEqual(output, input);
  assert.deepEqual(ids(input), before);
  for (const result of output) {
    assert.equal(result, input.find((entry) => entry.id === result.id));
    assert.equal(result.render, render);
  }
});

test("empty collection returns a fresh empty array", () => {
  const input = [];
  const output = sortNewsByDate(input);
  assert.deepEqual(output, []);
  assert.notEqual(output, input);
});

test("valid singleton retains the same entry object", () => {
  assert.equal(sortNewsByDate([exampleEntries[0]])[0], exampleEntries[0]);
});

test("invalid singleton is rejected before a sort comparator could be skipped", () => {
  assert.throws(() => sortNewsByDate([item("bad-entry", "31 February 2026")]),
    /Invalid articleDate for news entry "bad-entry"/);
});

test("a missing articleDate is not silently assigned today or epoch zero", () => {
  assert.throws(() => sortNewsByDate([{ id: "missing-date", data: {} }]),
    /Invalid articleDate for news entry "missing-date"/);
});

test("sorting does not introduce scheduled-publication filtering", () => {
  const input = [...exampleEntries, item("future", "1 January 2099")];
  const output = sortNewsByDate(input);
  assert.equal(output.length, input.length);
  assert.equal(output[0].id, "future");
});

test("repeated sorting is idempotent", () => {
  const once = sortNewsByDate(exampleEntries);
  assert.deepEqual(sortNewsByDate(once), once);
});

test("Promise.all preserves sorted order even when rendering resolves backwards", async () => {
  const sorted = sortNewsByDate(exampleEntries);
  const resolvers = [];
  const pending = sorted.map((entry) => new Promise((resolve) => {
    resolvers.push(() => resolve(entry.id));
  }));
  const result = Promise.all(pending);
  for (const resolve of resolvers.reverse()) resolve();
  assert.deepEqual(await result, expected);
});

test("date keys and ordering do not change with the process timezone", () => {
  const moduleUrl = new URL("../../src/news/article-order.mjs", import.meta.url).href;
  const program = `
    import { articleDateKey, sortNewsByDate } from ${JSON.stringify(moduleUrl)};
    const input = ${JSON.stringify(exampleEntries)};
    console.log(JSON.stringify({
      key: articleDateKey("12 January 2026"),
      ids: sortNewsByDate(input).map(entry => entry.id)
    }));
  `;
  const outputs = ["UTC", "Pacific/Honolulu", "Europe/Stockholm", "Pacific/Kiritimati"].map((TZ) => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
      env: { ...process.env, TZ }, encoding: "utf8", timeout: 5000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    return child.stdout;
  });
  assert.ok(outputs.every((value) => value === outputs[0]));
});
