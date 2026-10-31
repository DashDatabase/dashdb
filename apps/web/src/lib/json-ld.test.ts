import { describe, expect, it } from 'vitest';
import {
  breadcrumbListLd,
  faqPageLd,
  serializeJsonLd,
  softwareApplicationLd,
  type JsonLdObject,
} from './json-ld';
import { getPage } from './site';

const SITE = 'https://example.test';

describe('structured data', () => {
  it('describes the app with the properties Google requires for SoftwareApplication', () => {
    const app = softwareApplicationLd(SITE);
    expect(app).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'DashDB',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web browser',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      url: SITE,
    });
  });

  it('turns FAQ items into Question/Answer entities', () => {
    const faq = faqPageLd([{ question: 'Free?', answer: 'Yes.' }]);
    expect(faq).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } },
      ],
    });
  });

  it('numbers breadcrumb items from 1 with absolute URLs', () => {
    expect(breadcrumbListLd(getPage('diagram'), SITE).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Diagram editor',
        item: `${SITE}/features/diagram`,
      },
    ]);
  });
});

describe('serializeJsonLd', () => {
  it('cannot be broken out of its script element', () => {
    const hostile: JsonLdObject = {
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: '</script><script>alert(1)</script> & \u2028',
    };
    const out = serializeJsonLd(hostile);
    expect(out).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(out)).toEqual(hostile);
  });
});
