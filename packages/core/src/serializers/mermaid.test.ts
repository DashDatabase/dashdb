import { describe, expect, it } from 'vitest';
import { parsePostgresDDL } from '../parsers';
import type { Schema } from '../ir/types';
import { toMermaid } from './mermaid';

const SHOP_SQL = `
CREATE TABLE customers (id bigint PRIMARY KEY, email text NOT NULL UNIQUE, name text);
CREATE TABLE orders (
  id bigint PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  coupon_id bigint,
  note text
);
CREATE TABLE profiles (customer_id bigint PRIMARY KEY REFERENCES customers (id), bio text);
CREATE TABLE coupons (
  id bigint PRIMARY KEY,
  parent_id bigint REFERENCES coupons (id),
  code varchar(20) NOT NULL
);
CREATE INDEX orders_note_idx ON orders (note);
`;

const shopSchema = () => parsePostgresDDL(SHOP_SQL).schema;
const mermaid = (schema: Schema) => toMermaid(schema).code;

describe('toMermaid', () => {
  it('draws entities with typed, keyed attributes and relationships', () => {
    expect(mermaid(shopSchema())).toMatchInlineSnapshot(`
      "erDiagram
        customers {
          bigint id PK
          text email UK
          text name
        }
        orders {
          bigint id PK
          bigint customer_id FK
          bigint coupon_id
          text note
        }
        profiles {
          bigint customer_id PK, FK
          text bio
        }
        coupons {
          bigint id PK
          bigint parent_id FK
          varchar(20) code
        }
        customers ||--o{ orders : "orders_customer_id_fkey"
        customers ||--o| profiles : "profiles_customer_id_fkey"
        coupons |o--o{ coupons : "coupons_parent_id_fkey"
      "
    `);
  });

  it('cleans identifiers and types, and quotes labels it cannot represent', () => {
    const { schema } = parsePostgresDDL(`
      CREATE TABLE "Order Items" ("unit price" numeric(10, 2), "2fa" timestamp with time zone);
      COMMENT ON COLUMN "Order Items"."unit price" IS 'Say "hi"
      twice';
      CREATE TABLE "Order-Items" (id int);
      CREATE TABLE "Order_Items" (id int);
    `);
    const lines = mermaid(schema).split('\n');
    expect(lines).toContain('  Order_Items["Order Items"] {');
    expect(lines).toContain(`    numeric(10_2) unit_price "Say 'hi' twice"`);
    expect(lines).toContain('    timestamp_with_time_zone _2fa');
    expect(lines).toContain('  Order-Items {');
    expect(lines).toContain('  Order_Items_2["Order_Items"] {');
  });

  it('writes an empty block for a table without columns', () => {
    const { schema } = parsePostgresDDL('CREATE TABLE empty (id int);');
    const [table] = schema.tables;
    if (!table) throw new Error('no table');
    expect(mermaid({ ...schema, tables: [{ ...table, columns: [] }] })).toBe(
      'erDiagram\n  empty {\n  }\n',
    );
  });

  it('prefixes namespaces when a schema has several', () => {
    const { schema } = parsePostgresDDL(`
      CREATE SCHEMA billing;
      CREATE TABLE public.users (id int PRIMARY KEY);
      CREATE TABLE billing.users (id int PRIMARY KEY, owner int REFERENCES public.users (id));
    `);
    const text = mermaid(schema);
    expect(text).toContain('public_users["public.users"]');
    expect(text).toContain('billing_users["billing.users"]');
    expect(text).toContain('public_users |o--o{ billing_users');
  });

  it('warns about what an ER diagram leaves out', () => {
    const { schema } = parsePostgresDDL(`
      CREATE TYPE mood AS ENUM ('ok', 'sad');
      CREATE TABLE people (id int PRIMARY KEY, mood mood DEFAULT 'ok', age int CHECK (age > 0));
      CREATE INDEX people_age_idx ON people (age);
    `);
    const { code, warnings } = toMermaid(schema);
    expect(code).toContain('mood mood');
    expect(warnings.map((w) => w.message)).toEqual([
      'Mermaid ER diagrams have no enums; columns show the enum name as their type',
      'Mermaid ER diagrams show tables, keys and relationships only; indexes, check constraints, defaults are left out',
    ]);
    // The shop schema's only loss is the index on orders, reported once.
    expect(toMermaid(shopSchema()).warnings.map((w) => w.message)).toEqual([
      'Mermaid ER diagrams show tables, keys and relationships only; indexes are left out',
    ]);
  });
});
