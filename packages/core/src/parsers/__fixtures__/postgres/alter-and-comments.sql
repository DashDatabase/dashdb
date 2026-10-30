-- Constraints added after the fact, comments, and index methods.
CREATE TABLE warehouses (
  id integer NOT NULL,
  code text NOT NULL,
  location point
);

CREATE TABLE stock_movements (
  id bigint NOT NULL,
  warehouse_id integer NOT NULL,
  sku text NOT NULL,
  delta integer NOT NULL,
  reason text,
  tags text[],
  search tsvector,
  moved_at timestamp with time zone NOT NULL
);

ALTER TABLE ONLY warehouses ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY warehouses ADD CONSTRAINT warehouses_code_key UNIQUE (code);
ALTER TABLE ONLY stock_movements ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY stock_movements
  ADD CONSTRAINT stock_movements_warehouse_fkey FOREIGN KEY (warehouse_id)
  REFERENCES warehouses (id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_delta_check CHECK (delta <> 0);
ALTER TABLE stock_movements ADD COLUMN note varchar(500);
ALTER TABLE stock_movements ALTER COLUMN reason SET DEFAULT 'manual';

CREATE INDEX stock_movements_tags_idx ON stock_movements USING gin (tags);
CREATE INDEX stock_movements_search_idx ON stock_movements USING gin (search);
CREATE INDEX stock_movements_sku_hash_idx ON stock_movements USING hash (sku);
CREATE INDEX stock_movements_lower_sku_idx ON stock_movements (lower(sku));

COMMENT ON TABLE warehouses IS 'Physical storage locations';
COMMENT ON COLUMN stock_movements.delta IS 'Positive for receipts, negative for picks';
COMMENT ON COLUMN stock_movements.missing_column IS 'This column does not exist';
COMMENT ON INDEX stock_movements_tags_idx IS 'Tag lookups';
