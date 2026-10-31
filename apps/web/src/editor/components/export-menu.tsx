'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dashdb/ui';
import { ChevronDownIcon, DownloadIcon } from 'lucide-react';
import { getAction, isActionEnabled, type ActionId } from '../actions';
import { EXPORT_FORMATS, type ExportFormat } from '../formats';
import { useRunAction } from '../hooks';
import { useEditor } from '../store';
import { ShortcutKeys } from './action-button';

function ActionItem({ id, label }: { id: ActionId; label: string }) {
  const action = getAction(id);
  const enabled = useEditor((state) => isActionEnabled(action, state));
  const run = useRunAction();
  return (
    <DropdownMenuItem
      disabled={!enabled}
      onSelect={() => {
        run(action);
      }}
    >
      <span className="flex-1">{label}</span>
      <ShortcutKeys shortcut={action.shortcut} />
    </DropdownMenuItem>
  );
}

/** The top bar's Export menu: code formats, the project file, images and Mermaid. */
export function ExportMenu() {
  const hasProject = useEditor((s) => s.doc !== null);
  const openExport = useEditor((s) => s.openExport);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasProject}
          aria-label="Export"
          className="gap-2 has-[>svg]:px-3"
        >
          <DownloadIcon aria-hidden className="size-4" />{' '}
          <span className="hidden xl:inline">Export</span>
          <ChevronDownIcon aria-hidden className="size-4 text-text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Code</DropdownMenuLabel>
        {(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map((format) => (
          <DropdownMenuItem
            key={format}
            onSelect={() => {
              openExport(format);
            }}
          >
            {EXPORT_FORMATS[format].label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Diagram</DropdownMenuLabel>
        <ActionItem id="file.exportImage" label="PNG or SVG image…" />
        <ActionItem id="file.copyMermaid" label="Copy as Mermaid ERD" />
        <DropdownMenuSeparator />
        <ActionItem id="file.exportProject" label="Project file (.dashdb.json)" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
