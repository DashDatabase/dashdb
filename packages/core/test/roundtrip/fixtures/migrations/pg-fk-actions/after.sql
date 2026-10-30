CREATE TABLE authors (id int PRIMARY KEY);
CREATE TABLE books (id int PRIMARY KEY, author_id int CONSTRAINT books_author_fk REFERENCES authors (id) ON DELETE CASCADE ON UPDATE CASCADE, editor_id int CONSTRAINT books_editor_fk REFERENCES authors (id) ON DELETE SET NULL);
