-- A small blog with authors, posts, tags and threaded comments.
CREATE TABLE authors (
  id integer PRIMARY KEY,
  handle varchar(40) NOT NULL UNIQUE,
  bio text,
  avatar_url text
);

CREATE TABLE posts (
  id integer PRIMARY KEY,
  author_id integer NOT NULL REFERENCES authors,
  slug varchar(200) NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  published boolean NOT NULL DEFAULT FALSE,
  published_at date,
  view_count bigint NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id integer PRIMARY KEY,
  label varchar(50) NOT NULL UNIQUE
);

CREATE TABLE post_tags (
  post_id integer NOT NULL REFERENCES posts ON DELETE CASCADE,
  tag_id integer NOT NULL REFERENCES tags ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE comments (
  id integer PRIMARY KEY,
  post_id integer NOT NULL REFERENCES posts ON DELETE CASCADE,
  parent_id integer REFERENCES comments,
  author_name varchar(100) NOT NULL,
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX posts_published_idx ON posts (published_at DESC NULLS LAST) WHERE published;
CREATE INDEX comments_post_idx ON comments (post_id, created_at);
