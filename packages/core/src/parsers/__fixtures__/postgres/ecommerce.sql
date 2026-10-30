-- E-commerce catalog and orders.
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded');

CREATE TABLE customers (
  id serial PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  first_name varchar(100),
  last_name varchar(100),
  marketing_opt_in boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE addresses (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  line1 text NOT NULL,
  line2 text,
  city varchar(100) NOT NULL,
  postal_code varchar(20) NOT NULL,
  country_code char(2) NOT NULL,
  is_default boolean NOT NULL DEFAULT false
);

CREATE TABLE categories (
  id serial PRIMARY KEY,
  parent_id integer REFERENCES categories (id),
  slug varchar(120) NOT NULL UNIQUE,
  name varchar(120) NOT NULL
);

CREATE TABLE products (
  id serial PRIMARY KEY,
  category_id integer REFERENCES categories (id) ON DELETE SET NULL,
  sku varchar(64) NOT NULL UNIQUE,
  title varchar(255) NOT NULL,
  description text,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE TABLE product_variants (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  sku varchar(64) NOT NULL,
  option_values jsonb NOT NULL,
  price_override numeric(12,2),
  stock integer NOT NULL DEFAULT 0,
  CONSTRAINT product_variants_stock_check CHECK (stock >= 0),
  UNIQUE (product_id, sku)
);

CREATE TABLE orders (
  id bigserial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers (id),
  shipping_address_id integer REFERENCES addresses (id),
  status order_status NOT NULL DEFAULT 'pending',
  subtotal numeric(12,2) NOT NULL,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  placed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total = subtotal + tax)
);

CREATE TABLE order_items (
  order_id bigint NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  line_no smallint NOT NULL,
  variant_id integer NOT NULL REFERENCES product_variants (id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL,
  PRIMARY KEY (order_id, line_no)
);

CREATE INDEX products_category_idx ON products (category_id) WHERE active;
CREATE INDEX orders_customer_placed_idx ON orders (customer_id, placed_at DESC);
CREATE INDEX orders_open_idx ON orders (placed_at) WHERE status IN ('pending', 'paid');
CREATE INDEX products_title_trgm_idx ON products USING gin (title gin_trgm_ops);
