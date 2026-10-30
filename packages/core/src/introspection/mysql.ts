/*
 * The MySQL "smart query": four reads of information_schema for the connected database
 * (`DATABASE()`), which is reported as the IR's unnamed namespace `default`. Rows are flat;
 * `assembleMysql` groups key columns and index entries in order.
 */

export const MYSQL_INTROSPECTION_QUERIES = {
  tables: `
    SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_COMMENT AS comment,
           ENGINE AS engine, TABLE_COLLATION AS collation
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME`,
  columns: `
    SELECT TABLE_NAME AS tbl, COLUMN_NAME AS name, ORDINAL_POSITION AS position,
           COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt,
           EXTRA AS extra, COLUMN_COMMENT AS comment
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  constraints: `
    SELECT tc.TABLE_NAME AS tbl, tc.CONSTRAINT_NAME AS name, tc.CONSTRAINT_TYPE AS type,
           k.COLUMN_NAME AS col,
           CASE WHEN k.REFERENCED_TABLE_SCHEMA = DATABASE() THEN 'default'
                ELSE k.REFERENCED_TABLE_SCHEMA END AS ref_schema,
           k.REFERENCED_TABLE_NAME AS ref_table, k.REFERENCED_COLUMN_NAME AS ref_col,
           rc.DELETE_RULE AS on_delete, rc.UPDATE_RULE AS on_update, cc.CHECK_CLAUSE AS definition
    FROM information_schema.TABLE_CONSTRAINTS tc
    LEFT JOIN information_schema.KEY_COLUMN_USAGE k
      ON k.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND k.TABLE_NAME = tc.TABLE_NAME
     AND k.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND rc.TABLE_NAME = tc.TABLE_NAME
     AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    LEFT JOIN information_schema.CHECK_CONSTRAINTS cc
      ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     AND tc.CONSTRAINT_TYPE = 'CHECK'
    WHERE tc.TABLE_SCHEMA = DATABASE()
    ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
  indexes: `
    SELECT TABLE_NAME AS tbl, INDEX_NAME AS name, NON_UNIQUE AS non_unique,
           COLUMN_NAME AS col, COLLATION AS collation, EXPRESSION AS expression,
           INDEX_TYPE AS method
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
} as const;
