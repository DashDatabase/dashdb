'use client';

import { renameColumn, renameTable, type Column, type Schema, type Table } from '@dashdb/core';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  cn,
  toast,
} from '@dashdb/ui';
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import {
  CircleDashedIcon,
  FingerprintIcon,
  KeyRoundIcon,
  Link2Icon,
  MoreHorizontalIcon,
} from 'lucide-react';
import { memo, useState, type KeyboardEvent } from 'react';
import { cachedCompare, type ChangeKind, type TableChange } from '../migration/visual-diff';
import { editorStore, useEditor } from '../store';
import { keepRenameFocus, useCanvasUi } from './canvas-ui';
import { COLOR_CLASSES, TableMenuItems } from './menus';
import {
  columnFlags,
  columnHandleId,
  COMPACT_ZOOM,
  NODE_WIDTH,
  ROW_HEIGHT,
  tableHandleId,
  visibleColumns,
  type TableFlowNode,
} from './model';

const handleClass =
  '!size-2.5 !min-w-0 !rounded-full !border-2 !border-background !bg-primary opacity-0 transition-opacity group-hover/node:opacity-100 [.connecting_&]:opacity-100';

function commitRename(label: string, apply: (schema: Schema) => Schema) {
  if (!editorStore.getState().editSchema(label, apply)) {
    toast.error('That name could not be applied.');
  }
}

/** Inline text field for renaming on the canvas. Enter or blur commits; Escape cancels. */
function InlineName({
  value,
  label,
  className,
  onCommit,
}: {
  value: string;
  label: string;
  className?: string;
  onCommit: (name: string) => void;
}) {
  const stopRename = useCanvasUi((s) => s.stopRename);
  const [draft, setDraft] = useState(value);
  const finish = (commit: boolean) => {
    const name = draft.trim();
    if (commit && name && name !== value) onCommit(name);
    stopRename();
  };
  return (
    <input
      // The user explicitly asked to rename, so focus moves into the field.
      autoFocus
      aria-label={label}
      data-inline-rename
      value={draft}
      spellCheck={false}
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        finish(true);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') finish(false);
      }}
      className={cn(
        'nodrag nopan min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 outline-none',
        className,
      )}
    />
  );
}

function ColumnIcons({ table, column }: { table: Table; column: Column }) {
  const flags = columnFlags(table, column);
  return (
    <span className="flex w-10 shrink-0 items-center gap-0.5 text-text-muted [&_svg]:size-3">
      {flags.pk && (
        <KeyRoundIcon role="img" aria-label="Primary key" className="text-warning-text" />
      )}
      {flags.fk && <Link2Icon role="img" aria-label="Foreign key" className="text-primary-text" />}
      {flags.unique && !flags.pk && (
        <FingerprintIcon role="img" aria-label="Unique" className="text-accent-text" />
      )}
      {flags.nullable && <CircleDashedIcon role="img" aria-label="Nullable" />}
    </span>
  );
}

/** What changed in this table since the Migration panel's "from" schema, while it is shown. */
function useTableChange(tableId: string): TableChange | null {
  return useEditor((s) =>
    s.migrationOverlay && s.doc
      ? (cachedCompare(s.migrationOverlay, s.doc.schema).tables.get(tableId) ?? null)
      : null,
  );
}

const CHANGE_ROW: Record<ChangeKind, string> = {
  added: 'bg-success/10 shadow-[inset_3px_0_0_var(--success)]',
  changed: 'bg-warning/10 shadow-[inset_3px_0_0_var(--warning)]',
};

const CHANGE_NODE: Record<ChangeKind, string> = {
  added: 'outline-2 outline-offset-2 outline-success',
  changed: 'outline-2 outline-offset-2 outline-warning',
};

function ColumnRow({
  table,
  column,
  change,
}: {
  table: Table;
  column: Column;
  change: ChangeKind | null;
}) {
  const renaming = useCanvasUi(
    (s) => s.renaming?.tableId === table.id && s.renaming.columnId === column.id,
  );
  const startRename = useCanvasUi((s) => s.startRename);
  const selected = useEditor(
    (s) => s.selection.tableId === table.id && s.selection.columnId === column.id,
  );

  return (
    <li
      data-testid="column-row"
      data-column={column.name}
      className={cn(
        'relative flex items-center gap-1.5 px-3 text-xs last:rounded-b-lg',
        change && CHANGE_ROW[change],
        selected && 'bg-primary/10',
      )}
      data-change={change ?? undefined}
      style={{ height: ROW_HEIGHT }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        startRename(table.id, column.id);
      }}
    >
      <Handle
        type="source"
        position={Position.Left}
        id={columnHandleId(column.id, 'l')}
        className={handleClass}
        title={`Drag to relate ${table.name}.${column.name}`}
      />
      <ColumnIcons table={table} column={column} />
      {renaming ? (
        <InlineName
          value={column.name}
          label="Column name"
          className="font-mono text-xs"
          onCommit={(name) => {
            commitRename('Rename column', (s) => renameColumn(s, table.id, column.id, name));
          }}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate font-mono" title={column.name}>
          {column.name}
        </span>
      )}
      <span
        className="max-w-28 shrink-0 truncate font-mono text-text-muted"
        title={column.nativeType}
      >
        {column.nativeType}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id={columnHandleId(column.id, 'r')}
        className={handleClass}
        title={`Drag to relate ${table.name}.${column.name}`}
      />
    </li>
  );
}

