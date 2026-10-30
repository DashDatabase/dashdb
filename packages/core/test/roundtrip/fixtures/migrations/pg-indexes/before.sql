CREATE TABLE posts (id int PRIMARY KEY, author int, title text, published_at timestamptz, deleted_at timestamptz);
CREATE INDEX posts_title_idx ON posts (title);
