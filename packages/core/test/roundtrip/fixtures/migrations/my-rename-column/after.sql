CREATE TABLE users (id int NOT NULL PRIMARY KEY, full_name varchar(100) NOT NULL) ENGINE=InnoDB;
CREATE INDEX users_name_idx ON users (full_name);
