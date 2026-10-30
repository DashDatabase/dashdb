CREATE TABLE users (id int NOT NULL PRIMARY KEY, name varchar(100) NOT NULL) ENGINE=InnoDB;
CREATE INDEX users_name_idx ON users (name);
