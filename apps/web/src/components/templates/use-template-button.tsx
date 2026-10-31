'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Copies a gallery template into this browser as a new project and opens it in the editor. The
 * template is the static .dashdb.json the page links to; the editor code loads only on click.
 */
export function UseTemplateButton({ href }: { href: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'opening' | 'failed'>('idle');

  const open = async () => {
    setState('opening');
    try {
      const [response, { importProjectFile }] = await Promise.all([
        fetch(href),
        import('@/editor/project-file'),
      ]);
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      const result = await importProjectFile(await response.text());
      if (!result.ok) throw new Error(result.errors.join('; '));
      router.push(`/app/p/${result.project.id}`);
    } catch {
      setState('failed');
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void open()}
        disabled={state === 'opening'}
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {state === 'opening' ? 'Opening…' : 'Use this template'}
      </button>
      <p role="status" className="mt-2 min-h-5 text-sm text-danger-text">
        {state === 'failed'
          ? 'Could not open the template in this browser. Try downloading it instead.'
          : ''}
      </p>
    </div>
  );
}
