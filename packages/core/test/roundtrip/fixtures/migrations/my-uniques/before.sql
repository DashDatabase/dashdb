CREATE TABLE users (id int NOT NULL PRIMARY KEY, email varchar(100), handle varchar(40), CONSTRAINT users_handle_key UNIQUE (handle)) ENGINE=InnoDB;
