CREATE TABLE users (id int PRIMARY KEY, email text);
CREATE TABLE posts (id int PRIMARY KEY, user_id int REFERENCES users (id));
