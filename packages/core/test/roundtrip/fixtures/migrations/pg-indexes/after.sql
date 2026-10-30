CREATE TABLE posts (id int PRIMARY KEY, author int, title text, published_at timestamptz, deleted_at timestamptz);
CREATE UNIQUE INDEX posts_author_title_key ON posts (author, title);
CREATE INDEX posts_recent_idx ON posts (published_at DESC);
CREATE INDEX posts_live_idx ON posts (author) WHERE deleted_at IS NULL;
CREATE INDEX posts_nulls_idx ON posts (published_at NULLS FIRST);
