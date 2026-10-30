import type { Schema } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { proposeRelationship } from './relationship';
import { columnId, shopSchema, table } from './test-schema';

const ref = (schema: Schema, t: string, c: string) => ({
  tableId: table(schema, t).id,
  columnId: columnId(schema, t, c),
});

describe('proposeRelationship', () => {
  it('makes the dragged-from column reference the dropped-on key', () => {
    const schema = shopSchema();
    const draft = proposeRelationship(
      schema,
      ref(schema, 'orders', 'coupon_id'),
      ref(schema, 'coupons', 'id'),
    );
    expect(draft).toMatchObject({
      tableId: table(schema, 'orders').id,
      refTableId: table(schema, 'coupons').id,
      name: 'orders_coupon_id_fkey',
      onDelete: 'no action',
      onUpdate: 'no action',
      warnings: [],
    });
  });

  it('reads a drag from a key onto a plain column the other way round', () => {
    const schema = shopSchema();
    const draft = proposeRelationship(
      schema,
      ref(schema, 'coupons', 'id'),
      ref(schema, 'orders', 'coupon_id'),
    );
    expect(draft?.tableId).toBe(table(schema, 'orders').id);
    expect(draft?.columnId).toBe(columnId(schema, 'orders', 'coupon_id'));
  });

  it('warns about non-key targets, type mismatches and duplicates, and keeps names unique', () => {
    const schema = shopSchema();
    const plain = proposeRelationship(
      schema,
      ref(schema, 'orders', 'coupon_id'),
      ref(schema, 'orders', 'note'),
    );
    expect(plain?.warnings).toEqual([
      'orders.note is not a primary key or unique column.',
      'Types differ: bigint → text.',
    ]);
    const duplicate = proposeRelationship(
      schema,
      ref(schema, 'orders', 'customer_id'),
      ref(schema, 'customers', 'id'),
    );
    expect(duplicate?.warnings).toContain('This relationship already exists.');
    expect(duplicate?.name).toBe('orders_customer_id_fkey_2');
  });

  it('rejects a column connected to itself or unknown ids', () => {
    const schema = shopSchema();
    const id = ref(schema, 'orders', 'id');
    expect(proposeRelationship(schema, id, id)).toBeNull();
    expect(proposeRelationship(schema, id, { tableId: 'x', columnId: 'y' })).toBeNull();
  });
});
