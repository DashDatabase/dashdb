'use client';

import type { SchemaProblem } from '@dashdb/core/lite';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from '@dashdb/ui';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CloudOffIcon,
  HardDriveIcon,
  LoaderIcon,
} from 'lucide-react';
import { problemTableId } from '../schema-text';
import { useEditor } from '../store';

/** Validation results, refreshed by the store shortly after each schema change. */
export function useProblems(): readonly SchemaProblem[] {
  return useEditor((s) => s.problems);
}

const SAVE_LABELS = {
  saved: { icon: HardDriveIcon, label: 'Saved locally' },
  saving: { icon: LoaderIcon, label: 'Saving…' },
  error: { icon: CloudOffIcon, label: 'Could not save' },
  conflict: { icon: CloudOffIcon, label: 'Not saving: changed in another tab' },
} as const;

export function StatusBar() {
  const tableCount = useEditor((s) => s.doc?.schema.tables.length ?? 0);
  const saveState = useEditor((s) => s.saveState);
  const openDialog = useEditor((s) => s.openDialog);
  const problems = useProblems();
  const save = SAVE_LABELS[saveState];

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-surface px-3 text-xs text-text-muted">
      <span data-testid="table-count">
        {tableCount} {tableCount === 1 ? 'table' : 'tables'}
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="h-5 text-xs text-text-muted"
        onClick={() => {
          openDialog('problems');
        }}
      >
        {problems.length === 0 ? (
          <CheckCircle2Icon className="text-success-text" aria-hidden />
        ) : (
          <AlertTriangleIcon className="text-warning-text" aria-hidden />
        )}
        {problems.length} {problems.length === 1 ? 'problem' : 'problems'}
      </Button>
      <span
        role="status"
        className={
          saveState === 'error' || saveState === 'conflict'
            ? 'ml-auto flex items-center gap-1.5 text-danger-text'
            : 'ml-auto flex items-center gap-1.5'
        }
      >
        <save.icon
          className={saveState === 'saving' ? 'size-3.5 animate-spin' : 'size-3.5'}
          aria-hidden
        />
        {save.label}
      </span>
    </footer>
  );
}

export function ProblemsDialog() {
  const open = useEditor((s) => s.dialog === 'problems');
  const closeDialog = useEditor((s) => s.closeDialog);
  const focusTable = useEditor((s) => s.focusTable);
  const problems = useProblems();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Problems</DialogTitle>
          <DialogDescription>
            {problems.length === 0
              ? 'The schema is valid.'
              : 'These must be fixed before the schema can be exported or migrated reliably.'}
          </DialogDescription>
        </DialogHeader>
        {problems.length > 0 && (
          <ScrollArea className="max-h-80">
            <ul className="space-y-1">
              {problems.map((problem, i) => {
                const tableId = problemTableId(problem);
                return (
                  <li key={`${problem.code}-${String(i)}`}>
                    <button
                      type="button"
                      disabled={!tableId}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-highlight"
                      onClick={() => {
                        if (!tableId) return;
                        focusTable(tableId);
                        closeDialog();
                      }}
                    >
                      <AlertTriangleIcon
                        className="mt-0.5 size-4 shrink-0 text-warning-text"
                        aria-hidden
                      />
                      {problem.message}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
