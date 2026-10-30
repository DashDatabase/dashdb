CREATE TABLE users (id int PRIMARY KEY, full_name text NOT NULL);
CREATE INDEX users_name_idx ON users (full_name);
