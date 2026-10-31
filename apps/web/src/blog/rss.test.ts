import { describe, expect, it } from 'vitest';
import { renderRss, rfc822, xmlEscape } from './rss';

describe('RSS feed', () => {
  it('escapes XML special characters', () => {
    expect(xmlEscape(`a & b <c> "d" 'e'`)).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;');
  });

  it('formats dates as RFC 822 in UTC', () => {
    expect(rfc822('2026-10-31')).toBe('Sat, 31 Oct 2026 00:00:00 GMT');
  });

  it('renders a channel with one item per post', () => {
    const xml = renderRss({
      title: 'DashDB blog',
      url: 'https://example.test/blog',
      feedUrl: 'https://example.test/blog/rss.xml',
      description: 'Posts',
      items: [
        {
          title: 'Locks & <indexes>',
          url: 'https://example.test/blog/locks',
          description: 'Why',
          date: '2026-11-01',
          author: 'The DashDB team',
          tags: ['postgres', 'safety'],
        },
      ],
    });
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
    expect(xml).toContain('<title>Locks &amp; &lt;indexes&gt;</title>');
    expect(xml).toContain('<guid isPermaLink="true">https://example.test/blog/locks</guid>');
    expect(xml).toContain('<category>safety</category>');
    expect(xml).toContain('<lastBuildDate>Sun, 01 Nov 2026 00:00:00 GMT</lastBuildDate>');
    expect(xml.match(/<item>/g)).toHaveLength(1);
  });
});
