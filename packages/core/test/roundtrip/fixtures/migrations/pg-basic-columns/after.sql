CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL,
  name varchar(80),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_name_idx ON users (name);
