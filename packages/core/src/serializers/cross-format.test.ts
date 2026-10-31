import { describe, expect, it } from 'vitest';
import type { Schema } from '../ir/types';
import { parseMySQLDDL, parsePostgresDDL } from '../parsers';
import { loadFixtures, reversed } from './__test-utils__/fixtures';
import { toDBML, toDrizzle, toMySQLDDL, toPostgresDDL, toPrisma } from '.';
import type { SerializeResult } from './types';

/*
 * Every fixture serialized to every format: nothing throws, output is deterministic (also
 * when the input lists tables, enums and namespaces in another order), and what a format
 * cannot express is reported as a warning rather than silently dropped.
 */

const SERIALIZERS: Record<string, (schema: Schema) => SerializeResult | Promise<SerializeResult>> =
  {
    postgres: toPostgresDDL,
    mysql: toMySQLDDL,
    prisma: toPrisma,
    drizzle: toDrizzle,
    dbml: toDBML,
  };

const fixtures = loadFixtures();
const cases = fixtures.flatMap((f) => Object.keys(SERIALIZERS).map((target) => ({ ...f, target })));

describe('cross-format serialization', () => {
  it.each(cases)('$format/$file → $target', async ({ schema, target }) => {
    const serialize = SERIALIZERS[target] as (typeof SERIALIZERS)[string];
    const first = await serialize(schema);
    const again = await serialize(schema);
    const shuffled = await serialize(reversed(schema));
    expect(again).toEqual(first);
    expect(shuffled.code).toBe(first.code);
    if (!(target === 'drizzle' && schema.dialect === 'sqlite'))
      expect(first.code.length).toBeGreaterThan(0);
  });

  const find = (format: string, file: string) => {
    const fixture = fixtures.find((f) => f.format === format && f.file === file);
    if (!fixture) throw new Error(`missing fixture ${format}/${file}`);
    return fixture.schema;
  };
  const messages = (result: SerializeResult) =>
    result.warnings.map((w) => `${w.element}: ${w.message}`);

  it('reports what Prisma cannot express', () => {
    const result = toPrisma(find('postgres', 'ecommerce.sql'));
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        'public.products.products_price_check: Prisma has no CHECK constraints; dropped',
        'public.orders.orders_open_idx: Prisma has no partial indexes; WHERE dropped',
        'public.products.products_title_trgm_idx: gin index needs an operator class Prisma cannot infer; dropped',
      ]),
    );
  });

  it('reports what DBML cannot express', () => {
    const result = toDBML(find('postgres', 'saas-multitenant.sql'));
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        'public.organizations.organizations_active_idx: DBML has no index sort order; dropped',
        'public.audit_events.audit_events_payload_idx: DBML has no "gin" index type; dropped',
      ]),
    );
  });

  it('warns about types without an equivalent when changing dialect', () => {
    const result = toMySQLDDL(find('postgres', 'alter-and-comments.sql'));
    expect(messages(result)).toContain(
      'public.warehouses.location: Type "point" has no mysql equivalent; kept verbatim',
    );
  });

  it('keeps types both dialects share without a warning', () => {
    const result = toMySQLDDL(parsePostgresDDL('CREATE TABLE t (code char(4), at time);').schema);
    expect(result.code).toContain('code char(4)');
    expect(result.code).toContain('at time');
    expect(messages(result)).toEqual([]);
  });

  it('renames float types to their counterpart in the other dialect', () => {
    const toMy = toMySQLDDL(
      parsePostgresDDL('CREATE TABLE t (a real, b double precision);').schema,
    );
    expect(toMy.code).toContain('a float');
    expect(toMy.code).toContain('b double');
    const toPg = toPostgresDDL(parseMySQLDDL('CREATE TABLE t (a float, b double, y year);').schema);
    expect(toPg.code).toContain('a real');
    expect(toPg.code).toContain('b double precision');
    expect(toPg.code).toContain('y smallint');
    expect([...messages(toMy), ...messages(toPg)]).toEqual([]);
  });

  it('flags expression defaults written for the other dialect, but not portable ones', () => {
    const pg = parsePostgresDDL(`CREATE TABLE t (
      id uuid DEFAULT gen_random_uuid(),
      at timestamptz DEFAULT now(),
      day date DEFAULT CURRENT_DATE
    );`).schema;
    expect(messages(toMySQLDDL(pg))).toEqual([
      'public.t.id: Default "gen_random_uuid()" was written for postgres and is copied as is; check it works in mysql',
    ]);
    // Same dialect: nothing to flag.
    expect(messages(toPostgresDDL(pg))).toEqual([]);
    const mysql = parseMySQLDDL(
      'CREATE TABLE t (id char(36) DEFAULT (UUID()), at datetime DEFAULT CURRENT_TIMESTAMP);',
    ).schema;
    expect(messages(toPostgresDDL(mysql))).toEqual([
      expect.stringMatching(/^default\.t\.id: Default "\(?UUID\(\)\)?" was written for mysql/),
    ]);
  });

  it('refuses SQLite for Drizzle with a warning', async () => {
    const result = await toDrizzle(find('prisma', 'ecommerce-sqlite.prisma'));
    expect(result).toEqual({
      code: '',
      warnings: [
        {
          code: 'unsupported-feature',
          element: '',
          message: 'Drizzle output supports postgres and mysql only',
        },
      ],
    });
  });
});
