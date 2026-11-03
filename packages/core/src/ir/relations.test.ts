import { describe, expect, it } from 'vitest';
import { parsePostgresDDL } from '../parsers';
import { cardinality, columnFlags, isUniqueSet } from './relations';
import type { Schema, Table } from './types';

const schema: Schema = parsePostgresDDL(`
  CREATE TABLE customers (id bigint PRIMARY KEY, email text NOT NULL UNIQUE, name text);
  CREATE TABLE orders (
    id bigint PRIMARY KEY,
    customer_id bigint NOT NULL REFERENCES customers (id),
    coupon_id bigint REFERENCES customers (id),
    code text
  );
  CREATE UNIQUE INDEX orders_code_key ON orders (code);
  CREATE UNIQUE INDEX orders_partial ON orders (coupon_id) WHERE code IS NOT NULL;
  CREATE TABLE profiles (customer_id bigint PRIMARY KEY REFERENCES customers (id), bio text);
  CREATE TABLE tags (name text NOT NULL UNIQUE);
`).schema;

function table(name: string): Table {
  const found = schema.tables.find((t) => t.name === name);
  if (!found) throw new Error(name);
  return found;
}
const columnId = (t: Table, name: string) => t.columns.find((c) => c.name === name)?.id ?? '';

describe('columnFlags', () => {
  it('marks primary keys, foreign keys, unique and nullable columns', () => {
    const customers = table('customers');
    expect(customers.columns.map((c) => [c.name, columnFlags(customers, c)])).toEqual([
      ['id', { pk: true, fk: false, unique: false, nullable: false }],
      ['email', { pk: false, fk: false, unique: true, nullable: false }],
      ['name', { pk: false, fk: false, unique: false, nullable: true }],
    ]);
  });

  it('counts full unique indexes as unique, but not partial ones', () => {
    const orders = table('orders');
    const flags = (name: string) => {
      const column = orders.columns.find((c) => c.name === name);
      if (!column) throw new Error(name);
      return columnFlags(orders, column);
    };
    expect(flags('code').unique).toBe(true);
    expect(flags('coupon_id')).toMatchObject({ fk: true, unique: false, nullable: true });
  });
});

describe('isUniqueSet', () => {
  it('matches the primary key, unique constraints and full unique indexes in any order', () => {
    const orders = table('orders');
    expect(isUniqueSet(orders, [columnId(orders, 'id')])).toBe(true);
    expect(isUniqueSet(orders, [columnId(orders, 'code')])).toBe(true);
    expect(isUniqueSet(orders, [columnId(orders, 'coupon_id')])).toBe(false);
    expect(isUniqueSet(orders, [columnId(orders, 'id'), columnId(orders, 'code')])).toBe(false);
    const customers = table('customers');
    expect(isUniqueSet(customers, [columnId(customers, 'email')])).toBe(true);
    expect(isUniqueSet(customers, [columnId(customers, 'name')])).toBe(false);
  });

  it('handles tables without a primary key', () => {
    const tags = table('tags');
    expect(isUniqueSet(tags, [columnId(tags, 'name')])).toBe(true);
  });
});

describe('cardinality', () => {
  it('reads one-to-many, optional and one-to-one ends from keys and nullability', () => {
    const orders = table('orders');
    const [required, optional] = orders.foreignKeys;
    if (!required || !optional) throw new Error('foreign keys');
    expect(cardinality(orders, required)).toEqual({ sourceEnd: 'many', targetEnd: 'one' });
    expect(cardinality(orders, optional)).toEqual({ sourceEnd: 'many', targetEnd: 'zero-one' });
    const profiles = table('profiles');
    const [profile] = profiles.foreignKeys;
    if (!profile) throw new Error('profile key');
    expect(cardinality(profiles, profile)).toEqual({ sourceEnd: 'zero-one', targetEnd: 'one' });
  });

  it('treats a key column missing from the table as required', () => {
    const orders = table('orders');
    const [required] = orders.foreignKeys;
    if (!required) throw new Error('foreign key');
    const dangling = { ...required, columns: ['missing'] };
    expect(cardinality(orders, dangling)).toEqual({ sourceEnd: 'many', targetEnd: 'one' });
  });
});
