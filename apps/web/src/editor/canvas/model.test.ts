import { describe, expect, it } from 'vitest';
import { layoutFor } from '../store/layout';
import type { Layout } from '../store';
import {
  buildEdges,
  columnFlags,
  columnHandleId,
  estimateNodeHeight,
  findForeignKey,
  HEADER_HEIGHT,
  parseHandleId,
  ROW_HEIGHT,
  snap,
  syncNodes,
  tableHandleId,
  visibleColumns,
} from './model';
import { columnId, shopSchema, table } from './test-schema';

function withNode(layout: Layout, id: string, patch: object): Layout {
  const node = layout.nodes[id];
  if (!node) throw new Error(`no node ${id}`);
  return { nodes: { ...layout.nodes, [id]: { ...node, ...patch } } };
}

describe('columns', () => {
  it('flags primary, foreign, unique and nullable columns', () => {
    const schema = shopSchema();
    const customers = table(schema, 'customers');
    const flags = Object.fromEntries(
      customers.columns.map((c) => [c.name, columnFlags(customers, c)]),
    );
    expect(flags.id).toEqual({ pk: true, fk: false, unique: false, nullable: false });
    expect(flags.email).toEqual({ pk: false, fk: false, unique: true, nullable: false });
    expect(flags.name?.nullable).toBe(true);
    const orders = table(schema, 'orders');
    const customerId = orders.columns.find((c) => c.name === 'customer_id');
    expect(customerId && columnFlags(orders, customerId).fk).toBe(true);
  });

  it('shows only key columns when collapsed', () => {
    const orders = table(shopSchema(), 'orders');
    expect(visibleColumns(orders, false).map((c) => c.name)).toEqual([
      'id',
      'customer_id',
      'coupon_id',
      'note',
    ]);
    expect(visibleColumns(orders, true).map((c) => c.name)).toEqual(['id', 'customer_id']);
    // Collapsed tables add a "2 more columns" row.
    expect(estimateNodeHeight(orders, true)).toBe(HEADER_HEIGHT + 3 * ROW_HEIGHT);
    expect(estimateNodeHeight(orders, false)).toBe(HEADER_HEIGHT + 4 * ROW_HEIGHT);
  });
});

describe('handles', () => {
  it('round-trips column and table handle ids', () => {
    expect(parseHandleId(columnHandleId('abc:1', 'l'))).toEqual({ columnId: 'abc:1', side: 'l' });
    expect(parseHandleId(tableHandleId('r'))).toEqual({ columnId: null, side: 'r' });
    expect(parseHandleId('c:x')).toBeNull();
    expect(parseHandleId('c:l')).toBeNull();
    expect(parseHandleId('t:l:extra')).toBeNull();
    expect(parseHandleId(null)).toBeNull();
  });

  it('snaps to the grid', () => {
    expect(snap(7)).toBe(0);
    expect(snap(9)).toBe(16);
    expect(snap(-25)).toBe(-32);
  });
});

describe('syncNodes', () => {
  it('keeps unchanged nodes and data identical so memoized nodes skip rendering', () => {
    const schema = shopSchema();
    const layout = layoutFor(schema);
    const first = syncNodes([], schema, layout, new Set());
    expect(first.map((n) => n.data.table.name)).toEqual([
      'customers',
      'orders',
      'profiles',
      'coupons',
    ]);
    const again = syncNodes(first, schema, layout, new Set());
    expect(again.every((n, i) => n === first[i])).toBe(true);

    const ordersId = table(schema, 'orders').id;
    const next = syncNodes(
      again,
      schema,
      withNode(layout, ordersId, { x: 999 }),
      new Set([ordersId]),
    );
    expect(next[0]).toBe(again[0]);
    expect(next[1]?.position.x).toBe(999);
    expect(next[1]?.selected).toBe(true);
    expect(next[1]?.data).not.toBe(again[1]?.data);
  });

  it('keeps the position of a node being dragged and drops removed tables', () => {
    const schema = shopSchema();
    const layout = layoutFor(schema);
    const nodes = syncNodes([], schema, layout, new Set()).map((n, i) =>
      i === 0 ? { ...n, dragging: true, position: { x: 5, y: 5 } } : n,
    );
    const withoutLast = { ...schema, tables: schema.tables.slice(0, -1) };
    const next = syncNodes(nodes, withoutLast, layout, new Set());
    expect(next).toHaveLength(3);
    expect(next[0]?.position).toEqual({ x: 5, y: 5 });
  });
});

