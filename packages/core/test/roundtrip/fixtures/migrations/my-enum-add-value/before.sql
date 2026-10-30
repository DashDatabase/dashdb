CREATE TABLE posts (id int NOT NULL PRIMARY KEY, status enum('draft','published') DEFAULT 'draft') ENGINE=InnoDB;
