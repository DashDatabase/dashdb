CREATE TABLE parents (id int NOT NULL PRIMARY KEY) ENGINE=InnoDB;
CREATE TABLE children (id int NOT NULL PRIMARY KEY, parent_id int,
  CONSTRAINT children_parent_fk FOREIGN KEY (parent_id) REFERENCES parents (id)) ENGINE=InnoDB;
