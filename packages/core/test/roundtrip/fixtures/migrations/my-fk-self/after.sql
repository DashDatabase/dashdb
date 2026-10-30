CREATE TABLE employees (id int NOT NULL PRIMARY KEY, manager_id int,
  CONSTRAINT employees_manager_fk FOREIGN KEY (manager_id) REFERENCES employees (id)) ENGINE=InnoDB;
