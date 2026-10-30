CREATE TABLE posts (id int NOT NULL PRIMARY KEY, status enum('draft','review','published','archived') DEFAULT 'draft') ENGINE=InnoDB;
