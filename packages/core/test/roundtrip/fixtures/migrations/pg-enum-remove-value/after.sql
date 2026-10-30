CREATE TYPE status AS ENUM ('draft', 'paid');
CREATE TABLE invoices (id int PRIMARY KEY, status status NOT NULL DEFAULT 'draft');
