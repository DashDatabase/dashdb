CREATE TABLE posts (id int NOT NULL PRIMARY KEY, author int, title varchar(200), body text, published_at datetime) ENGINE=InnoDB;
CREATE INDEX posts_title_idx ON posts (title);
