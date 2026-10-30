import { describe, expect, it } from 'vitest';
import {
  fromNativeType,
  parseMysqlEnumValues,
  toNativeType,
  type TypeMapContext,
} from './types-map';
import type { LogicalType } from './types';

const ctx: TypeMapContext = {
  enums: [
    { id: 'e_mood', name: 'Mood', namespace: 'ns', values: ['happy', 'sad'] },
    {
      id: 'e_quote',
      name: 'quoted',
      namespace: 'ns',
      values: ["it's", 'back\\slash', 'Upper Case'],
    },
  ],
};

/** Canonical native spellings: native → logical → native must reproduce them exactly. */
const CANONICAL: Record<'postgres' | 'mysql', [string, LogicalType][]> = {
  postgres: [
    ['integer', { kind: 'int' }],
    ['bigint', { kind: 'bigint' }],
    ['numeric(10,2)', { kind: 'decimal', precision: 10, scale: 2 }],
    ['text', { kind: 'text' }],
    ['varchar(255)', { kind: 'varchar', length: 255 }],
    ['boolean', { kind: 'boolean' }],
    ['uuid', { kind: 'uuid' }],
    ['jsonb', { kind: 'json' }],
    ['timestamp', { kind: 'timestamp', withTimeZone: false }],
    ['timestamptz', { kind: 'timestamp', withTimeZone: true }],
    ['date', { kind: 'date' }],
    ['bytea', { kind: 'bytes' }],
    ['Mood', { kind: 'enum', enumId: 'e_mood' }],
  ],
  mysql: [
    ['int', { kind: 'int' }],
    ['bigint', { kind: 'bigint' }],
    ['decimal(10,2)', { kind: 'decimal', precision: 10, scale: 2 }],
    ['text', { kind: 'text' }],
    ['varchar(255)', { kind: 'varchar', length: 255 }],
    ['tinyint(1)', { kind: 'boolean' }],
    ['char(36)', { kind: 'uuid' }],
    ['json', { kind: 'json' }],
    ['datetime', { kind: 'timestamp', withTimeZone: false }],
    ['timestamp', { kind: 'timestamp', withTimeZone: true }],
    ['date', { kind: 'date' }],
    ['blob', { kind: 'bytes' }],
    ["enum('happy','sad')", { kind: 'enum', enumId: 'e_mood' }],
    ["enum('it''s','back\\\\slash','Upper Case')", { kind: 'enum', enumId: 'e_quote' }],
  ],
};

/** Accepted alternative spellings, which normalize to the logical type shown. */
const ALIASES: Record<'postgres' | 'mysql', [string, LogicalType][]> = {
  postgres: [
    ['int', { kind: 'int' }],
    ['INT4', { kind: 'int' }],
    ['smallint', { kind: 'int' }],
    ['int2', { kind: 'int' }],
    ['serial', { kind: 'int' }],
    ['serial4', { kind: 'int' }],
    ['smallserial', { kind: 'int' }],
    ['serial2', { kind: 'int' }],
    ['int8', { kind: 'bigint' }],
    ['bigserial', { kind: 'bigint' }],
    ['serial8', { kind: 'bigint' }],
    ['decimal(12, 4)', { kind: 'decimal', precision: 12, scale: 4 }],
    ['numeric(8)', { kind: 'decimal', precision: 8, scale: 0 }],
    ['character varying(40)', { kind: 'varchar', length: 40 }],
    ['varchar', { kind: 'text' }],
    ['character varying', { kind: 'text' }],
    ['bool', { kind: 'boolean' }],
    ['json', { kind: 'json' }],
    ['timestamp without time zone', { kind: 'timestamp', withTimeZone: false }],
    ['  timestamp(3)   with time zone ', { kind: 'timestamp', withTimeZone: true }],
    ['timestamptz(6)', { kind: 'timestamp', withTimeZone: true }],
  ],
  mysql: [
    ['int(11)', { kind: 'int' }],
    ['integer', { kind: 'int' }],
    ['mediumint', { kind: 'int' }],
    ['smallint', { kind: 'int' }],
    ['tinyint', { kind: 'int' }],
    ['tinyint(4)', { kind: 'int' }],
    ['tinyint unsigned', { kind: 'int' }],
    ['smallint(5) unsigned', { kind: 'int' }],
    ['mediumint unsigned', { kind: 'int' }],
    ['int(10) unsigned', { kind: 'bigint' }],
    ['integer unsigned', { kind: 'bigint' }],
    ['bigint(20)', { kind: 'bigint' }],
    ['bigint unsigned', { kind: 'decimal', precision: 20, scale: 0 }],
    ['BOOLEAN', { kind: 'boolean' }],
    ['bool', { kind: 'boolean' }],
    ['numeric(5,1)', { kind: 'decimal', precision: 5, scale: 1 }],
    ['dec(5)', { kind: 'decimal', precision: 5, scale: 0 }],
    ['fixed(6,2)', { kind: 'decimal', precision: 6, scale: 2 }],
    ['decimal', { kind: 'decimal', precision: 10, scale: 0 }],
    ['tinytext', { kind: 'text' }],
    ['mediumtext', { kind: 'text' }],
    ['longtext', { kind: 'text' }],
    ['tinyblob', { kind: 'bytes' }],
    ['mediumblob', { kind: 'bytes' }],
    ['longblob', { kind: 'bytes' }],
    ['binary(16)', { kind: 'bytes' }],
    ['varbinary(255)', { kind: 'bytes' }],
    ["enum( 'happy' , 'sad' )", { kind: 'enum', enumId: 'e_mood' }],
  ],
};

