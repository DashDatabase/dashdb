import { createSchema, validateSchema, type Table } from '@dashdb/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { layoutFor } from '../store/layout';
import {
  clearClipboard,
  copyTables,
  nextPasteOffset,
  PASTE_OFFSET,
  pasteTables,
  readClipboard,
} from './clipboard';
import { shopSchema, table } from './test-schema';

beforeEach(() => {
  clearClipboard();
});

function byId(tables: readonly Table[], id: string | undefined): Table {
  const found = tables.find((t) => t.id === id);
  if (!found) throw new Error(`no table ${String(id)}`);
  return found;
}

describe('clipboard', () => {
  it('copies tables with their positions and offsets each paste further', () => {
    const schema = shopSchema();
    const layout = layoutFor(schema);
    expect(copyTables(schema, layout, ['nope'])).toBeNull();
    const clip = copyTables(schema, layout, [table(schema, 'orders').id]);
    expect(clip?.tables.map((t) => t.name)).toEqual(['orders']);
    expect(readClipboard()).toBe(clip);
    expect(nextPasteOffset()).toBe(PASTE_OFFSET);
    expect(nextPasteOffset()).toBe(2 * PASTE_OFFSET);
  });

  it('pastes copies with fresh ids and names, remapping internal foreign keys', () => {
    const schema = shopSchema();
    const layout = layoutFor(schema);
    const customers = table(schema, 'customers');
    const clip = copyTables(schema, layout, [customers.id, table(schema, 'orders').id]);
    if (!clip) throw new Error('nothing copied');
    const { schema: next, tableIds, positions } = pasteTables(schema, clip, 48);

    expect(next.tables.map((t) => t.name)).toEqual([
      'customers',
      'orders',
      'profiles',
      'coupons',
      'customers_copy',
      'orders_copy',
    ]);
    const customersCopy = byId(next.tables, tableIds[0]);
    const ordersCopy = byId(next.tables, tableIds[1]);
    const originalIds = new Set(customers.columns.map((c) => c.id));
    expect(customersCopy.columns.some((c) => originalIds.has(c.id))).toBe(false);
    // The copied key points at the copied customers table and its copied id column.
    const fk = ordersCopy.foreignKeys[0];
    expect(fk?.refTable).toBe(customersCopy.id);
    expect(fk?.refColumns).toEqual([customersCopy.columns[0]?.id]);
    expect(fk?.name).toBe('orders_copy_customer_id_fkey');
    expect(fk?.onDelete).toBe('cascade');
    expect(ordersCopy.indexes[0]?.name).toBe('orders_copy_note_idx');
    const original = layout.nodes[customers.id];
    expect(positions[customersCopy.id]).toEqual({
      x: (original?.x ?? 0) + 48,
      y: (original?.y ?? 0) + 48,
    });
    expect(validateSchema(next)).toEqual([]);
  });

  it('keeps foreign keys to tables outside the clip and drops dangling ones', () => {
    const schema = shopSchema();
    const clip = copyTables(schema, layoutFor(schema), [table(schema, 'orders').id]);
    if (!clip) throw new Error('nothing copied');
    const kept = pasteTables(schema, clip, 0).schema;
    expect(kept.tables.at(-1)?.foreignKeys[0]?.refTable).toBe(table(schema, 'customers').id);

    // In a fresh schema the customers table does not exist, so the key is dropped.
    const pasted = pasteTables(createSchema('postgres'), clip, 0).schema;
    expect(pasted.namespaces.map((n) => n.name)).toEqual(['public']);
    expect(pasted.tables[0]?.name).toBe('orders_copy');
    expect(pasted.tables[0]?.foreignKeys).toEqual([]);
    expect(pasted.tables[0]?.namespace).toBe(pasted.namespaces[0]?.id);
  });
});
