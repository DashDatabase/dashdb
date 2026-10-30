CREATE TABLE invoices (id int NOT NULL PRIMARY KEY, status enum('draft','paid') NOT NULL DEFAULT 'draft') ENGINE=InnoDB;
