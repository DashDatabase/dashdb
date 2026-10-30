CREATE TABLE customers (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, email varchar(100), name text, legacy text) ENGINE=InnoDB;
CREATE TABLE orders (
  id int NOT NULL PRIMARY KEY, customer_id int, status enum('new','paid','void') DEFAULT 'new', total decimal(10,2),
  CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id)) ENGINE=InnoDB;
CREATE INDEX orders_total ON orders (total);
CREATE TABLE audit_log (id bigint NOT NULL PRIMARY KEY, note text) ENGINE=InnoDB;
