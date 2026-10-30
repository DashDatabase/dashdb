// The DashDB mark: a table node (header + rows) with a relation connector.
// Shared by the React <LogoMark> and the favicon generator so both draw the same shape.

/** Mark coordinates live in a 32×32 box. */
export const MARK_SIZE = 32;

export const markGeometry = {
  /** Table outline. */
  card: { x: 3, y: 6, width: 20, height: 20, rx: 4, strokeWidth: 2 },
  /** Filled header strip: top-rounded to match the card. */
  header: 'M3 10a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v3H3z',
  /** Column rows as [x1, x2, y]. */
  rows: [
    [7, 17, 17.5],
    [7, 13, 21.5],
  ],
  /** Relation edge and its endpoint. */
  edge: { x1: 23, x2: 26, y: 16 },
  node: { cx: 27.5, cy: 16, r: 2.5 },
} as const;

export interface MarkColors {
  /** Tile behind the mark; omit for a transparent background. */
  tile?: string;
  outline: string;
  header: string;
  rows: string;
  node: string;
}

/** Standalone SVG markup for favicons and app icons. */
export function renderMarkSvg(colors: MarkColors, size: number = MARK_SIZE): string {
  const { card, header, rows, edge, node } = markGeometry;
  // On a tile the glyph is inset so it clears the rounded corners.
  const content = colors.tile
    ? `<rect width="32" height="32" rx="7" fill="${colors.tile}"/><g transform="translate(3.2 3.2) scale(0.8)">`
    : '<g>';
  const rowLines = rows
    .map(
      ([x1, x2, y]) =>
        `<line x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" stroke="${colors.rows}" stroke-width="2" stroke-linecap="round"/>`,
    )
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}" fill="none">`,
    content,
    `<rect x="${card.x}" y="${card.y}" width="${card.width}" height="${card.height}" rx="${card.rx}" stroke="${colors.outline}" stroke-width="${card.strokeWidth}"/>`,
    `<path d="${header}" fill="${colors.header}"/>`,
    rowLines,
    `<line x1="${edge.x1}" x2="${edge.x2}" y1="${edge.y}" y2="${edge.y}" stroke="${colors.outline}" stroke-width="2" stroke-linecap="round"/>`,
    `<circle cx="${node.cx}" cy="${node.cy}" r="${node.r}" fill="${colors.node}"/>`,
    '</g></svg>',
  ].join('');
}
