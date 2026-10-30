CREATE TABLE users (id int NOT NULL PRIMARY KEY, email varchar(120) NOT NULL) ENGINE=InnoDB;
CREATE TABLE logs (id bigint NOT NULL PRIMARY KEY, line text) ENGINE=InnoDB;
