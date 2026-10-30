CREATE TYPE priority AS ENUM ('low', 'normal', 'high');
CREATE TABLE tickets (id int PRIMARY KEY, priority priority NOT NULL DEFAULT 'normal');
