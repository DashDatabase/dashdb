-- E-commerce store on MySQL 8.
CREATE DATABASE IF NOT EXISTS `shop`;
USE `shop`;

CREATE TABLE `customers` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `name` varchar(120) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customers_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `products` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `sku` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` mediumtext,
  `price` decimal(10,2) NOT NULL,
  `weight_grams` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `attributes` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sku` (`sku`),
  KEY `products_active_title_idx` (`is_active`, `title`),
  FULLTEXT KEY `products_search` (`title`, `description`),
  CONSTRAINT `products_price_chk` CHECK ((`price` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Sellable items';

CREATE TABLE `orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` int unsigned NOT NULL,
  `status` enum('cart','placed','paid','shipped','cancelled') NOT NULL DEFAULT 'cart',
  `total` decimal(12,2) NOT NULL DEFAULT '0.00',
  `placed_at` datetime DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `orders_customer_idx` (`customer_id`),
  KEY `orders_status_placed_idx` (`status`, `placed_at` DESC),
  CONSTRAINT `orders_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `order_items` (
  `order_id` bigint unsigned NOT NULL,
  `product_id` int unsigned NOT NULL,
  `quantity` smallint unsigned NOT NULL DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL,
  PRIMARY KEY (`order_id`, `product_id`),
  KEY `order_items_product_idx` (`product_id`),
  CONSTRAINT `order_items_order_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_items_product_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
