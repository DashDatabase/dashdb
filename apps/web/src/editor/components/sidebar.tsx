'use client';

import type { Schema, Table } from '@dashdb/core';
import { Button, Input, ScrollArea, Tooltip, TooltipContent, TooltipTrigger, cn } from '@dashdb/ui';
import { ArrowRightIcon, ListIcon, PlusIcon, SearchIcon, TableIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAction } from '../actions';
import { useRunAction } from '../hooks';
import { useEditor } from '../store';
import { ShortcutKeys } from './action-button';

interface Relationship {
  id: string;
  tableId: string;
  label: string;
}

function relationships(schema: Schema): Relationship[] {
  const tables = new Map(schema.tables.map((t) => [t.id, t]));
  const columnName = (table: Table | undefined, id: string) =>
    table?.columns.find((c) => c.id === id)?.name ?? '?';
  return schema.tables.flatMap((table) =>
    table.foreignKeys.map((fk) => {
      const target = tables.get(fk.refTable);
      const from = fk.columns.map((id) => columnName(table, id)).join(', ');
      const to = fk.refColumns.map((id) => columnName(target, id)).join(', ');
      return {
        id: fk.id,
        tableId: table.id,
        label: `${table.name}.${from} → ${target?.name ?? '?'}.${to}`,
      };
    }),
  );
}

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-1">
      <div className="flex h-7 items-center justify-between px-2">
        <h2 className="text-xs font-medium tracking-wide text-text-muted uppercase">
          {title} <span className="tabular-nums">({count})</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const itemClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none hover:bg-highlight focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function Sidebar() {
  const schema = useEditor((s) => s.doc?.schema);
  const selectedTableId = useEditor((s) => s.selection.tableId);
  const searchRequest = useEditor((s) => s.searchRequest);
  const focusTable = useEditor((s) => s.focusTable);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const run = useRunAction();

  useEffect(() => {
    if (searchRequest > 0) searchRef.current?.focus();
  }, [searchRequest]);

  const needle = query.trim().toLowerCase();
  const tables = useMemo(
    () =>
      (schema?.tables ?? []).filter(
        (t) =>
          !needle ||
          t.name.toLowerCase().includes(needle) ||
          t.columns.some((c) => c.name.toLowerCase().includes(needle)),
      ),
    [schema, needle],
  );
  const enums = (schema?.enums ?? []).filter(
    (e) => !needle || e.name.toLowerCase().includes(needle),
  );
  const relations = useMemo(() => (schema ? relationships(schema) : []), [schema]).filter(
    (r) => !needle || r.label.toLowerCase().includes(needle),
  );

  return (
    <nav aria-label="Schema" className="flex h-full flex-col bg-surface">
      <div className="relative border-b p-2">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <Input
          ref={searchRef}
          type="search"
          aria-label="Search tables"
          placeholder="Search tables…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.blur();
          }}
          className="h-8 pr-10 pl-8"
        />
        <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2">
          <ShortcutKeys shortcut="/" />
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-2">
          <Section
            title="Tables"
            count={tables.length}
            action={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Add table"
                    onClick={() => {
                      run(getAction('schema.addTable'));
                    }}
                  >
                    <PlusIcon aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-2">
                  Add table <ShortcutKeys shortcut="n" />
                </TooltipContent>
              </Tooltip>
            }
          >
            {tables.length === 0 ? (
              <p className="px-2 text-sm text-text-muted">
                {needle ? 'No matching tables.' : 'No tables yet.'}
              </p>
            ) : (
              <ul>
                {tables.map((table) => (
                  <li key={table.id}>
                    <button
                      type="button"
                      aria-current={table.id === selectedTableId ? 'true' : undefined}
                      className={cn(
                        itemClass,
                        table.id === selectedTableId && 'bg-highlight font-medium',
                      )}
                      onClick={() => {
                        focusTable(table.id);
                      }}
                    >
                      <TableIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
                      <span className="truncate">{table.name}</span>
                      <span className="ml-auto text-xs text-text-muted tabular-nums">
                        {table.columns.length}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Enums" count={enums.length}>
            {enums.length === 0 ? (
              <p className="px-2 text-sm text-text-muted">No enums.</p>
            ) : (
              <ul>
                {enums.map((e) => (
                  <li key={e.id} className={cn(itemClass, 'hover:bg-transparent')}>
                    <ListIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
                    <span className="truncate">{e.name}</span>
                    <span className="ml-auto truncate text-xs text-text-muted">
                      {e.values.join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Relationships" count={relations.length}>
            {relations.length === 0 ? (
              <p className="px-2 text-sm text-text-muted">No foreign keys.</p>
            ) : (
              <ul>
                {relations.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className={cn(itemClass, 'font-mono text-xs')}
                      onClick={() => {
                        focusTable(r.tableId);
                      }}
                    >
                      <ArrowRightIcon className="size-3.5 shrink-0 text-text-muted" aria-hidden />
                      <span className="truncate">{r.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </ScrollArea>
    </nav>
  );
}
