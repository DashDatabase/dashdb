// PNG/SVG export: the diagram drawn as standalone SVG from the schema and layout, not captured
// from the canvas DOM. Every piece of text is escaped and the markup holds only shapes and text
// (no scripts, event handlers, foreignObject, links or external references), so the file is
// safe to open or embed anywhere.
import type { Id, Schema, Table } from '@dashdb/core';
import { markGeometry } from '@dashdb/ui/server';
import {
  HEADER_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
  cardinality,
  columnFlags,
  estimateNodeHeight,
  visibleColumns,
  type Cardinality,
} from '../canvas/model';
import type { Layout, NodeColor, NodeLayout } from '../store';

export interface DiagramImageOptions {
  readonly theme: 'light' | 'dark';
  readonly transparent: boolean;
  readonly watermark: boolean;
}

export interface DiagramImage {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

interface Palette {
  readonly background: string;
  readonly card: string;
  readonly header: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly edge: string;
  readonly key: string;
}

// Literal colors: an exported file cannot read the app's CSS variables. They mirror the tokens.
const PALETTES: Record<DiagramImageOptions['theme'], Palette> = {
  light: {
    background: '#f7f7f9',
    card: '#ffffff',
    header: '#f0f0f4',
    border: '#e4e4e9',
    text: '#0f0f14',
    muted: '#5c5c69',
    edge: '#4f46e5',
    key: '#4338ca',
  },
  dark: {
    background: '#111116',
    card: '#18181e',
    header: '#1f1f26',
    border: '#26262e',
    text: '#ededf0',
    muted: '#9b9ba7',
    edge: '#a5b4fc',
    key: '#a5b4fc',
  },
};

const TINTS: Record<NodeColor, string | null> = {
  default: null,
  primary: '#4f46e5',
  accent: '#0d9488',
  success: '#15803d',
  warning: '#f59e0b',
  danger: '#dc2626',
};

const PADDING = 40;
const WATERMARK_HEIGHT = 28;
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
/** Average glyph width at 12px, used to truncate without measuring text. */
const CHAR_WIDTH = 6.8;

/** Characters XML 1.0 forbids outright; they cannot even be escaped. */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Shortens `text` to roughly `width` pixels, ending in an ellipsis when cut. */
function fit(text: string, width: number): string {
  const max = Math.max(1, Math.floor(width / CHAR_WIDTH));
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const n = (value: number) => String(Math.round(value * 10) / 10);

interface Placed {
  readonly table: Table;
  readonly node: NodeLayout;
  readonly height: number;
  /** Row index of each visible column. */
  readonly rows: ReadonlyMap<Id, number>;
}

function place(schema: Schema, layout: Layout): Placed[] {
  return schema.tables.flatMap((table) => {
    const node = layout.nodes[table.id];
    if (!node) return [];
    const rows = new Map(visibleColumns(table, node.collapsed).map((c, i) => [c.id, i]));
    return [{ table, node, height: estimateNodeHeight(table, node.collapsed), rows }];
  });
}

function renderTable({ table, node, height }: Placed, p: Palette): string {
  const { x, y } = node;
  const parts: string[] = [
    `<g>`,
    `<rect x="${n(x)}" y="${n(y)}" width="${n(NODE_WIDTH)}" height="${n(height)}" rx="8" fill="${p.card}" stroke="${p.border}"/>`,
    `<path d="M${n(x + 0.5)} ${n(y + HEADER_HEIGHT)}V${n(y + 8)}a7.5 7.5 0 0 1 7.5 -7.5H${n(x + NODE_WIDTH - 8)}a7.5 7.5 0 0 1 7.5 7.5V${n(y + HEADER_HEIGHT)}Z" fill="${p.header}"/>`,
    `<line x1="${n(x)}" x2="${n(x + NODE_WIDTH)}" y1="${n(y + HEADER_HEIGHT)}" y2="${n(y + HEADER_HEIGHT)}" stroke="${p.border}"/>`,
  ];
  const tint = TINTS[node.color];
  let textX = x + 14;
  if (tint) {
    parts.push(`<circle cx="${n(x + 18)}" cy="${n(y + HEADER_HEIGHT / 2)}" r="5" fill="${tint}"/>`);
    textX = x + 30;
  }
  parts.push(
    `<text x="${n(textX)}" y="${n(y + HEADER_HEIGHT / 2 + 5)}" font-family="${FONT}" font-size="14" font-weight="600" fill="${p.text}">${escapeXml(fit(table.name, x + NODE_WIDTH - 14 - textX))}</text>`,
  );

  const columns = visibleColumns(table, node.collapsed);
  columns.forEach((column, i) => {
    const rowY = y + HEADER_HEIGHT + i * ROW_HEIGHT;
    const baseline = rowY + ROW_HEIGHT / 2 + 4;
    const flags = columnFlags(table, column);
    const badge = flags.pk ? 'PK' : flags.fk ? 'FK' : flags.unique ? 'UQ' : '';
    if (badge) {
      parts.push(
        `<text x="${n(x + 14)}" y="${n(baseline)}" font-family="${MONO}" font-size="10" font-weight="600" fill="${p.key}">${badge}</text>`,
      );
    }
    const type = fit(column.nativeType + (flags.nullable ? '?' : ''), 96);
    const nameWidth = NODE_WIDTH - 40 - 14 - type.length * CHAR_WIDTH - 8;
    parts.push(
      `<text x="${n(x + 40)}" y="${n(baseline)}" font-family="${FONT}" font-size="12" fill="${p.text}">${escapeXml(fit(column.name, nameWidth))}</text>`,
      `<text x="${n(x + NODE_WIDTH - 14)}" y="${n(baseline)}" text-anchor="end" font-family="${MONO}" font-size="11" fill="${p.muted}">${escapeXml(type)}</text>`,
    );
  });
  const hidden = table.columns.length - columns.length;
  if (hidden > 0 || table.columns.length === 0) {
    const rowY = y + HEADER_HEIGHT + columns.length * ROW_HEIGHT;
    const label = hidden > 0 ? `+${String(hidden)} more` : 'No columns';
    parts.push(
      `<text x="${n(x + 14)}" y="${n(rowY + ROW_HEIGHT / 2 + 4)}" font-family="${FONT}" font-size="12" font-style="italic" fill="${p.muted}">${label}</text>`,
    );
  }
  parts.push('</g>');
  return parts.join('');
}

/** Crow's-foot marker at (x, y); `dir` points away from the table (+1 right, -1 left). */
function marker(kind: Cardinality, x: number, y: number, dir: 1 | -1, color: string): string {
  const at = (dx: number) => n(x + dx * dir);
  const bar = (dx: number) =>
    `<line x1="${at(dx)}" x2="${at(dx)}" y1="${n(y - 6)}" y2="${n(y + 6)}" stroke="${color}" stroke-width="1.5"/>`;
  switch (kind) {
    case 'one':
      return bar(6) + bar(10);
    case 'zero-one':
      return (
        bar(6) +
        `<circle cx="${at(14)}" cy="${n(y)}" r="3.5" fill="none" stroke="${color}" stroke-width="1.5"/>`
      );
    case 'many':
      return `<path d="M${at(0)} ${n(y - 6)}L${at(10)} ${n(y)}L${at(0)} ${n(y + 6)}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
  }
}

function renderEdges(placed: readonly Placed[], p: Palette): string {
  const byId = new Map(placed.map((item) => [item.table.id, item]));
  const anchorY = (item: Placed, columnId: Id | undefined) => {
    const row = columnId === undefined ? undefined : item.rows.get(columnId);
    return row === undefined
      ? item.node.y + HEADER_HEIGHT / 2
      : item.node.y + HEADER_HEIGHT + row * ROW_HEIGHT + ROW_HEIGHT / 2;
  };
  const parts: string[] = [];
  for (const source of placed) {
    for (const fk of source.table.foreignKeys) {
      const target = byId.get(fk.refTable);
      if (!target) continue;
      const { sourceEnd, targetEnd } = cardinality(source.table, fk);
      const sy = anchorY(source, fk.columns[0]);
      const ty = anchorY(target, fk.refColumns[0]);
      let sx: number;
      let tx: number;
      let sDir: 1 | -1;
      let tDir: 1 | -1;
      if (target === source) {
        // A self-reference loops out of the right side and back.
        sx = tx = source.node.x + NODE_WIDTH;
        sDir = tDir = 1;
      } else if (source.node.x + NODE_WIDTH / 2 <= target.node.x + NODE_WIDTH / 2) {
        sx = source.node.x + NODE_WIDTH;
        tx = target.node.x;
        sDir = 1;
        tDir = -1;
      } else {
        sx = source.node.x;
        tx = target.node.x + NODE_WIDTH;
        sDir = -1;
        tDir = 1;
      }
      const reach = target === source ? 48 : Math.max(40, Math.abs(tx - sx) / 2);
      parts.push(
        `<path d="M${n(sx)} ${n(sy)}C${n(sx + reach * sDir)} ${n(sy)} ${n(tx + reach * tDir)} ${n(ty)} ${n(tx)} ${n(ty)}" fill="none" stroke="${p.edge}" stroke-width="1.5"/>`,
        marker(sourceEnd, sx, sy, sDir, p.edge),
        marker(targetEnd, tx, ty, tDir, p.edge),
      );
    }
  }
  return parts.join('');
}

function renderWatermark(right: number, bottom: number, p: Palette): string {
  const { card, header, rows, edge, node } = markGeometry;
  const size = 16;
  const label = 'Made with DashDB';
  const textWidth = label.length * 6.2;
  const x = right - textWidth - size - 6;
  const y = bottom - size;
  const mark = [
    `<rect x="${n(card.x)}" y="${n(card.y)}" width="${n(card.width)}" height="${n(card.height)}" rx="${n(card.rx)}" fill="none" stroke="${p.muted}" stroke-width="${n(card.strokeWidth)}"/>`,
    `<path d="${header}" fill="${p.edge}"/>`,
    ...rows.map(
      ([x1, x2, ry]) =>
        `<line x1="${n(x1)}" x2="${n(x2)}" y1="${n(ry)}" y2="${n(ry)}" stroke="${p.muted}" stroke-width="2" stroke-linecap="round"/>`,
    ),
    `<line x1="${n(edge.x1)}" x2="${n(edge.x2)}" y1="${n(edge.y)}" y2="${n(edge.y)}" stroke="${p.muted}" stroke-width="2" stroke-linecap="round"/>`,
    `<circle cx="${n(node.cx)}" cy="${n(node.cy)}" r="${n(node.r)}" fill="${p.edge}"/>`,
  ].join('');
  return (
    `<g opacity="0.85"><g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 32)})">${mark}</g>` +
    `<text x="${n(x + size + 6)}" y="${n(y + size / 2 + 4)}" font-family="${FONT}" font-size="11" font-weight="500" fill="${p.muted}">${label}</text></g>`
  );
}

