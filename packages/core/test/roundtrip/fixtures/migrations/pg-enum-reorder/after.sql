CREATE TYPE size AS ENUM ('small', 'medium', 'large');
CREATE TABLE shirts (id int PRIMARY KEY, size size);
