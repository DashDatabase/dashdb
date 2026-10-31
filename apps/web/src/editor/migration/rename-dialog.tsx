'use client';

import type { RenameCandidate } from '@dashdb/core/lite';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@dashdb/ui';
import { ArrowRightIcon } from 'lucide-react';
import { useState } from 'react';

function side(candidate: RenameCandidate, which: 'from' | 'to'): string {
  const ref = candidate[which];
  return ref.column ? `${ref.name}.${ref.column}` : ref.name;
}

/**
 * Asks about each likely rename in turn. A rename keeps the data; dropping and adding loses it,
 * so the question is worth one click per candidate.
 */
export function RenameDialog({
  candidates,
  onDone,
  onCancel,
}: {
  candidates: readonly RenameCandidate[];
  /** Called once every candidate has an answer: key → true for "renamed". */
  onDone: (decisions: ReadonlyMap<string, boolean>) => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<ReadonlyMap<string, boolean>>(new Map());
  const candidate = candidates[index];
  if (!candidate) return null;
  const kind = candidate.kind === 'table' ? 'table' : 'column';
  const from = side(candidate, 'from');
  const to = side(candidate, 'to');
  const lostWhat = candidate.kind === 'table' ? 'every row in the table' : `the values in ${from}`;

  const answer = (renamed: boolean) => {
    const next = new Map(decisions).set(candidate.key, renamed);
    setDecisions(next);
    if (index + 1 < candidates.length) setIndex(index + 1);
    else onDone(next);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-lg" data-testid="rename-dialog">
        <DialogHeader>
          <DialogTitle>
            Did you rename this {kind}?
            {candidates.length > 1 && (
              <span className="ml-2 text-sm font-normal text-text-muted">
                {index + 1} of {candidates.length}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Did you rename <code className="font-mono">{from}</code> to{' '}
            <code className="font-mono">{to}</code>, or drop it and add a new one?
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-3 rounded-md border bg-surface p-4 font-mono text-sm">
          <span className="truncate text-danger-text">{from}</span>
          <ArrowRightIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
          <span className="truncate text-success-text">{to}</span>
        </div>
        <ul className="space-y-1 text-sm text-text-muted">
          <li>
            <strong className="text-text">Renamed</strong> keeps the data: one{' '}
            <code className="font-mono">RENAME</code> statement.
          </li>
          <li>
            <strong className="text-text">Dropped and added</strong> deletes {lostWhat}.
          </li>
          {candidate.reasons.length > 0 && (
            <li className="text-xs">Why we think so: {candidate.reasons.join(', ')}.</li>
          )}
        </ul>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() => {
              setIndex(index - 1);
            }}
          >
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                answer(false);
              }}
            >
              Dropped and added
            </Button>
            <Button
              onClick={() => {
                answer(true);
              }}
            >
              Renamed
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
