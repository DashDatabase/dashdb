/*
 * DashDB's "smart query" per engine: one read-only statement that returns the whole schema as a
 * single JSON document in the introspection contract (`introspectionResultSchema`), in a column
 * named `result`. Users run it in their own client and paste the result; live connections and
 * the round-trip tests run exactly the same text. The queries only read catalog metadata (no
 * table rows) and change nothing.
 */

// --- Postgres -----------------------------------------------------------------------------

const USER_NAMESPACE = `
  n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\\_toast%'
  AND n.nspname NOT LIKE 'pg\\_temp\\_%'`;

const NOT_EXTENSION = (catalog: string, oid: string) => `
  NOT EXISTS (
    SELECT 1 FROM pg_depend d
    WHERE d.classid = '${catalog}'::regclass AND d.objid = ${oid} AND d.deptype = 'e')`;

const TABLES = `
  SELECT c.oid, n.nspname AS schema, c.relname AS name, c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm')
    AND NOT c.relispartition
    AND ${USER_NAMESPACE}
    AND ${NOT_EXTENSION('pg_class', 'c.oid')}`;

/** Column names of `rel` for an attnum array, in array order. */
const attnames = (rel: string, nums: string) => `
  ARRAY(
    SELECT a.attname FROM unnest(${nums}) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = ${rel} AND a.attnum = k.attnum
    ORDER BY k.ord)`;

/**
 * Postgres: reads `pg_catalog` for every user schema. System schemas and objects owned by
 * extensions are skipped.
 */
export const POSTGRES_INTROSPECTION_QUERY = `
WITH t AS (${TABLES})
SELECT json_build_object(
  'tables', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', t.schema,
      'name', t.name,
      'kind', CASE t.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE 'table' END,
      'comment', obj_description(t.oid, 'pg_class')
    ) ORDER BY t.schema, t.name)
    FROM t), '[]'::json),
  'columns', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', t.schema,
      'table', t.name,
      'name', a.attname,
      'position', a.attnum,
      'type', format_type(a.atttypid, a.atttypmod),
      'nullable', NOT a.attnotnull,
      'default', CASE WHEN a.attgenerated = '' THEN pg_get_expr(ad.adbin, ad.adrelid) END,
      'identity', NULLIF(a.attidentity, ''),
      'comment', col_description(t.oid, a.attnum)
    ) ORDER BY t.schema, t.name, a.attnum)
    FROM t
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef ad ON ad.adrelid = t.oid AND ad.adnum = a.attnum
    WHERE t.relkind IN ('r', 'p')), '[]'::json),
  'constraints', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', t.schema,
      'table', t.name,
      'name', con.conname,
      'type', CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' WHEN 'f' THEN 'FOREIGN KEY' ELSE 'CHECK' END,
      'columns', COALESCE(${attnames('con.conrelid', 'con.conkey')}, ARRAY[]::name[]),
      'ref_schema', rn.nspname,
      'ref_table', rc.relname,
      'ref_columns', CASE WHEN con.contype = 'f' THEN ${attnames('con.confrelid', 'con.confkey')} END,
      'on_delete', CASE WHEN con.contype = 'f' THEN con.confdeltype END,
      'on_update', CASE WHEN con.contype = 'f' THEN con.confupdtype END,
      'definition', CASE WHEN con.contype = 'c' THEN pg_get_constraintdef(con.oid, true) END
    ) ORDER BY t.schema, t.name, con.conname)
    FROM t
    JOIN pg_constraint con ON con.conrelid = t.oid AND con.contype IN ('p', 'u', 'f', 'c')
    LEFT JOIN pg_class rc ON rc.oid = con.confrelid
    LEFT JOIN pg_namespace rn ON rn.oid = rc.relnamespace), '[]'::json),
  'indexes', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', t.schema,
      'table', t.name,
      'name', ic.relname,
      'unique', i.indisunique,
      'primary', i.indisprimary,
      'method', am.amname,
      'predicate', pg_get_expr(i.indpred, i.indrelid, true),
      'columns', (
        SELECT json_agg(json_build_object(
          'name', a.attname,
          'expression', CASE WHEN i.indkey[k] = 0 THEN pg_get_indexdef(i.indexrelid, k + 1, true) END,
          'order', CASE WHEN i.indoption[k] & 1 = 1 THEN 'desc' ELSE 'asc' END,
          -- Only the non-default placement: NULLS LAST is the default for ASC, FIRST for DESC.
          'nulls', CASE
            WHEN i.indoption[k] & 1 = 0 AND i.indoption[k] & 2 = 2 THEN 'first'
            WHEN i.indoption[k] & 1 = 1 AND i.indoption[k] & 2 = 0 THEN 'last' END
        ) ORDER BY k)
        FROM generate_series(0, i.indnkeyatts - 1) AS k
        LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[k])
    ) ORDER BY t.schema, t.name, ic.relname)
    FROM t
    JOIN pg_index i ON i.indrelid = t.oid
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_am am ON am.oid = ic.relam), '[]'::json),
  'enums', COALESCE((
    SELECT json_agg(json_build_object(
      'schema', n.nspname,
      'name', ty.typname,
      'values', (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = ty.oid)
    ) ORDER BY n.nspname, ty.typname)
    FROM pg_type ty
    JOIN pg_namespace n ON n.oid = ty.typnamespace
    WHERE ty.typtype = 'e'
      AND ${USER_NAMESPACE}
      AND ${NOT_EXTENSION('pg_type', 'ty.oid')}), '[]'::json)
) AS result;`;

