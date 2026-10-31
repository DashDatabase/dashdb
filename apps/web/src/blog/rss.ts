// The blog's RSS 2.0 feed as a string: pure, so it can be tested without the MDX collections.

export interface FeedItem {
  readonly title: string;
  readonly url: string;
  readonly description: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly author: string;
  readonly tags: readonly string[];
}

export interface Feed {
  readonly title: string;
  readonly url: string;
  readonly feedUrl: string;
  readonly description: string;
  /** Newest first. */
  readonly items: readonly FeedItem[];
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Escapes text for an XML element or attribute value. */
export function xmlEscape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** `2026-10-31` as the RFC 822 date RSS requires. */
export function rfc822(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

export function renderRss(feed: Feed): string {
  const items = feed.items.map((item) =>
    [
      '    <item>',
      `      <title>${xmlEscape(item.title)}</title>`,
      `      <link>${xmlEscape(item.url)}</link>`,
      `      <guid isPermaLink="true">${xmlEscape(item.url)}</guid>`,
      `      <description>${xmlEscape(item.description)}</description>`,
      `      <pubDate>${rfc822(item.date)}</pubDate>`,
      `      <dc:creator>${xmlEscape(item.author)}</dc:creator>`,
      ...item.tags.map((tag) => `      <category>${xmlEscape(tag)}</category>`),
      '    </item>',
    ].join('\n'),
  );
  const newest = feed.items[0];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${xmlEscape(feed.title)}</title>`,
    `    <link>${xmlEscape(feed.url)}</link>`,
    `    <description>${xmlEscape(feed.description)}</description>`,
    '    <language>en</language>',
    `    <atom:link href="${xmlEscape(feed.feedUrl)}" rel="self" type="application/rss+xml"/>`,
    ...(newest ? [`    <lastBuildDate>${rfc822(newest.date)}</lastBuildDate>`] : []),
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
