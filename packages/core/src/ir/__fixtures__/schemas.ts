import type { Column, Schema } from '../types';

export function column(id: string, overrides: Partial<Column> = {}): Column {
  return {
    id,
    name: id,
    logicalType: { kind: 'int' },
    nativeType: 'integer',
    nullable: false,
    default: null,
    autoIncrement: false,
    comment: null,
    ...overrides,
  };
}

/** A valid two-table blog schema: users ←(author_id)— posts, with a post_status enum. */
export function blogSchema(): Schema {
  return {
    id: 'schema',
    dialect: 'postgres',
    version: 1,
    namespaces: [{ id: 'ns_public', name: 'public' }],
    enums: [
      {
        id: 'enum_status',
        name: 'post_status',
        namespace: 'ns_public',
        values: ['draft', 'published'],
      },
    ],
    tables: [
      {
        id: 't_users',
        name: 'users',
        namespace: 'ns_public',
        comment: 'Registered users',
        columns: [
          column('c_users_id', {
            name: 'id',
            autoIncrement: true,
            default: { kind: 'sequence', name: 'users_id_seq' },
          }),
          column('c_users_email', {
            name: 'email',
            logicalType: { kind: 'varchar', length: 255 },
            nativeType: 'varchar(255)',
          }),
          column('c_users_created', {
            name: 'created_at',
            logicalType: { kind: 'timestamp', withTimeZone: true },
            nativeType: 'timestamptz',
            default: { kind: 'expression', sql: 'now()' },
          }),
        ],
        primaryKey: { id: 'pk_users', name: 'users_pkey', columns: ['c_users_id'] },
        indexes: [
          {
            id: 'ix_users_created',
            name: 'users_created_at_idx',
            columns: [{ column: 'c_users_created', order: 'desc', nulls: 'last' }],
            unique: false,
            method: 'btree',
            where: null,
          },
        ],
        uniques: [{ id: 'uq_users_email', name: 'users_email_key', columns: ['c_users_email'] }],
        foreignKeys: [],
        checks: [{ id: 'ck_users_email', name: 'users_email_check', expression: "email <> ''" }],
      },
      {
        id: 't_posts',
        name: 'posts',
        namespace: 'ns_public',
        comment: null,
        columns: [
          column('c_posts_id', { name: 'id' }),
          column('c_posts_author', { name: 'author_id' }),
          column('c_posts_status', {
            name: 'status',
            logicalType: { kind: 'enum', enumId: 'enum_status' },
            nativeType: 'post_status',
            default: { kind: 'literal', value: 'draft' },
          }),
          column('c_posts_body', {
            name: 'body',
            logicalType: { kind: 'text' },
            nativeType: 'text',
            nullable: true,
          }),
        ],
        primaryKey: { id: 'pk_posts', name: null, columns: ['c_posts_id'] },
        indexes: [
          {
            id: 'ix_posts_author',
            name: 'posts_author_idx',
            columns: [{ column: 'c_posts_author', order: 'asc', nulls: null }],
            unique: false,
            method: null,
            where: 'author_id IS NOT NULL',
          },
        ],
        uniques: [],
        foreignKeys: [
          {
            id: 'fk_posts_author',
            name: 'posts_author_fkey',
            columns: ['c_posts_author'],
            refTable: 't_users',
            refColumns: ['c_users_id'],
            onDelete: 'cascade',
            onUpdate: 'no action',
          },
        ],
        checks: [],
      },
    ],
  };
}

/** Recursively freeze a value so any accidental mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
