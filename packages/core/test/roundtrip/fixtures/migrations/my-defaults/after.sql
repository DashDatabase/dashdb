CREATE TABLE jobs (id int NOT NULL PRIMARY KEY, attempts int DEFAULT 3, state varchar(20) DEFAULT 'queued', run_at datetime DEFAULT CURRENT_TIMESTAMP, note varchar(20)) ENGINE=InnoDB;
