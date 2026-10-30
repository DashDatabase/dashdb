import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { stressSchema } from '../stress-fixture';
import { computeLayout, LAYOUT_OPTIONS, toElkGraph } from './elk';

describe('ELK layout', () => {
  it('builds a layered, orthogonal graph without self-loops or dangling edges', () => {
    const graph = toElkGraph({
      nodes: [
        { id: 'a', width: 100, height: 50 },
        { id: 'b', width: 100, height: 80 },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'self', source: 'a', target: 'a' },
        { id: 'dangling', source: 'a', target: 'zzz' },
      ],
    });
    expect(graph.layoutOptions).toBe(LAYOUT_OPTIONS);
    expect(LAYOUT_OPTIONS['elk.algorithm']).toBe('layered');
    expect(LAYOUT_OPTIONS['elk.edgeRouting']).toBe('ORTHOGONAL');
    expect(graph.edges).toEqual([{ id: 'e1', sources: ['a'], targets: ['b'] }]);
  });

  it('places parents before children, snapped to the grid', async () => {
    const nodes = ['users', 'posts', 'comments'].map((id) => ({ id, width: 272, height: 150 }));
    const positions = await computeLayout(new ELK(), {
      nodes,
      edges: [
        { id: 'p', source: 'users', target: 'posts' },
        { id: 'c', source: 'posts', target: 'comments' },
      ],
    });
    const x = (id: string) => positions[id]?.x ?? Number.NaN;
    expect(x('users')).toBeLessThan(x('posts'));
    expect(x('posts')).toBeLessThan(x('comments'));
    for (const p of Object.values(positions)) {
      expect(p.x % 16).toBe(0);
      expect(p.y % 16).toBe(0);
    }
  });

  it('lays out the 500-table stress fixture without overlapping tables', async () => {
    const schema = stressSchema();
    const nodes = schema.tables.map((t) => ({
      id: t.id,
      width: 272,
      height: 41 + t.columns.length * 28,
    }));
    const positions = await computeLayout(new ELK(), {
      nodes,
      edges: schema.tables.flatMap((t) =>
        t.foreignKeys.map((fk) => ({ id: fk.id, source: fk.refTable, target: t.id })),
      ),
    });
    expect(Object.keys(positions)).toHaveLength(500);
    const boxes = nodes
      .map((n) => ({
        x: positions[n.id]?.x ?? 0,
        y: positions[n.id]?.y ?? 0,
        w: n.width,
        h: n.height,
      }))
      .sort((a, b) => a.x - b.x);
    // Snapping can shave up to 8px off a gap; ELK spaces nodes at least 48px apart.
    const overlap = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
      b.x < a.x + a.w - 8 && b.y < a.y + a.h - 8 && a.y < b.y + b.h - 8;
    let overlaps = 0;
    boxes.forEach((a, i) => {
      for (const b of boxes.slice(i + 1)) {
        if (b.x >= a.x + a.w) break;
        if (overlap(a, b)) overlaps++;
      }
    });
    expect(overlaps).toBe(0);
  }, 60_000);
});
