'use client';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@dashdb/ui';
import type { Table } from '@dashdb/core/lite';
import { TableIcon } from 'lucide-react';
import { isActionEnabled, type EditorAction } from '../actions';
import { ALL_ACTIONS, PALETTE_GROUPS } from '../edition-actions';
import { useRunAction } from '../hooks';
import { useEditor } from '../store';
import { ShortcutKeys } from './action-button';

const NO_TABLES: readonly Table[] = [];

/** Cmd/Ctrl+K: every registry action plus "jump to table". */
export function CommandPalette() {
  const open = useEditor((s) => s.paletteOpen);
  const setPaletteOpen = useEditor((s) => s.setPaletteOpen);
  const tables = useEditor((s) => s.doc?.schema.tables ?? NO_TABLES);
  const focusTable = useEditor((s) => s.focusTable);
  // Re-render on any state change so isEnabled reflects the current state.
  const state = useEditor((s) => s);
  const run = useRunAction();

  const select = (action: EditorAction) => {
    setPaletteOpen(false);
    // Let the palette close (and restore focus) before the action opens a dialog or moves focus.
    requestAnimationFrame(() => {
      run(action);
    });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setPaletteOpen}
      title="Command palette"
      description="Search for an action or a table"
    >
      <CommandInput placeholder="Type a command or table name…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {PALETTE_GROUPS.map((group) => {
          const actions = ALL_ACTIONS.filter((a) => a.group === group && a.id !== 'palette.open');
          return (
            <CommandGroup key={group} heading={group}>
              {actions.map((action) => (
                <CommandItem
                  key={action.id}
                  value={action.title}
                  keywords={action.keywords ? [...action.keywords] : undefined}
                  disabled={!isActionEnabled(action, state)}
                  onSelect={() => {
                    select(action);
                  }}
                >
                  {action.title}
                  {action.shortcut && (
                    <CommandShortcut>
                      <ShortcutKeys shortcut={action.shortcut} />
                    </CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
        {tables.length > 0 && (
          <CommandGroup heading="Tables">
            {tables.map((table) => (
              <CommandItem
                key={table.id}
                value={`table ${table.name} ${table.id}`}
                onSelect={() => {
                  setPaletteOpen(false);
                  focusTable(table.id);
                }}
              >
                <TableIcon aria-hidden /> {table.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
