CREATE TABLE memberships (id int NOT NULL, team_id int NOT NULL, user_id int NOT NULL, PRIMARY KEY (team_id, user_id)) ENGINE=InnoDB;
CREATE TABLE tags (name varchar(50) NOT NULL PRIMARY KEY) ENGINE=InnoDB;