/** Native types with no logical equivalent. */
const UNMAPPED: Record<'postgres' | 'mysql', string[]> = {
  postgres: [
    'point',
    'integer[]',
    'numeric',
    'numeric(a,b)',
    'numeric(1,2,3)',
    'numeric(2,3)',
    'numeric(0)',
    'varchar(0)',
    'varchar(1,2)',
    'mood',
    'interval',
  ],
  mysql: [
    "set('a')",
    'char(10)',
    'char',
    'varchar',
    'year',
    "enum('happy')",
    "enum('sad','happy')",
    'enum',
    'enum()',
    'enum(happy)',
    "enum('happy'",
    "enum('happy' 'sad')",
    "enum('a\\)",
  ],
};

describe.each(['postgres', 'mysql'] as const)('%s type mapping', (dialect) => {
  it.each(CANONICAL[dialect])('round-trips %s', (native, logical) => {
    expect(fromNativeType(dialect, native, ctx)).toEqual(logical);
    expect(toNativeType(dialect, logical, ctx)).toBe(native);
  });

  it.each(ALIASES[dialect])('normalizes %s', (native, logical) => {
    expect(fromNativeType(dialect, native, ctx)).toEqual(logical);
    // A second round trip through the canonical spelling is stable.
    const canonical = toNativeType(dialect, logical, ctx);
    expect(fromNativeType(dialect, canonical, ctx)).toEqual(logical);
  });

  it.each(UNMAPPED[dialect])('returns null for %s', (native) => {
    expect(fromNativeType(dialect, native, ctx)).toBeNull();
  });

  it('throws for the unknown logical type', () => {
    expect(() => toNativeType(dialect, { kind: 'unknown' }, ctx)).toThrow(/nativeType/);
  });

  it('throws when an enum type references an unknown enum', () => {
    expect(() => toNativeType(dialect, { kind: 'enum', enumId: 'e_gone' }, ctx)).toThrow(
      /Unknown enum e_gone/,
    );
  });
});

describe('parseMysqlEnumValues', () => {
  it('handles doubled quotes, backslash escapes and spacing', () => {
    expect(parseMysqlEnumValues(" 'a' ,'it''s','x\\'y'")).toEqual(['a', "it's", "x'y"]);
  });

  it('returns null for malformed lists', () => {
    expect(parseMysqlEnumValues('')).toBeNull();
    expect(parseMysqlEnumValues("'a',")).toBeNull();
    expect(parseMysqlEnumValues("'a")).toBeNull();
  });
});
