CREATE TABLE people (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, name varchar(100) NOT NULL, mood enum('happy','sad')) ENGINE=InnoDB;
CREATE TABLE pets (id int NOT NULL PRIMARY KEY, owner_id int, name varchar(50),
  CONSTRAINT pets_owner_fk FOREIGN KEY (owner_id) REFERENCES people (id) ON DELETE CASCADE) ENGINE=InnoDB;
CREATE INDEX pets_name_idx ON pets (name);
