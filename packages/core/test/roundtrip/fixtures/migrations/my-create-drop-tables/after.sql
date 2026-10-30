CREATE TABLE users (id int NOT NULL PRIMARY KEY, email varchar(120) NOT NULL) ENGINE=InnoDB;
CREATE TABLE posts (id int NOT NULL PRIMARY KEY, user_id int NOT NULL, title varchar(200) NOT NULL,
  CONSTRAINT posts_user_fk FOREIGN KEY (user_id) REFERENCES users (id)) ENGINE=InnoDB;
