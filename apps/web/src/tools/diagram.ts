// The ER diagram for a converted schema (prisma-to-erd): laid out by the editor's ELK worker and
// drawn by the same SVG renderer as the editor's image export. Loaded only on that page.
import type { Schema } from '@dashdb/core/lite';
import { NODE_WIDTH, estimateNodeHeight } from '@/editor/canvas/model';
import type { Layout } from '@/editor/store';

export async function schemaDiagramSvg(schema: Schema, theme: 'light' | 'dark'): Promise<string> {
  const [{ layoutInWorker }, { renderDiagramSvg }] = await Promise.all([
    import('@/editor/canvas/layout/auto-layout'),
    import('@/editor/export/diagram-svg'),
  ]);
  const positions = await layoutInWorker({
    nodes: schema.tables.map((t) => ({
      id: t.id,
      width: NODE_WIDTH,
      height: estimateNodeHeight(t, false),
    })),
    edges: schema.tables.flatMap((t) =>
      t.foreignKeys.map((fk) => ({ id: fk.id, source: fk.refTable, target: t.id })),
    ),
  });
  const layout: Layout = {
    nodes: Object.fromEntries(
      schema.tables.map((t, i) => [
        t.id,
        {
          x: positions[t.id]?.x ?? i * (NODE_WIDTH + 48),
          y: positions[t.id]?.y ?? 0,
          collapsed: false,
          color: 'default',
        },
      ]),
    ),
  };
  return renderDiagramSvg(schema, layout, { theme, transparent: false, watermark: true }).svg;
}
