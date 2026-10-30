CREATE TABLE users (id int PRIMARY KEY, name text NOT NULL);
CREATE INDEX users_name_idx ON users (name);
