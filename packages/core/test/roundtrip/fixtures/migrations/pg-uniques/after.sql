CREATE TABLE users (id int PRIMARY KEY, email text, handle text, tenant int, CONSTRAINT users_email_key UNIQUE (email), CONSTRAINT users_tenant_handle_key UNIQUE (tenant, handle));
