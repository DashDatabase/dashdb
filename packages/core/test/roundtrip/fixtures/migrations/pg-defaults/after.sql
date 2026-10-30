CREATE TABLE jobs (id int PRIMARY KEY, attempts int DEFAULT 3, state text DEFAULT 'queued', run_at timestamptz DEFAULT now(), note text);
