CREATE TABLE members (id int NOT NULL PRIMARY KEY, email varchar(100)) ENGINE=InnoDB;
CREATE TABLE posts (id int NOT NULL PRIMARY KEY, user_id int, CONSTRAINT posts_user_fk FOREIGN KEY (user_id) REFERENCES members (id)) ENGINE=InnoDB;