/** The diagram as a standalone SVG document. */
export function renderDiagramSvg(
  schema: Schema,
  layout: Layout,
  options: DiagramImageOptions,
): DiagramImage {
  const p = PALETTES[options.theme];
  const placed = place(schema, layout);
  const bounds = placed.length
    ? {
        x0: Math.min(...placed.map((t) => t.node.x)),
        y0: Math.min(...placed.map((t) => t.node.y)),
        x1: Math.max(...placed.map((t) => t.node.x + NODE_WIDTH)),
        y1: Math.max(...placed.map((t) => t.node.y + t.height)),
      }
    : { x0: 0, y0: 0, x1: 240, y1: 80 };
  const left = bounds.x0 - PADDING;
  const top = bounds.y0 - PADDING;
  const width = Math.ceil(bounds.x1 - left + PADDING);
  const height = Math.ceil(bounds.y1 - top + PADDING + (options.watermark ? WATERMARK_HEIGHT : 0));

  const body = [
    options.transparent
      ? ''
      : `<rect x="${n(left)}" y="${n(top)}" width="${String(width)}" height="${String(height)}" fill="${p.background}"/>`,
    renderEdges(placed, p),
    ...placed.map((item) => renderTable(item, p)),
    options.watermark ? renderWatermark(left + width - 16, top + height - 12, p) : '',
  ].join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="${n(left)} ${n(top)} ${String(width)} ${String(height)}">` +
    `<title>${escapeXml(`${schema.tables.length === 1 ? '1 table' : `${String(schema.tables.length)} tables`} — DashDB diagram`)}</title>` +
    `${body}</svg>`;
  return { svg, width, height };
}
