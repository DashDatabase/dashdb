import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Logo, LogoMark } from './logo';
import { renderMarkSvg } from './logo-geometry';

describe('Logo', () => {
  it('renders an accessible wordmark colored by tokens', () => {
    const html = renderToStaticMarkup(<Logo />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="DashDB"');
    expect(html).toContain('>DashDB</text>');
    expect(html).toContain('fill-primary');
    expect(html).toContain('fill-accent');
  });

  it('hides the mark from assistive tech unless it is labelled', () => {
    expect(renderToStaticMarkup(<LogoMark />)).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(<LogoMark aria-label="Home" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).not.toContain('aria-hidden');
  });
});

describe('renderMarkSvg', () => {
  const colors = { outline: 'o', header: 'h', rows: 'r', node: 'n' };

  it('draws the glyph with the given colors and size', () => {
    const svg = renderMarkSvg(colors, 64);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"')).toBe(
      true,
    );
    expect(svg).toContain('fill="h"');
    expect(svg).toContain('fill="n"');
    expect(svg).not.toContain('<rect width="32"');
  });

  it('adds a rounded tile when a tile color is given', () => {
    expect(renderMarkSvg({ ...colors, tile: 't' })).toContain(
      '<rect width="32" height="32" rx="7" fill="t"/>',
    );
  });
});
