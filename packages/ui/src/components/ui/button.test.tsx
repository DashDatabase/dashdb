import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders primary token styles by default', () => {
    const html = renderToStaticMarkup(<Button>Connect</Button>);
    expect(html).toContain('bg-primary');
    expect(html).toContain('text-primary-foreground');
    expect(html).toContain('>Connect</button>');
  });

  it('applies variants and lets extra classes override', () => {
    const html = renderToStaticMarkup(
      <Button variant="destructive" className="w-full px-8">
        Drop table
      </Button>,
    );
    expect(html).toContain('bg-destructive');
    expect(html).toContain('w-full');
    expect(html).toContain('px-8');
    expect(html).not.toContain(' px-4 ');
  });
});
