'use client';

import {
  fromNativeType,
  removeColumn,
  renameColumn,
  renameTable,
  updateColumn,
  updateTable,
  type Column,
  type LogicalType,
  type Schema,
  type Table,
} from '@dashdb/core/lite';
import { Badge, Button, Separator, Switch, toast } from '@dashdb/ui';
import {
  ChevronLeftIcon,
  KeyRoundIcon,
  MousePointerClickIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { getAction } from '../actions';
import { useRunAction } from '../hooks';
import { useEditor } from '../store';
import { describeDefault } from '../schema-text';
import { CommitInput, CommitTextarea } from './commit-input';

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function logicalTypeFor(schema: Schema, nativeType: string): LogicalType {
  if (schema.dialect === 'sqlite') return { kind: 'unknown' };
  return fromNativeType(schema.dialect, nativeType, { enums: schema.enums }) ?? { kind: 'unknown' };
}

/** Applies an edit and reports a rejected one (e.g. a rename that breaks a reference). */
function useEdit() {
  const editSchema = useEditor((s) => s.editSchema);
  return (label: string, change: (schema: Schema) => Schema) => {
    if (!editSchema(label, change)) toast.error('That change could not be applied.');
  };
}

function TableForm({ table }: { table: Table }) {
  const apply = useEdit();
  const select = useEditor((s) => s.select);
  const run = useRunAction();
  const pk = new Set(table.primaryKey?.columns ?? []);

  return (
    <div className="space-y-4">
      <Field label="Table name">
        {(id) => (
          <CommitInput
            id={id}
            value={table.name}
            onCommit={(name) => {
              if (name.trim()) apply('Rename table', (s) => renameTable(s, table.id, name.trim()));
            }}
          />
        )}
      </Field>
      <Field label="Comment">
        {(id) => (
          <CommitTextarea
            id={id}
            value={table.comment ?? ''}
            placeholder="What is this table for?"
            onCommit={(comment) => {
              apply('Edit table comment', (s) =>
                updateTable(s, table.id, { comment: comment.trim() || null }),
              );
            }}
          />
        )}
      </Field>

      <Separator />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Columns ({table.columns.length})</h3>
        <Button
          variant="ghost"
          size="xs"
          data-tour="add-column"
          aria-keyshortcuts="C"
          onClick={() => {
            run(getAction('schema.addColumn'));
          }}
        >
          <PlusIcon aria-hidden /> Add column
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {table.columns.map((column) => (
          <li key={column.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none hover:bg-highlight focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => {
                select(table.id, column.id);
              }}
            >
              {pk.has(column.id) ? (
                <KeyRoundIcon className="size-3.5 text-warning-text" aria-label="Primary key" />
              ) : (
                <span className="size-3.5" />
              )}
              <span className="truncate font-mono">{column.name}</span>
              <span className="ml-auto truncate font-mono text-xs text-text-muted">
                {column.nativeType}
                {column.nullable ? '?' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Button
        variant="outline"
        size="sm"
        className="w-full text-danger-text"
        onClick={() => {
          run(getAction('schema.deleteTable'));
        }}
      >
        <Trash2Icon aria-hidden /> Delete table
      </Button>
    </div>
  );
}

function ColumnForm({ table, column }: { table: Table; column: Column }) {
  const apply = useEdit();
  const select = useEditor((s) => s.select);
  const nullableId = useId();
  const autoId = useId();
  const isPk = table.primaryKey?.columns.includes(column.id) ?? false;

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="xs"
        className="-ml-2"
        onClick={() => {
          select(table.id);
        }}
      >
        <ChevronLeftIcon aria-hidden /> {table.name}
      </Button>
      <div className="flex flex-wrap gap-1.5">
        {isPk && <Badge variant="warning">Primary key</Badge>}
        <Badge variant="secondary">{column.logicalType.kind}</Badge>
      </div>
      <Field label="Column name">
        {(id) => (
          <CommitInput
            id={id}
            value={column.name}
            className="font-mono"
            onCommit={(name) => {
              if (name.trim())
                apply('Rename column', (s) => renameColumn(s, table.id, column.id, name.trim()));
            }}
          />
        )}
      </Field>
      <Field label="Type">
        {(id) => (
          <CommitInput
            id={id}
            value={column.nativeType}
            className="font-mono"
            onCommit={(raw) => {
              const nativeType = raw.trim();
              if (!nativeType) return;
              apply('Change column type', (s) =>
                updateColumn(s, table.id, column.id, {
                  nativeType,
                  logicalType: logicalTypeFor(s, nativeType),
                }),
              );
            }}
          />
        )}
      </Field>
      <div className="flex items-center justify-between">
        <label htmlFor={nullableId} className="text-sm">
          Nullable
        </label>
        <Switch
          id={nullableId}
          checked={column.nullable}
          disabled={isPk}
          onCheckedChange={(nullable) => {
            apply('Toggle nullable', (s) => updateColumn(s, table.id, column.id, { nullable }));
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor={autoId} className="text-sm">
          Auto increment
        </label>
        <Switch
          id={autoId}
          checked={column.autoIncrement}
          onCheckedChange={(autoIncrement) => {
            apply('Toggle auto increment', (s) =>
              updateColumn(s, table.id, column.id, { autoIncrement }),
            );
          }}
        />
      </div>
      <Field label="Default">
        {(id) => (
          <CommitInput
            id={id}
            value={describeDefault(column)}
            placeholder="No default"
            className="font-mono"
            onCommit={(raw) => {
              const sql = raw.trim();
              apply('Edit column default', (s) =>
                updateColumn(s, table.id, column.id, {
                  default: sql ? { kind: 'expression', sql } : null,
                }),
              );
            }}
          />
        )}
      </Field>
      <Field label="Comment">
        {(id) => (
          <CommitTextarea
            id={id}
            value={column.comment ?? ''}
            onCommit={(comment) => {
              apply('Edit column comment', (s) =>
                updateColumn(s, table.id, column.id, { comment: comment.trim() || null }),
              );
            }}
          />
        )}
      </Field>
      <Button
        variant="outline"
        size="sm"
        className="w-full text-danger-text"
        onClick={() => {
          apply('Delete column', (s) => removeColumn(s, table.id, column.id));
        }}
      >
        <Trash2Icon aria-hidden /> Delete column
      </Button>
    </div>
  );
}

export function Inspector() {
  const schema = useEditor((s) => s.doc?.schema);
  const { tableId, columnId } = useEditor((s) => s.selection);
  const table = schema?.tables.find((t) => t.id === tableId);
  const column = table?.columns.find((c) => c.id === columnId);

  if (!table) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-text-muted">
        <MousePointerClickIcon className="size-6" aria-hidden />
        Select a table to edit its properties.
      </div>
    );
  }
  return (
    <div className="p-4" data-testid="inspector">
      {column ? <ColumnForm table={table} column={column} /> : <TableForm table={table} />}
    </div>
  );
}
