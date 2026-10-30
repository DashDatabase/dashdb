'use client';

import { Button } from '@dashdb/ui';
import { PlusIcon, WorkflowIcon } from 'lucide-react';
import { getAction } from '../actions';
import { useRunAction } from '../hooks';
import { useEditor } from '../store';
import { ShortcutKeys } from './action-button';

/** Stand-in for the diagram canvas (P14). Shows which table a focus request targeted. */
export function CanvasPlaceholder() {
  const tableCount = useEditor((s) => s.project?.schema.tables.length ?? 0);
  const focused = useEditor((s) => {
    const id = s.focusRequest?.tableId;
    return id ? s.project?.schema.tables.find((t) => t.id === id)?.name : undefined;
  });
  const run = useRunAction();

  return (
    <section
      aria-label="Canvas"
      data-testid="canvas"
      className="flex h-full flex-col items-center justify-center gap-4 bg-background bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px] p-6 text-center"
    >
      <WorkflowIcon className="size-10 text-text-muted" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">Diagram canvas</p>
        <p className="text-sm text-text-muted">
          {tableCount === 0
            ? 'Add a table or import a schema to get started.'
            : focused
              ? `Focused on ${focused}`
              : 'Select a table in the sidebar to focus it.'}
        </p>
      </div>
      {tableCount === 0 && (
        <div className="flex gap-2">
          <Button
            onClick={() => {
              run(getAction('schema.addTable'));
            }}
          >
            <PlusIcon aria-hidden /> Add table <ShortcutKeys shortcut="n" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              run(getAction('file.import'));
            }}
          >
            Import schema
          </Button>
        </div>
      )}
    </section>
  );
}
