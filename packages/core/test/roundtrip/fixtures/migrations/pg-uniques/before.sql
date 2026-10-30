CREATE TABLE users (id int PRIMARY KEY, email text, handle text, CONSTRAINT users_handle_key UNIQUE (handle));
