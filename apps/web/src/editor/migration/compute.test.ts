import {
  addColumn,
  createSchema,
  removeColumn,
  renameColumn,
  updateColumn,
  type Schema,
} from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { columnId, shopSchema, table } from '../canvas/test-schema';
import { stressSchema } from '../canvas/stress-fixture';
import { computeMigration, migrationFilePaths, type MigrationRequest } from './compute';

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);

function request(before: Schema, after: Schema, overrides: Partial<MigrationRequest> = {}) {
  return {
    before,
    after,
    target: 'sql',
    name: 'change shop',
    confirmedRenames: [],
    now: NOW,
    ...overrides,
  } as const;
}

/** Add customers.phone, rename customers.name → full_name, drop orders.note. */
function editedShop(before: Schema): Schema {
  const customers = table(before, 'customers').id;
  const orders = table(before, 'orders').id;
  let after = addColumn(before, customers, {
    name: 'phone',
    logicalType: { kind: 'text' },
    nativeType: 'text',
  });
  after = renameColumn(after, customers, columnId(before, 'customers', 'name'), 'full_name');
  return removeColumn(after, orders, columnId(before, 'orders', 'note'));
}

async function generate(req: MigrationRequest) {
  const response = await computeMigration(req);
  if (!response.ok) throw new Error(response.message);
  return response.output;
}

describe('computeMigration', () => {
  it('generates SQL, findings and files for add + rename + drop', async () => {
    const before = shopSchema();
    const output = await generate(request(before, editedShop(before)));

    expect(output.operations.map((op) => op.kind).sort()).toEqual(
      ['addColumn', 'dropColumn', 'dropIndex', 'renameColumn'].sort(),
    );
    const up = output.statements.map((s) => s.sql).join('\n');
    expect(up).toContain('ALTER TABLE customers ADD COLUMN phone text;');
    expect(up).toContain('ALTER TABLE customers RENAME COLUMN name TO full_name;');
    expect(up).toContain('ALTER TABLE orders DROP COLUMN note;');
    expect(output.irreversible).toBe(1);
    expect(output.report.findings.map((f) => f.ruleId).sort()).toEqual(
      ['drop-column', 'rename-breaks-app'].sort(),
    );
    expect(output.report.riskLevel).toBe('dangerous');
    expect(output.files.map((f) => f.path)).toEqual([
      '20261031120000_change_shop/down.sql'.replace(/^/, 'migrations/'),
      'migrations/20261031120000_change_shop/up.sql',
    ]);
    expect(output.upPath).toBe('migrations/20261031120000_change_shop/up.sql');
    expect(output.downPath).toBe('migrations/20261031120000_change_shop/down.sql');
  });

  it('returns rename candidates when a column is dropped and a similar one added', async () => {
    const before = shopSchema();
    const orders = table(before, 'orders').id;
    let after = removeColumn(before, orders, columnId(before, 'orders', 'note'));
    after = addColumn(after, orders, {
      name: 'notes',
      logicalType: { kind: 'text' },
      nativeType: 'text',
    });
    const output = await generate(request(before, after));
    const [candidate] = output.renameCandidates;
    expect(candidate).toMatchObject({
      kind: 'column',
      from: { name: 'orders', column: 'note' },
      to: { name: 'orders', column: 'notes' },
    });
    expect(output.operations.map((op) => op.kind)).toContain('dropColumn');
    expect(output.operations.map((op) => op.kind)).toContain('addColumn');

    const confirmed = await generate(
      request(before, after, { confirmedRenames: [candidate?.key ?? ''] }),
    );
    expect(confirmed.operations.map((op) => op.kind)).toContain('renameColumn');
    expect(confirmed.operations.map((op) => op.kind)).not.toContain('dropColumn');
    // Confirmed candidates stay listed, so the panel can show the decision.
    expect(confirmed.renameCandidates.map((c) => c.key)).toEqual([candidate?.key]);
  });

  it('builds the Prisma and Drizzle folder layouts', async () => {
    const before = shopSchema();
    const after = editedShop(before);
    const prisma = await generate(request(before, after, { target: 'prisma' }));
    expect(prisma.files.map((f) => f.path)).toEqual([
      'prisma/migrations/20261031120000_change_shop/down.sql',
      'prisma/migrations/20261031120000_change_shop/migration.sql',
      'prisma/migrations/migration_lock.toml',
      'prisma/schema.prisma',
    ]);
    expect(prisma.upPath).toBe('prisma/migrations/20261031120000_change_shop/migration.sql');

    const drizzle = await generate(request(before, after, { target: 'drizzle' }));
    expect(drizzle.files.map((f) => f.path)).toEqual([
      'drizzle/0000_change_shop.down.sql',
      'drizzle/0000_change_shop.sql',
      'drizzle/meta/_journal.json',
      'drizzle/schema.ts',
    ]);
    expect(drizzle.upPath).toBe('drizzle/0000_change_shop.sql');
    expect(drizzle.downPath).toBe('drizzle/0000_change_shop.down.sql');
  });

  it('generates everything from an empty database', async () => {
    const after = shopSchema();
    const output = await generate(request(createSchema('postgres'), after));
    expect(output.operations.filter((op) => op.kind === 'createTable')).toHaveLength(4);
    expect(output.report.riskLevel).toBe('safe');
  });

  it('reports unsupported dialects and invalid schemas instead of throwing', async () => {
    const sqlite = createSchema('sqlite');
    expect(await computeMigration(request(sqlite, sqlite))).toEqual({
      ok: false,
      message: 'Migrations are available for PostgreSQL and MySQL projects.',
    });
    const before = shopSchema();
    const broken = updateColumn(
      before,
      table(before, 'orders').id,
      columnId(before, 'orders', 'id'),
      {
        nullable: true,
      },
    );
    const mysql = { ...broken, dialect: 'mysql' as const };
    const response = await computeMigration(request(before, mysql));
    expect(response.ok).toBe(false);
  });

  it('generates a 300-table schema in well under a second', async () => {
    const before = stressSchema(300);
    let after = before;
    for (const t of before.tables.slice(0, 40)) {
      after = addColumn(after, t.id, {
        name: 'archived_at',
        logicalType: { kind: 'text' },
        nativeType: 'text',
      });
    }
    await generate(request(before, after)); // warm up the JIT
    const started = performance.now();
    const output = await generate(request(before, after));
    const elapsed = performance.now() - started;
    expect(output.operations).toHaveLength(40);
    expect(elapsed).toBeLessThan(1000);

    const fromEmpty = performance.now();
    const all = await generate(request(createSchema('postgres'), before));
    expect(all.operations.filter((op) => op.kind === 'createTable')).toHaveLength(300);
    expect(performance.now() - fromEmpty).toBeLessThan(1000);
  });
});

describe('migrationFilePaths', () => {
  it('finds nothing in an empty bundle', () => {
    expect(migrationFilePaths('sql', [])).toEqual({ upPath: '', downPath: '' });
  });
});
