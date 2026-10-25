import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders a type="button" with primary styles by default', () => {
    const html = renderToStaticMarkup(<Button>Connect</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain('bg-brand-600');
    expect(html).toContain('>Connect</button>');
  });

  it('applies the secondary variant and extra classes', () => {
    const html = renderToStaticMarkup(
      <Button variant="secondary" className="w-full">
        Cancel
      </Button>,
    );
    expect(html).toContain('border-brand-600');
    expect(html).toContain('w-full');
  });
});
