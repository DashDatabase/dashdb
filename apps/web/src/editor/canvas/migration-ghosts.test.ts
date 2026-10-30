import { describe, expect, it } from 'vitest';
import { layoutFor } from '../store/layout';
import { ghostPositions } from './migration-ghosts';
import { shopSchema } from './test-schema';

describe('ghostPositions', () => {
  it('puts each removed table in its own free spot near the diagram', () => {
    const schema = shopSchema();
    const layout = layoutFor(schema);
    const removed = schema.tables.slice(0, 2);
    const ghosts = ghostPositions(removed, layout);
    expect(ghosts.map((g) => g.table.name)).toEqual(removed.map((t) => t.name));
    const spots = [...Object.values(layout.nodes), ...ghosts];
    for (const ghost of ghosts) {
      const overlapping = spots.filter(
        (s) => Math.abs(s.x - ghost.x) < 304 && Math.abs(s.y - ghost.y) < 176,
      );
      expect(overlapping).toEqual([ghost]);
    }
  });

  it('starts at the origin on an empty canvas', () => {
    const [ghost] = ghostPositions(shopSchema().tables.slice(0, 1), { nodes: {} });
    expect(ghost).toMatchObject({
      x: expect.any(Number) as number,
      y: expect.any(Number) as number,
    });
  });
});
