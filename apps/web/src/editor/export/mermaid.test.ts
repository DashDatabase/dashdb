import { parsePostgresDDL } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { shopSchema } from '../canvas/test-schema';
import { toMermaid } from './mermaid';

describe('toMermaid', () => {
  it('draws entities with typed, keyed attributes and relationships', () => {
    expect(toMermaid(shopSchema())).toMatchInlineSnapshot(`
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
    const lines = toMermaid(schema).split('\n');
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
    expect(toMermaid({ ...schema, tables: [{ ...table, columns: [] }] })).toBe(
      'erDiagram\n  empty {\n  }\n',
    );
  });

  it('prefixes namespaces when a schema has several', () => {
    const { schema } = parsePostgresDDL(`
      CREATE SCHEMA billing;
      CREATE TABLE public.users (id int PRIMARY KEY);
      CREATE TABLE billing.users (id int PRIMARY KEY, owner int REFERENCES public.users (id));
    `);
    const text = toMermaid(schema);
    expect(text).toContain('public_users["public.users"]');
    expect(text).toContain('billing_users["billing.users"]');
    expect(text).toContain('public_users |o--o{ billing_users');
  });
});
