CREATE TABLE sessions (id int PRIMARY KEY, token uuid NOT NULL DEFAULT gen_random_uuid(), created_at timestamp DEFAULT CURRENT_TIMESTAMP);
