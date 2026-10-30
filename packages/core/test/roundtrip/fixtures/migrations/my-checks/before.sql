CREATE TABLE payments (id int NOT NULL PRIMARY KEY, amount int, currency char(3),
  CONSTRAINT payments_currency_check CHECK (char_length(currency) = 3)) ENGINE=InnoDB;
