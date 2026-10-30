CREATE TABLE payments (id int PRIMARY KEY, amount int, currency text, CONSTRAINT payments_currency_check CHECK (length(currency) = 3));
