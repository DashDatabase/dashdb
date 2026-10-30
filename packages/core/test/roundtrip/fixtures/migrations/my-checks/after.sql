CREATE TABLE payments (id int NOT NULL PRIMARY KEY, amount int, currency char(3),
  CONSTRAINT payments_amount_check CHECK (amount > 0),
  CONSTRAINT payments_currency_check CHECK (currency in ('EUR','USD'))) ENGINE=InnoDB;
