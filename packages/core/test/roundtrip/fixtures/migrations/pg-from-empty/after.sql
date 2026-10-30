CREATE TYPE mood AS ENUM ('happy', 'sad');
CREATE TABLE people (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, mood mood);
CREATE TABLE pets (id int PRIMARY KEY, owner_id int REFERENCES people (id) ON DELETE CASCADE, name text);
CREATE INDEX pets_owner_idx ON pets (owner_id);
