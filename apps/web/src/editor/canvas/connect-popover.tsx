'use client';

import { addForeignKey, REFERENTIAL_ACTIONS, type ReferentialAction } from '@dashdb/core/lite';
import {
  Button,
  Input,
  Popover,
  PopoverAnchor,
  PopoverContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@dashdb/ui';
import { AlertTriangleIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { editorStore, useEditor } from '../store';
import { useCanvasUi } from './canvas-ui';
import type { RelationshipDraft } from './relationship';

function ActionSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ReferentialAction;
  onChange: (value: ReferentialAction) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      <Select
        value={value}
        onValueChange={(next) => {
          onChange(next as ReferentialAction);
        }}
      >
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REFERENTIAL_ACTIONS.map((action) => (
            <SelectItem key={action} value={action}>
              {action.toUpperCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function ConnectForm({ draft, onDone }: { draft: RelationshipDraft; onDone: () => void }) {
  const [name, setName] = useState(draft.name);
  const [onDelete, setOnDelete] = useState(draft.onDelete);
  const [onUpdate, setOnUpdate] = useState(draft.onUpdate);
  const summary = useEditor((s) => {
    const tables = s.doc?.schema.tables ?? [];
    const table = tables.find((t) => t.id === draft.tableId);
    const ref = tables.find((t) => t.id === draft.refTableId);
    const col = (t: typeof table, id: string) => t?.columns.find((c) => c.id === id)?.name ?? '?';
    return `${table?.name ?? '?'}.${col(table, draft.columnId)} → ${ref?.name ?? '?'}.${col(ref, draft.refColumnId)}`;
  });

  const create = () => {
    const ok = editorStore.getState().editSchema('Add relationship', (schema) =>
      addForeignKey(schema, draft.tableId, {
        name: name.trim() || draft.name,
        columns: [draft.columnId],
        refTable: draft.refTableId,
        refColumns: [draft.refColumnId],
        onDelete,
        onUpdate,
      }),
    );
    if (!ok) toast.error('The relationship could not be created.');
    onDone();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      <div>
        <h2 className="text-sm font-semibold">New relationship</h2>
        <p className="truncate font-mono text-xs text-text-muted" title={summary}>
          {summary}
        </p>
      </div>
      <Field label="Constraint name">
        {(id) => (
          <Input
            id={id}
            value={name}
            className="h-8 font-mono text-xs"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <ActionSelect label="On delete" value={onDelete} onChange={setOnDelete} />
        <ActionSelect label="On update" value={onUpdate} onChange={setOnUpdate} />
      </div>
      {draft.warnings.length > 0 && (
        <ul className="space-y-1 rounded-md bg-warning/10 p-2 text-xs">
          {draft.warnings.map((warning) => (
            <li key={warning} className="flex gap-1.5">
              <AlertTriangleIcon className="mt-0.5 size-3 shrink-0 text-warning-text" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Create relationship
        </Button>
      </div>
    </form>
  );
}

/** Confirms a relationship drawn between two column handles. */
export function ConnectPopover() {
  const connection = useCanvasUi((s) => s.connection);
  const setConnection = useCanvasUi((s) => s.setConnection);
  if (!connection) return null;
  const close = () => {
    setConnection(null);
  };
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <PopoverAnchor asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: connection.x, top: connection.y }}
        />
      </PopoverAnchor>
      <PopoverContent aria-label="New relationship" className="w-80" side="right" align="start">
        <ConnectForm draft={connection.draft} onDone={close} />
      </PopoverContent>
    </Popover>
  );
}
