CREATE TYPE size AS ENUM ('large', 'small', 'medium');
CREATE TABLE shirts (id int PRIMARY KEY, size size);