function TableNodeView({ data, selected }: NodeProps<TableFlowNode>) {
  const { table, layout } = data;
  const renaming = useCanvasUi(
    (s) => s.renaming?.tableId === table.id && s.renaming.columnId === null,
  );
  const startRename = useCanvasUi((s) => s.startRename);
  const [menuOpen, setMenuOpen] = useState(false);
  // Re-renders only when the zoom crosses the threshold, not on every zoom step.
  const compact = useStore((s) => s.transform[2] < COMPACT_ZOOM);
  const columns = visibleColumns(table, layout.collapsed);
  const hidden = table.columns.length - columns.length;
  const rows = columns.length + (hidden > 0 || columns.length === 0 ? 1 : 0);
  const change = useTableChange(table.id);

  return (
    <article
      aria-label={`Table ${table.name}`}
      data-testid="table-node"
      data-table={table.name}
      data-selected={selected ? 'true' : undefined}
      data-change={change?.kind}
      className={cn(
        'group/node rounded-lg border bg-surface-raised text-text shadow-sm',
        change && CHANGE_NODE[change.kind],
        selected && 'border-primary ring-2 ring-primary/40',
      )}
      style={{ width: NODE_WIDTH }}
    >
      <header className="relative flex h-10 items-center gap-2 rounded-t-lg border-b bg-surface pr-1 pl-3">
        <Handle
          type="source"
          position={Position.Left}
          id={tableHandleId('l')}
          className="!opacity-0"
          isConnectable={false}
        />
        <span
          className={cn('size-2.5 shrink-0 rounded-full', COLOR_CLASSES[layout.color])}
          aria-hidden
        />
        {renaming ? (
          <InlineName
            value={table.name}
            label="Table name"
            className="text-sm font-semibold"
            onCommit={(name) => {
              commitRename('Rename table', (s) => renameTable(s, table.id, name));
            }}
          />
        ) : (
          <h3
            className="min-w-0 flex-1 truncate text-sm font-semibold"
            title={table.name}
            onDoubleClick={(event) => {
              event.stopPropagation();
              startRename(table.id);
            }}
          >
            {table.name}
          </h3>
        )}
        {!compact && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="nodrag shrink-0"
                aria-label={`Actions for table ${table.name}`}
              >
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            {menuOpen && (
              <DropdownMenuContent
                align="start"
                className="min-w-52"
                onCloseAutoFocus={keepRenameFocus}
              >
                <TableMenuItems tableId={table.id} />
              </DropdownMenuContent>
            )}
          </DropdownMenu>
        )}
        <Handle
          type="source"
          position={Position.Right}
          id={tableHandleId('r')}
          className="!opacity-0"
          isConnectable={false}
        />
      </header>
      {compact ? (
        // Too small to read: a same-sized placeholder keeps layout and edges stable.
        <div
          aria-hidden
          className="rounded-b-lg bg-[repeating-linear-gradient(to_bottom,transparent_0_27px,var(--border)_27px_28px)]"
          style={{ height: rows * ROW_HEIGHT }}
        />
      ) : (
        <ul>
          {columns.map((column) => (
            <ColumnRow
              key={column.id}
              table={table}
              column={column}
              change={change?.columns.get(column.id) ?? null}
            />
          ))}
          {change?.removedColumns.map((name) => (
            <li
              key={`removed:${name}`}
              data-testid="removed-column"
              className="flex items-center gap-1.5 bg-danger/10 px-3 font-mono text-xs text-danger-text line-through shadow-[inset_3px_0_0_var(--danger)] last:rounded-b-lg"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="w-10 shrink-0" aria-hidden />
              <span className="sr-only">Removed column </span>
              {name}
            </li>
          ))}
          {columns.length === 0 && hidden === 0 && (
            <li
              className="flex items-center px-3 text-xs text-text-muted"
              style={{ height: ROW_HEIGHT }}
            >
              No columns
            </li>
          )}
          {hidden > 0 && (
            <li
              className="flex items-center px-3 text-xs text-text-muted"
              style={{ height: ROW_HEIGHT }}
            >
              {hidden} more {hidden === 1 ? 'column' : 'columns'}
            </li>
          )}
        </ul>
      )}
    </article>
  );
}

export const TableNode = memo(TableNodeView);
