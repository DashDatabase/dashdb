// Human-readable text for IR elements and timestamps, shared across the editor UI.
import type { Column, Id, SchemaProblem } from '@dashdb/core';

/** Column defaults as SQL text; literals are shown the way they would be written in DDL. */
export function describeDefault(column: Column): string {
  const value = column.default;
  if (!value) return '';
  switch (value.kind) {
    case 'expression':
      return value.sql;
    case 'sequence':
      return `nextval('${value.name}')`;
    case 'literal':
      if (value.value === null) return 'NULL';
      if (typeof value.value === 'string') return `'${value.value.replaceAll("'", "''")}'`;
      return String(value.value);
  }
}

/** The table a validation problem belongs to, so the problem list can jump to it. */
export function problemTableId(problem: SchemaProblem): Id | null {
  return 'tableId' in problem ? problem.tableId : null;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 minutes ago", "yesterday", or "just now" for anything under a minute. */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.round((timestamp - now) / 1000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}
