CREATE TABLE memberships (id int NOT NULL, team_id int NOT NULL, user_id int NOT NULL, PRIMARY KEY (team_id, user_id));
CREATE TABLE tags (name text PRIMARY KEY);
