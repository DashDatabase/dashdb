CREATE TYPE status AS ENUM ('draft', 'void', 'paid');
CREATE TABLE invoices (id int PRIMARY KEY, status status NOT NULL DEFAULT 'draft');
INSERT INTO invoices VALUES (1, 'paid');
