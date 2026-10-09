import assert from "node:assert/strict";
import test from "node:test";
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

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
test("parses full English months, padded days and four-digit year boundaries", () => {
  for (const [index, month] of months.entries()) {
    assert.equal(articleDateKey(`1 ${month} 2026`), 20260001 + (index + 1) * 100);
  }
  assert.equal(articleDateKey("02 November 2023"), articleDateKey("2 November 2023"));
  assert.equal(articleDateKey("1 January 0001"), 10101);
  assert.equal(articleDateKey("31 December 9999"), 99991231);
});

test("validates leap years, including Gregorian century rules", () => {
  assert.equal(articleDateKey("29 February 2024"), 20240229);
  assert.equal(articleDateKey("29 February 2000"), 20000229);
  assert.equal(articleDateKey("29 February 2025"), null);
  assert.equal(articleDateKey("29 February 1900"), null);
  assert.equal(articleDateKey("29 February 2100"), null);
});

test("rejects missing, non-string, malformed and impossible dates", () => {
  const invalidValues = [
    undefined, null, 20260112, {}, "", "not a date",
    "0 January 2026", "32 January 2026", "31 April 2026", "30 February 2024",
    "1 Foo 2026", "1 january 2026", "1 Jan 2026", "1 January 0000",
    "1 January 26", "1 January 10000", "2026-01-12",
    " 12 January 2026", "12 January 2026 ", "12  January 2026",
    "12 January 2026\n", "12 January 2026\r\n",
  ];
  for (const value of invalidValues) {
    assert.equal(articleDateKey(value), null, `Unexpected valid date: ${JSON.stringify(value)}`);
  }
});

test("orders shuffled dates newest first across days, months and years", () => {
  const input = [...exampleEntries, item("day-two", "2 January 2026"), item("day-ten", "10 January 2026")];
  assert.deepEqual(ids(sortNewsByDate(input)), [
    "elixir", "day-ten", "day-two", "ai-analysis", "ai4life", "microscopy-access",
  ]);
});

test("same-day IDs have deterministic code-unit order despite input order", () => {
  const input = ["éclair", "alpha", "Zeta"].map((id) => item(id, "12 January 2026"));
  assert.deepEqual(ids(sortNewsByDate(input)), ["Zeta", "alpha", "éclair"]);
  assert.deepEqual(ids(sortNewsByDate([...input].reverse())), ["Zeta", "alpha", "éclair"]);
});

test("does not mutate the input array, dates, entries or render methods", () => {
  const render = async () => "content";
  const input = Object.freeze(exampleEntries.map((entry) => Object.freeze({
    ...entry, data: Object.freeze({ ...entry.data }), render,
  })));
  const before = ids(input);
  const output = sortNewsByDate(input);
  assert.notEqual(output, input);
  assert.deepEqual(ids(output), expected);
  assert.deepEqual(ids(input), before);
  for (const result of output) {
    assert.equal(result, input.find((entry) => entry.id === result.id));
    assert.equal(result.render, render);
  }
});

test("empty and singleton collections retain their contracts and validate dates", () => {
  const input = [];
  const output = sortNewsByDate(input);
  assert.deepEqual(output, []);
  assert.notEqual(output, input);
  assert.equal(sortNewsByDate([exampleEntries[0]])[0], exampleEntries[0]);
  assert.throws(() => sortNewsByDate([item("bad-entry", "31 February 2026")]),
    /Invalid articleDate for news entry "bad-entry"/);
  assert.throws(() => sortNewsByDate([{ id: "missing-date", data: {} }]),
    /Invalid articleDate for news entry "missing-date"/);
});

test("sorting does not introduce scheduled-publication filtering", () => {
  const input = [...exampleEntries, item("future", "1 January 2099")];
  const output = sortNewsByDate(input);
  assert.equal(output.length, input.length);
  assert.equal(output[0].id, "future");
});
