import { parsePostgresDDL, type Schema } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { shopSchema } from '../canvas/test-schema';
import { layoutFor } from '../store/layout';
import type { Layout } from '../store';
import { escapeXml, renderDiagramSvg, type DiagramImageOptions } from './diagram-svg';
import { pngScale } from './image-export';

const OPTIONS: DiagramImageOptions = { theme: 'light', transparent: false, watermark: true };

const ELEMENTS = new Set(['svg', 'title', 'g', 'rect', 'path', 'line', 'circle', 'text']);
const ATTRIBUTES = new Set([
  'xmlns',
  'width',
  'height',
  'viewBox',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'd',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'opacity',
  'transform',
  'text-anchor',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
]);

/**
 * A strict structural check: every tag is an allowed shape or text element with allowed,
 * double-quoted attributes; tags balance; text holds only escaped markup.
 */
function assertSafeSvg(svg: string): void {
  const stack: string[] = [];
  // Test-only and run on DashDB's own bounded output.
  // eslint-disable-next-line security/detect-unsafe-regex
  const tag = /<(\/?)([A-Za-z]+)((?:\s+[A-Za-z][A-Za-z0-9:-]*="[^"<>]*")*)\s*(\/?)>/g;
  let last = 0;
  for (const match of svg.matchAll(tag)) {
    const [whole, closing, name = '', attrs = '', selfClosing] = match;
    const text = svg.slice(last, match.index);
    expect(text, 'text between tags').not.toMatch(/[<>]|&(?!(amp|lt|gt|quot|apos);)/);
    last = match.index + whole.length;
    expect(ELEMENTS.has(name), `element <${name}>`).toBe(true);
    for (const [, attr = '', value = ''] of attrs.matchAll(/([A-Za-z][A-Za-z0-9:-]*)="([^"]*)"/g)) {
      expect(ATTRIBUTES.has(attr), `attribute ${attr}`).toBe(true);
      expect(value).not.toMatch(/url\(|javascript:|&(?!(amp|lt|gt|quot|apos);)/i);
    }
    if (closing) expect(stack.pop()).toBe(name);
    else if (!selfClosing) stack.push(name);
  }
  expect(svg.slice(last)).toBe('');
  expect(stack).toEqual([]);
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
}

function render(schema: Schema, options: Partial<DiagramImageOptions> = {}, layout?: Layout) {
  return renderDiagramSvg(schema, layout ?? layoutFor(schema), { ...OPTIONS, ...options });
}

describe('renderDiagramSvg', () => {
  it('draws every table, column and relationship', () => {
    const schema = shopSchema();
    const { svg, width, height } = render(schema);
    assertSafeSvg(svg);
    for (const name of ['customers', 'orders', 'profiles', 'coupons', 'customer_id', 'varchar(20)'])
      expect(svg).toContain(`>${name}`);
    const edges = schema.tables.flatMap((t) => t.foreignKeys).length;
    expect(svg.match(/<path d="M[^"]+C/g)).toHaveLength(edges);
    expect(width).toBeGreaterThan(272);
    expect(height).toBeGreaterThan(100);
  });

  it('escapes hostile names and drops characters XML cannot hold', () => {
    const { schema } = parsePostgresDDL('CREATE TABLE t (a int PRIMARY KEY, b text, c int);');
    const [table] = schema.tables;
    if (!table) throw new Error('no table');
    // Set on the IR directly: names can hold anything a project file or edit puts there.
    const names = ['x" onload="alert(1)', 'a&b]]>', '<foreignObject>'];
    const hostile: Schema = {
      ...schema,
      tables: [
        {
          ...table,
          name: '<script>alert(1)</script>\u0000\u001b',
          columns: table.columns.map((c, i) => ({
            ...c,
            name: names[i] ?? c.name,
            nativeType: i === 2 ? '<img src=x onerror=alert(1)>' : c.nativeType,
          })),
        },
      ],
    };
    const { svg } = render(hostile);
    assertSafeSvg(svg);
    // The names survive only as escaped text, never as elements or attributes.
    expect(svg).not.toMatch(/<script|<foreignObject|<img|\son\w+="/i);
    expect(svg).toContain('x&quot; onload=&quot;');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toMatch(/[\u0000-\u0008\u001b]/);
  });

  it('honours the background, watermark and theme options', () => {
    const schema = shopSchema();
    const plain = render(schema, { transparent: true, watermark: false });
    const branded = render(schema);
    expect(branded.svg).toContain('Made with DashDB');
    expect(plain.svg).not.toContain('Made with DashDB');
    expect(branded.svg).toContain('fill="#f7f7f9"');
    expect(plain.svg).not.toContain('fill="#f7f7f9"');
    expect(branded.height).toBeGreaterThan(plain.height);
    const dark = render(schema, { theme: 'dark' });
    expect(dark.svg).toContain('fill="#111116"');
    assertSafeSvg(dark.svg);
    assertSafeSvg(plain.svg);
  });

  it('shows collapsed tables, tints and long names', () => {
    const { schema } = parsePostgresDDL(`
      CREATE TABLE ${'a'.repeat(80)} (id int PRIMARY KEY, other int, note text);
      CREATE TABLE b (id int PRIMARY KEY, a_id int REFERENCES ${'a'.repeat(80)} (id));
    `);
    const base = layoutFor(schema);
    const [a, b] = schema.tables;
    if (!a || !b) throw new Error('missing tables');
    const layout: Layout = {
      nodes: {
        ...base.nodes,
        // b sits left of a, so its edge leaves from the left side.
        [a.id]: { x: 600, y: 0, collapsed: true, color: 'warning' },
        [b.id]: { x: 0, y: 300, collapsed: false, color: 'default' },
      },
    };
    const { svg } = render(schema, {}, layout);
    assertSafeSvg(svg);
    expect(svg).toContain('+2 more');
    expect(svg).toContain('fill="#f59e0b"');
    expect(svg).toContain('…');
    expect(svg).not.toContain('a'.repeat(80));
  });

  it('renders an empty schema and skips tables without a layout node', () => {
    const empty = render(parsePostgresDDL('').schema);
    assertSafeSvg(empty.svg);
    const schema = shopSchema();
    const { svg } = render(schema, {}, { nodes: {} });
    assertSafeSvg(svg);
    expect(svg).not.toContain('customers');
  });
});

describe('escapeXml', () => {
  it('escapes markup characters and removes forbidden control characters', () => {
    expect(escapeXml(`<a href="x">'&'</a>\u0007`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;',
    );
  });
});

describe('pngScale', () => {
  it('keeps 2× for normal diagrams and shrinks huge ones under canvas limits', () => {
    expect(pngScale({ width: 1200, height: 800 })).toBe(2);
    expect(pngScale({ width: 12_000, height: 1000 })).toBeCloseTo(16_384 / 12_000);
    const scale = pngScale({ width: 9000, height: 9000 });
    expect(9000 * 9000 * scale * scale).toBeLessThanOrEqual(64_000_000 + 1);
  });
});
