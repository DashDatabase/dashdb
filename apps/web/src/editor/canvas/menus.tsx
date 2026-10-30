'use client';

import { removeForeignKey, type Id } from '@dashdb/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@dashdb/ui';
import {
  ClipboardPasteIcon,
  CopyIcon,
  CopyPlusIcon,
  FoldVerticalIcon,
  LayoutGridIcon,
  MaximizeIcon,
  PaletteIcon,
  PencilIcon,
  PlusIcon,
  SquareDashedMousePointerIcon,
  TablePropertiesIcon,
  Trash2Icon,
  UnfoldVerticalIcon,
} from 'lucide-react';
import { editorStore, NODE_COLORS, useEditor, type NodeColor } from '../store';
import { keepRenameFocus, useCanvasUi } from './canvas-ui';
import { findForeignKey } from './model';
import { reportPaste } from '../hooks';
import { copySelection, duplicateSelection, pasteClipboard } from './operations';

export const COLOR_CLASSES: Record<NodeColor, string> = {
  default: 'bg-text-muted',
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const COLOR_LABELS: Record<NodeColor, string> = {
  default: 'Gray',
  primary: 'Indigo',
  accent: 'Teal',
  success: 'Green',
  warning: 'Amber',
  danger: 'Red',
};

/** Items for one table: used by the header menu and the node context menu. */
export function TableMenuItems({ tableId }: { tableId: Id }) {
  const node = useEditor((s) => s.doc?.layout.nodes[tableId]);
  const startRename = useCanvasUi((s) => s.startRename);
  if (!node) return null;
  const state = () => editorStore.getState();

  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          const columnId = state().addColumn(tableId);
          if (columnId) startRename(tableId, columnId);
        }}
      >
        <PlusIcon aria-hidden /> Add column
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          startRename(tableId);
        }}
      >
        <PencilIcon aria-hidden /> Rename
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          state().select(tableId);
          state().setRightTab('inspector');
        }}
      >
        <TablePropertiesIcon aria-hidden /> Edit in inspector
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          state().setNodeCollapsed(tableId, !node.collapsed);
        }}
      >
        {node.collapsed ? <UnfoldVerticalIcon aria-hidden /> : <FoldVerticalIcon aria-hidden />}
        {node.collapsed ? 'Show all columns' : 'Show keys only'}
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <PaletteIcon aria-hidden /> Color
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={node.color}
            onValueChange={(value) => {
              state().setNodeColor(tableId, value as NodeColor);
            }}
          >
            {NODE_COLORS.map((color) => (
              <DropdownMenuRadioItem key={color} value={color}>
                <span className={`size-2.5 rounded-full ${COLOR_CLASSES[color]}`} aria-hidden />
                {COLOR_LABELS[color]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          copySelection(state(), [tableId]);
        }}
      >
        <CopyIcon aria-hidden /> Copy
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          reportPaste(duplicateSelection(state(), [tableId]));
        }}
      >
        <CopyPlusIcon aria-hidden /> Duplicate
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => {
          state().requestDeleteTables([tableId]);
        }}
      >
        <Trash2Icon aria-hidden /> Delete table…
      </DropdownMenuItem>
    </>
  );
}

function SelectionMenuItems() {
  const ids = useEditor((s) => s.canvasSelection);
  const state = () => editorStore.getState();
  const setCollapsed = (collapsed: boolean) => {
    state().transact(collapsed ? 'Collapse tables' : 'Expand tables', () => {
      for (const id of ids) state().setNodeCollapsed(id, collapsed);
    });
  };
  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          copySelection(state());
        }}
      >
        <CopyIcon aria-hidden /> Copy {ids.length} tables
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          reportPaste(duplicateSelection(state()));
        }}
      >
        <CopyPlusIcon aria-hidden /> Duplicate
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          setCollapsed(true);
        }}
      >
        <FoldVerticalIcon aria-hidden /> Show keys only
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          setCollapsed(false);
        }}
      >
        <UnfoldVerticalIcon aria-hidden /> Show all columns
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => {
          state().requestDeleteTables(ids);
        }}
      >
        <Trash2Icon aria-hidden /> Delete {ids.length} tables…
      </DropdownMenuItem>
    </>
  );
}

function EdgeMenuItems({ edgeId }: { edgeId: Id }) {
  const found = useEditor((s) => (s.doc ? findForeignKey(s.doc.schema, edgeId) : null));
  if (!found) return null;
  const { table, fk } = found;
  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          editorStore.getState().select(table.id);
          editorStore.getState().setRightTab('inspector');
        }}
      >
        <TablePropertiesIcon aria-hidden /> Edit {table.name}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => {
          editorStore
            .getState()
            .editSchema('Delete relationship', (s) => removeForeignKey(s, table.id, fk.id));
        }}
      >
        <Trash2Icon aria-hidden /> Delete relationship
      </DropdownMenuItem>
    </>
  );
}

function PaneMenuItems({ flow }: { flow: { x: number; y: number } }) {
  const state = () => editorStore.getState();
  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          state().transact('Add table', () => {
            const id = state().addTable();
            if (id) state().setNodePositions({ [id]: flow }, 'Add table');
          });
        }}
      >
        <PlusIcon aria-hidden /> Add table here
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          reportPaste(pasteClipboard(state()));
        }}
      >
        <ClipboardPasteIcon aria-hidden /> Paste
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          state().runCanvasCommand('selectAll');
        }}
      >
        <SquareDashedMousePointerIcon aria-hidden /> Select all
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          state().runCanvasCommand('arrange');
        }}
      >
        <LayoutGridIcon aria-hidden /> Arrange tables
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() => {
          state().runCanvasCommand('fitView');
        }}
      >
        <MaximizeIcon aria-hidden /> Fit view
      </DropdownMenuItem>
    </>
  );
}

/** The right-click menu, opened at the pointer by the canvas event handlers. */
export function CanvasContextMenu() {
  const menu = useCanvasUi((s) => s.menu);
  const closeMenu = useCanvasUi((s) => s.closeMenu);
  if (!menu) return null;
  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) closeMenu();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={{ left: menu.x, top: menu.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-52"
        data-testid="canvas-menu"
        onCloseAutoFocus={keepRenameFocus}
      >
        {menu.kind === 'table' && <TableMenuItems tableId={menu.tableId} />}
        {menu.kind === 'selection' && <SelectionMenuItems />}
        {menu.kind === 'edge' && <EdgeMenuItems edgeId={menu.edgeId} />}
        {menu.kind === 'pane' && <PaneMenuItems flow={menu.flow} />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
