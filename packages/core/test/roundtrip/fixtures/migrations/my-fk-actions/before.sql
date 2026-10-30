CREATE TABLE authors (id int NOT NULL PRIMARY KEY) ENGINE=InnoDB;
CREATE TABLE books (id int NOT NULL PRIMARY KEY, author_id int, editor_id int,
  CONSTRAINT books_author_fk FOREIGN KEY (author_id) REFERENCES authors (id)) ENGINE=InnoDB;
