const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Parse the existing editorial format, e.g. "12 January 2026".
 * No implementation-dependent Date parsing or timezone conversion is involved.
 * @param {unknown} value
 * @returns {number | null} YYYYMMDD sort key, or null for an invalid date.
 */
export function articleDateKey(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(value);
  if (!match || match[0] !== value) return null;

  const day = Number(match[1]);
  const month = MONTH_NAMES.indexOf(match[2]) + 1;
  const year = Number(match[3]);
  if (month === 0 || year === 0) return null;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return null;

  return year * 10000 + month * 100 + day;
}

/**
 * Return a new array, newest first, with an entry-ID tie-breaker.
 * Entry objects are retained unchanged, including Astro's render() method.
 * Validate every entry before sorting, including a one-entry collection.
 * @template {{id: string, data: {articleDate?: unknown}}} T
 * @param {readonly T[]} entries Astro collection entries with unique IDs.
 * @returns {T[]}
 */
export function sortNewsByDate(entries) {
  return entries
    .map((entry) => {
      const key = articleDateKey(entry.data.articleDate);
      if (key === null) {
        throw new Error(
          `Invalid articleDate for news entry ${JSON.stringify(entry.id)}: ` +
          `${JSON.stringify(entry.data.articleDate)}. Expected a real date ` +
          'in "D Month YYYY" format, for example "12 January 2026".',
        );
      }
      return { entry, key };
    })
    .sort((a, b) => {
      const byDate = b.key - a.key;
      if (byDate !== 0) return byDate;
      // Explicit code-unit comparison avoids depending on the host's locale.
      if (a.entry.id < b.entry.id) return -1;
      if (a.entry.id > b.entry.id) return 1;
      return 0;
    })
    .map(({ entry }) => entry);
}
