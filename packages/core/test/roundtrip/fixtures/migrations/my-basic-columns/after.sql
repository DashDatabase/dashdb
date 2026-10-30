CREATE TABLE users (
  id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email varchar(120) NOT NULL,
  name varchar(80),
  active tinyint(1) NOT NULL DEFAULT 1,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE INDEX users_name_idx ON users (name);
