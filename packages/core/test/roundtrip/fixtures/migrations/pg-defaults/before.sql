CREATE TABLE jobs (id int PRIMARY KEY, attempts int DEFAULT 0, state text DEFAULT 'new', run_at timestamptz, note text DEFAULT 'x');
