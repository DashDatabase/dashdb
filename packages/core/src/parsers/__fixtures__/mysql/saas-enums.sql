-- SaaS subscription billing with several ENUM columns.
CREATE TABLE accounts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  plan ENUM('free', 'starter', 'pro', 'enterprise') NOT NULL DEFAULT 'free',
  billing_cycle ENUM('monthly', 'yearly') DEFAULT NULL,
  region ENUM('us-east', 'eu-west', 'ap-south') NOT NULL DEFAULT 'us-east' COMMENT 'Data residency',
  trial_ends_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE seats (
  id BIGINT NOT NULL AUTO_INCREMENT,
  account_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  role ENUM('owner', 'admin', 'member', 'billing') NOT NULL DEFAULT 'member',
  status ENUM('invited', 'active', 'suspended') NOT NULL DEFAULT 'invited',
  PRIMARY KEY (id),
  UNIQUE KEY seats_account_email (account_id, email),
  CONSTRAINT seats_account_fk FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE invoices (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id BIGINT NOT NULL,
  status ENUM('draft', 'open', 'paid', 'uncollectible', 'void') NOT NULL DEFAULT 'draft',
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  amount_cents INT UNSIGNED NOT NULL,
  memo VARCHAR(500) DEFAULT 'Thanks for your business! It''s appreciated.',
  issued_at DATE,
  KEY invoices_account_status (account_id, status),
  FOREIGN KEY (account_id) REFERENCES accounts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE feature_flags (
  account_id BIGINT NOT NULL,
  flag VARCHAR(64) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, flag),
  CONSTRAINT feature_flags_account_fk FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE=MyISAM;

ALTER TABLE invoices ADD INDEX invoices_issued_idx (issued_at);
