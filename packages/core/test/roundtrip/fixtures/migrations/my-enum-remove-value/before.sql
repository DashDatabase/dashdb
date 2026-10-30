CREATE TABLE invoices (id int NOT NULL PRIMARY KEY, status enum('draft','void','paid') NOT NULL DEFAULT 'draft') ENGINE=InnoDB;
INSERT INTO invoices VALUES (1, 'paid');