// --- MySQL --------------------------------------------------------------------------------

/** A JSON boolean: MySQL's own booleans are the integers 1 and 0. */
const bool = (condition: string) => `CAST(IF(${condition}, 'true', 'false') AS JSON)`;

/** `JSON_ARRAYAGG` of no rows is NULL; the contract wants `[]`. */
const list = (aggregate: string) => `COALESCE(${aggregate}, JSON_ARRAY())`;

/** The key columns of constraint `tc`, each with its `seq`: JSON_ARRAYAGG keeps no order. */
const keyColumns = (column: string) => `(
      SELECT ${list(`JSON_ARRAYAGG(JSON_OBJECT('name', k.${column}, 'seq', k.ORDINAL_POSITION))`)}
      FROM information_schema.KEY_COLUMN_USAGE k
      WHERE k.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND k.TABLE_NAME = tc.TABLE_NAME
        AND k.CONSTRAINT_NAME = tc.CONSTRAINT_NAME)`;

/**
 * MySQL 8: reads `information_schema` for the connected database (`DATABASE()`), which is
 * reported as the IR's unnamed namespace `default`. MySQL enums are inline in the column type.
 * An index method of BTREE is what an index without USING gets, so it is reported as
 * unspecified (null), like the IR.
 */
export const MYSQL_INTROSPECTION_QUERY = `
SELECT JSON_OBJECT(
  'tables', (
    SELECT ${list(`JSON_ARRAYAGG(JSON_OBJECT(
      'schema', 'default',
      'name', t.TABLE_NAME,
      'kind', IF(t.TABLE_TYPE = 'VIEW', 'view', 'table'),
      'comment', NULLIF(t.TABLE_COMMENT, ''),
      'engine', t.ENGINE,
      'collation', t.TABLE_COLLATION))`)}
    FROM information_schema.TABLES t
    WHERE t.TABLE_SCHEMA = DATABASE()),
  'columns', (
    SELECT ${list(`JSON_ARRAYAGG(JSON_OBJECT(
      'schema', 'default',
      'table', c.TABLE_NAME,
      'name', c.COLUMN_NAME,
      'position', c.ORDINAL_POSITION,
      'type', c.COLUMN_TYPE,
      'nullable', ${bool(`c.IS_NULLABLE = 'YES'`)},
      'default', c.COLUMN_DEFAULT,
      'extra', NULLIF(c.EXTRA, ''),
      'comment', NULLIF(c.COLUMN_COMMENT, '')))`)}
    FROM information_schema.COLUMNS c
    WHERE c.TABLE_SCHEMA = DATABASE()),
  'constraints', (
    SELECT ${list(`JSON_ARRAYAGG(JSON_OBJECT(
      'schema', 'default',
      'table', tc.TABLE_NAME,
      'name', tc.CONSTRAINT_NAME,
      'type', tc.CONSTRAINT_TYPE,
      'columns', ${keyColumns('COLUMN_NAME')},
      'ref_schema', CASE WHEN rc.UNIQUE_CONSTRAINT_SCHEMA = DATABASE() THEN 'default'
                         ELSE rc.UNIQUE_CONSTRAINT_SCHEMA END,
      'ref_table', rc.REFERENCED_TABLE_NAME,
      'ref_columns', IF(tc.CONSTRAINT_TYPE = 'FOREIGN KEY', ${keyColumns('REFERENCED_COLUMN_NAME')}, NULL),
      'on_delete', rc.DELETE_RULE,
      'on_update', rc.UPDATE_RULE,
      'definition', cc.CHECK_CLAUSE))`)}
    FROM information_schema.TABLE_CONSTRAINTS tc
    LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND rc.TABLE_NAME = tc.TABLE_NAME
     AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    LEFT JOIN information_schema.CHECK_CONSTRAINTS cc
      ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     AND tc.CONSTRAINT_TYPE = 'CHECK'
    WHERE tc.TABLE_SCHEMA = DATABASE()),
  'indexes', (
    SELECT ${list(`JSON_ARRAYAGG(JSON_OBJECT(
      'schema', 'default',
      'table', s.tbl,
      'name', s.name,
      'unique', ${bool('s.non_unique = 0')},
      'primary', ${bool(`s.name = 'PRIMARY'`)},
      'method', NULLIF(LOWER(s.method), 'btree'),
      'columns', s.cols))`)}
    FROM (
      SELECT TABLE_NAME AS tbl, INDEX_NAME AS name, MIN(NON_UNIQUE) AS non_unique,
             MIN(INDEX_TYPE) AS method,
             JSON_ARRAYAGG(JSON_OBJECT(
               'name', COLUMN_NAME,
               'expression', EXPRESSION,
               'order', IF(COLLATION = 'D', 'desc', 'asc'),
               'seq', SEQ_IN_INDEX)) AS cols
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      GROUP BY TABLE_NAME, INDEX_NAME) s),
  'enums', JSON_ARRAY()
) AS result;`;

export const INTROSPECTION_QUERIES = {
  postgres: POSTGRES_INTROSPECTION_QUERY,
  mysql: MYSQL_INTROSPECTION_QUERY,
} as const;
