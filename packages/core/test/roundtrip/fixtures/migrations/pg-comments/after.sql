CREATE TABLE notes (id int PRIMARY KEY, body text);
COMMENT ON TABLE notes IS 'User notes';
COMMENT ON COLUMN notes.body IS 'Markdown body';
