CREATE TABLE posts (id int NOT NULL PRIMARY KEY, author int, title varchar(200), body text, published_at datetime) ENGINE=InnoDB;
CREATE UNIQUE INDEX posts_author_title_key ON posts (author, title);
CREATE INDEX posts_recent_idx ON posts (published_at DESC);
CREATE FULLTEXT INDEX posts_body_ft ON posts (body);
