// Starter schemas for "New from template", written as Postgres DDL and parsed by @dashdb/core.
import { createSchema, type Schema } from '@dashdb/core/lite';

export interface Template {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sql: string;
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'An empty Postgres schema.',
    sql: '',
  },
  {
    id: 'blog',
    name: 'Blog',
    description: 'Users, posts, comments and tags.',
    sql: `
CREATE TYPE post_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE users (
  id bigserial PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  display_name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id bigserial PRIMARY KEY,
  author_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title varchar(200) NOT NULL,
  body text NOT NULL,
  status post_status NOT NULL DEFAULT 'draft',
  published_at timestamptz
);

CREATE TABLE comments (
  id bigserial PRIMARY KEY,
  post_id bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_id bigint REFERENCES users (id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tags (
  id serial PRIMARY KEY,
  name varchar(50) NOT NULL UNIQUE
);

CREATE TABLE post_tags (
  post_id bigint NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  tag_id integer NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
`,
  },
  {
    id: 'saas',
    name: 'SaaS',
    description: 'Organizations, members, plans and subscriptions.',
    sql: `
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  name varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  slug varchar(60) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE plans (
  id serial PRIMARY KEY,
  name varchar(50) NOT NULL UNIQUE,
  monthly_price numeric(10,2) NOT NULL
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  plan_id integer NOT NULL REFERENCES plans (id),
  status subscription_status NOT NULL,
  current_period_end timestamptz NOT NULL
);
`,
  },
  {
    id: 'ecommerce',
    name: 'E-commerce',
    description: 'Customers, products, orders and line items.',
    sql: `
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'canceled');

CREATE TABLE customers (
  id bigserial PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  name varchar(100) NOT NULL
);

CREATE TABLE products (
  id bigserial PRIMARY KEY,
  sku varchar(40) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  price numeric(10,2) NOT NULL,
  stock integer NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id bigserial PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES customers (id),
  status order_status NOT NULL DEFAULT 'pending',
  placed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  order_id bigint NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id bigint NOT NULL REFERENCES products (id),
  quantity integer NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
`,
  },
];

/** Builds a fresh schema (new ids) from a template; the SQL parser loads on first use. */
export async function schemaFromTemplate(template: Template): Promise<Schema> {
  if (!template.sql.trim()) {
    const schema = createSchema('postgres');
    return { ...schema, namespaces: [{ id: `${schema.id}_public`, name: 'public' }] };
  }
  const { parsePostgresDDL } = await import('@dashdb/core/parsers');
  return parsePostgresDDL(template.sql).schema;
}
