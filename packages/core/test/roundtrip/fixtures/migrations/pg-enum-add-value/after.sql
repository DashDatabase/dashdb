CREATE TYPE status AS ENUM ('draft', 'review', 'published', 'archived');
CREATE TABLE posts (id int PRIMARY KEY, status status DEFAULT 'draft');
