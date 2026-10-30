CREATE TYPE status AS ENUM ('draft', 'paid', 'void');
CREATE TYPE visibility AS ENUM ('public', 'private');
CREATE TABLE users (id serial PRIMARY KEY, email text, name text, legacy text);
CREATE TABLE posts (
  id int PRIMARY KEY, user_id int REFERENCES users, s status DEFAULT 'draft',
  v visibility NOT NULL DEFAULT 'public', title text, slug text);
CREATE INDEX posts_title ON posts (title);
CREATE TABLE audit_log (id bigint PRIMARY KEY, note text);
