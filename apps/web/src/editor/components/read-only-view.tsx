'use client';

import { Badge, LogoMark, ThemeToggle } from '@dashdb/ui';
import { MonitorIcon } from 'lucide-react';
import Link from 'next/link';
import type { Project } from '../projects';

/** Below 1024px the editor is replaced by a read-only outline of the schema. */
export function ReadOnlyView({ project }: { project: Project }) {
  const { schema } = project;
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-12 items-center gap-3 border-b bg-surface px-4">
        <Link href="/app" aria-label="All projects">
          <LogoMark className="size-6" />
        </Link>
        <h1 className="truncate font-medium">{project.name}</h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 p-4">
        <div
          role="note"
          data-testid="read-only-notice"
          className="flex gap-3 rounded-lg border bg-surface p-4 text-sm"
        >
          <MonitorIcon className="mt-0.5 size-5 shrink-0 text-primary-text" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Read-only on small screens</p>
            <p className="text-text-muted">
              The editor needs a window at least 1024px wide. Open this project on a larger screen
              to make changes.
            </p>
          </div>
        </div>
        {schema.tables.length === 0 ? (
          <p className="text-sm text-text-muted">This project has no tables yet.</p>
        ) : (
          <ul className="space-y-3">
            {schema.tables.map((table) => (
              <li key={table.id} className="rounded-lg border bg-surface-raised">
                <h2 className="border-b px-3 py-2 font-mono text-sm font-medium">{table.name}</h2>
                <ul className="divide-y text-sm">
                  {table.columns.map((column) => (
                    <li
                      key={column.id}
                      className="flex justify-between gap-3 px-3 py-1.5 font-mono"
                    >
                      <span>{column.name}</span>
                      <span className="text-text-muted">
                        {column.nativeType}
                        {column.nullable ? '?' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {schema.enums.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Enums</h2>
            <div className="flex flex-wrap gap-2">
              {schema.enums.map((e) => (
                <Badge key={e.id} variant="secondary" className="font-mono">
                  {e.name}
                </Badge>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
