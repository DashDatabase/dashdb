CREATE TYPE status AS ENUM ('draft', 'published');
CREATE TABLE posts (id int PRIMARY KEY, status status DEFAULT 'draft');