describe('buildEdges', () => {
  it("draws one edge per foreign key with crow's-foot cardinality", () => {
    const schema = shopSchema();
    const edges = buildEdges(schema, layoutFor(schema));
    const byName = Object.fromEntries(edges.map((e) => [e.data?.name ?? '', e] as const));
    expect(Object.keys(byName).sort()).toEqual([
      'coupons_parent_id_fkey',
      'orders_customer_id_fkey',
      'profiles_customer_id_fkey',
    ]);
    // Many orders per customer; each order has exactly one customer.
    expect(byName.orders_customer_id_fkey?.data).toMatchObject({
      sourceEnd: 'many',
      targetEnd: 'one',
      label: 'orders.customer_id → customers.id',
    });
    // The foreign key is also the primary key: one-to-one.
    expect(byName.profiles_customer_id_fkey?.data?.sourceEnd).toBe('zero-one');
    // Nullable self-reference.
    expect(byName.coupons_parent_id_fkey?.data).toMatchObject({
      sourceEnd: 'many',
      targetEnd: 'zero-one',
    });
  });

  it('attaches edges to the facing sides of the two tables', () => {
    const schema = shopSchema();
    const layout = layoutFor(schema);
    const customers = table(schema, 'customers').id;
    const orders = table(schema, 'orders').id;
    const edges = buildEdges(schema, layout);
    const fk = edges.find((e) => e.source === orders && e.target === customers);
    // orders sits right of customers in the default grid.
    expect(fk?.sourceHandle).toBe(columnHandleId(columnId(schema, 'orders', 'customer_id'), 'l'));
    expect(fk?.targetHandle).toBe(columnHandleId(columnId(schema, 'customers', 'id'), 'r'));

    const self = edges.find((e) => e.source === e.target);
    expect(self?.sourceHandle?.startsWith('c:r:')).toBe(true);
    expect(self?.targetHandle?.startsWith('c:r:')).toBe(true);
  });

  it('falls back to the table handle when the referenced column is hidden', () => {
    const schema = shopSchema();
    const customers = table(schema, 'customers');
    const orders = table(schema, 'orders');
    // Point the order foreign key at the unique email column, then collapse customers.
    const emailFk = {
      ...schema,
      tables: schema.tables.map((t) =>
        t.id === orders.id
          ? {
              ...t,
              foreignKeys: t.foreignKeys.map((fk) => ({
                ...fk,
                refColumns: [columnId(schema, 'customers', 'email')],
              })),
            }
          : t,
      ),
    };
    const collapsed = withNode(layoutFor(schema), customers.id, { collapsed: true });
    const edge = buildEdges(emailFk, collapsed).find(
      (e) => e.target === customers.id && e.source === orders.id,
    );
    expect(edge?.targetHandle).toBe(tableHandleId('r'));
  });

  it('attaches every edge to the table headers when zoomed out', () => {
    const schema = shopSchema();
    const edges = buildEdges(schema, layoutFor(schema), true);
    expect(
      edges.every((e) => e.sourceHandle?.startsWith('t:') && e.targetHandle?.startsWith('t:')),
    ).toBe(true);
  });

  it('finds the foreign key behind an edge', () => {
    const schema = shopSchema();
    const [edge] = buildEdges(schema, layoutFor(schema));
    expect(findForeignKey(schema, edge?.id ?? '')?.fk.name).toBe(edge?.data?.name);
    expect(findForeignKey(schema, 'missing')).toBeNull();
  });
});
