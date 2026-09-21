export type DatePrecision = 'month' | 'date';
export interface CalendarValue {
  year: number;
  month: number;
  day?: number;
  iso: string;
  precision: DatePrecision;
}
export function parseCalendarValue(value: string): CalendarValue | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = match[3] === undefined ? undefined : Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  const days = new Date(Date.UTC(year === 1 ? 2001 : year, month, 0)).getUTCDate();
  if (day !== undefined && (day < 1 || day > days)) return null;
  return {
    year,
    month,
    ...(day === undefined ? {} : { day }),
    iso: value,
    precision: day === undefined ? 'month' : 'date',
  };
}
export function readCalendarText(value: string): string | null {
  // Display formatting is normalized, never interpreted as a timezone timestamp.
  const match = /^\s*(\d{4})\s*[-/年.]\s*(\d{1,2})(?:\s*[-/月.]\s*(\d{1,2})\s*日?)?\s*月?\s*$/.exec(
    value,
  );
  if (!match) return null;
  const iso = `${match[1]}-${match[2]!.padStart(2, '0')}${match[3] ? `-${match[3].padStart(2, '0')}` : ''}`;
  return parseCalendarValue(iso)?.iso ?? null;
}
export function sameValue(actual: string, expected: string): boolean {
  return actual.normalize('NFC').trim() === expected.normalize('NFC').trim();
}
/** Numeric equivalence is limited to a known date part, never arbitrary options. */
export function datePartNumber(value: string, part: 'year' | 'month'): number | null {
  const match = (part === 'year' ? /^(\d{1,4})\s*年?$/ : /^(\d{1,2})\s*月?$/).exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 && number <= (part === 'month' ? 12 : 9999) ? number : null;
}
export function samePath(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((part, index) => sameValue(part, expected[index]!))
  );
}
export function sameSet(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((value) => actual.includes(value))
  );
}
