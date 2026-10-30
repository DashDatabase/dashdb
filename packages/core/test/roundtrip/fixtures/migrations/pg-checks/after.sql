CREATE TABLE payments (id int PRIMARY KEY, amount int, currency text, CONSTRAINT payments_amount_check CHECK (amount > 0), CONSTRAINT payments_currency_check CHECK (currency IN ('EUR', 'USD')));
