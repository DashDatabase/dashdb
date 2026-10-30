CREATE TABLE clients (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, email varchar(255) NOT NULL, name text) ENGINE=InnoDB;
CREATE TABLE orders (
  id int NOT NULL PRIMARY KEY, customer_id int, status enum('new','open','paid') NOT NULL DEFAULT 'open', total decimal(12,2),
  notes text COMMENT 'Internal',
  CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES clients (id) ON DELETE CASCADE) ENGINE=InnoDB COMMENT='Orders';
CREATE INDEX orders_total_status ON orders (total, status);
CREATE TABLE refunds (
  id int NOT NULL PRIMARY KEY, order_id int NOT NULL, amount decimal(12,2) NOT NULL,
  CONSTRAINT refunds_order_fk FOREIGN KEY (order_id) REFERENCES orders (id), CONSTRAINT refunds_amount_chk CHECK (amount > 0)) ENGINE=InnoDB;
