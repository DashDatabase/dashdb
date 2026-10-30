-- Three schemas with cross-schema foreign keys and a schema-qualified enum.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TYPE billing.invoice_status AS ENUM ('draft', 'open', 'paid', 'void');

CREATE TABLE auth.accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text,
  mfa_enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE auth.sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES auth.accounts (id) ON DELETE CASCADE,
  user_agent text,
  expires_at timestamptz NOT NULL
);

CREATE TABLE billing.customers (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE REFERENCES auth.accounts (id),
  stripe_customer_id varchar(64) UNIQUE
);

CREATE TABLE billing.invoices (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES billing.customers (id),
  status billing.invoice_status NOT NULL DEFAULT 'draft',
  amount_cents integer NOT NULL,
  issued_at timestamptz
);

CREATE TABLE app.workspaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.accounts (id),
  billing_customer_id uuid REFERENCES billing.customers (id) ON DELETE SET NULL,
  name text NOT NULL
);

-- Same table name as auth.accounts, different schema: not a duplicate.
CREATE TABLE app.accounts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES app.workspaces (id) ON DELETE CASCADE,
  label text NOT NULL
);

CREATE INDEX sessions_account_idx ON auth.sessions (account_id);
CREATE INDEX invoices_open_idx ON billing.invoices (customer_id) WHERE status = 'open';
