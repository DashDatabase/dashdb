CREATE TABLE authors (id int NOT NULL PRIMARY KEY) ENGINE=InnoDB;
CREATE TABLE books (id int NOT NULL PRIMARY KEY, author_id int, editor_id int,
  CONSTRAINT books_author_fk FOREIGN KEY (author_id) REFERENCES authors (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT books_editor_fk FOREIGN KEY (editor_id) REFERENCES authors (id) ON DELETE SET NULL) ENGINE=InnoDB;
