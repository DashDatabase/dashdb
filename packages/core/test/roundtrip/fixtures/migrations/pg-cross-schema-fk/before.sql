CREATE SCHEMA billing;
CREATE TABLE users (id int PRIMARY KEY);
CREATE TABLE billing.invoices (id int PRIMARY KEY, user_id int);
