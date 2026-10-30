CREATE SCHEMA billing;
CREATE TABLE users (id int PRIMARY KEY);
CREATE TABLE billing.invoices (id int PRIMARY KEY, user_id int CONSTRAINT invoices_user_fk REFERENCES public.users (id) ON DELETE RESTRICT);
CREATE TABLE billing.lines (id int PRIMARY KEY, invoice_id int NOT NULL REFERENCES billing.invoices (id) ON DELETE CASCADE);
