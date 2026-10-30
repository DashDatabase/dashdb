// A small schema with every kind of relationship the canvas draws.
import { parsePostgresDDL, type Schema, type Table } from '@dashdb/core';

export const SHOP_SQL = `
CREATE TABLE customers (
  id bigint PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text
);
CREATE TABLE orders (
  id bigint PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  coupon_id bigint,
  note text
);
CREATE TABLE profiles (
  customer_id bigint PRIMARY KEY REFERENCES customers (id),
  bio text
);
CREATE TABLE coupons (
  id bigint PRIMARY KEY,
  parent_id bigint REFERENCES coupons (id),
  code varchar(20) NOT NULL
);
CREATE INDEX orders_note_idx ON orders (note);
`;

export function shopSchema(): Schema {
  return parsePostgresDDL(SHOP_SQL).schema;
}

export function table(schema: Schema, name: string): Table {
  const found = schema.tables.find((t) => t.name === name);
  if (!found) throw new Error(`no table ${name}`);
  return found;
}

export function columnId(schema: Schema, tableName: string, column: string): string {
  const found = table(schema, tableName).columns.find((c) => c.name === column);
  if (!found) throw new Error(`no column ${tableName}.${column}`);
  return found.id;
}
