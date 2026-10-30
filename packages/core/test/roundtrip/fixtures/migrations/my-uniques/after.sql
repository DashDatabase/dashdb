CREATE TABLE users (id int NOT NULL PRIMARY KEY, email varchar(100), handle varchar(40), tenant int,
  CONSTRAINT users_email_key UNIQUE (email), CONSTRAINT users_tenant_handle_key UNIQUE (tenant, handle)) ENGINE=InnoDB;
