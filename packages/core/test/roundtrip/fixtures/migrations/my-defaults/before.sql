CREATE TABLE jobs (id int NOT NULL PRIMARY KEY, attempts int DEFAULT 0, state varchar(20) DEFAULT 'new', run_at datetime, note varchar(20) DEFAULT 'x') ENGINE=InnoDB;
