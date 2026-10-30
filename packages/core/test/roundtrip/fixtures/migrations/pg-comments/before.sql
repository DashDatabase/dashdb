CREATE TABLE notes (id int PRIMARY KEY, body text);
COMMENT ON TABLE notes IS 'Old notes';
COMMENT ON COLUMN notes.id IS 'Key';
