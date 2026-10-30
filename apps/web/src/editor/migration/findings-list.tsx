'use client';

import type { DiffWarning, Finding, Operation } from '@dashdb/core';
import { Button, toast } from '@dashdb/ui';
import { BookOpenIcon, ChevronDownIcon, CopyIcon, ShieldCheckIcon, Undo2Icon } from 'lucide-react';
import { useState } from 'react';
import { describeOperation, findingKey } from './annotate';
import { alternativeSql } from './alternatives';
import type { MigrationTarget } from './compute';
import { SEVERITY_LABELS, SeverityIcon } from './severity';
import { SqlCode } from './sql-code';

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success('Copied to clipboard'),
    () => toast.error('Could not copy to the clipboard'),
  );
}

function FindingItem({
  finding,
  operation,
  target,
  applied,
  onToggleApplied,
}: {
  finding: Finding;
  operation: Operation | undefined;
  target: MigrationTarget;
  applied: boolean;
  onToggleApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const alternative = alternativeSql(finding, target);
  return (
    <li
      className="space-y-2 rounded-md border bg-surface-raised p-3"
      data-testid="finding"
      data-rule={finding.ruleId}
      data-severity={finding.severity}
    >
      <div className="flex gap-2">
        <SeverityIcon severity={finding.severity} className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{finding.title}</p>
          <p className="text-xs text-text-muted">
            {SEVERITY_LABELS[finding.severity]}
            {operation ? ` · ${describeOperation(operation)}` : ''}
          </p>
          <p className="text-sm text-text-muted">{finding.explanation}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="outline"
          size="xs"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          <ChevronDownIcon aria-hidden className={open ? 'rotate-180' : undefined} />
          {open ? 'Hide safer alternative' : 'Show safer alternative'}
        </Button>
        <Button variant="ghost" size="xs" asChild>
          <a href={finding.docsUrl} target="_blank" rel="noreferrer">
            <BookOpenIcon aria-hidden /> Docs
          </a>
        </Button>
        {applied && <span className="text-xs text-success-text">Used in the migration</span>}
      </div>
      {open && (
        <div className="space-y-2">
          <SqlCode sql={finding.saferAlternative} className="rounded-md border bg-surface p-2" />
          <div className="flex flex-wrap gap-1">
            <Button size="xs" variant={applied ? 'outline' : 'default'} onClick={onToggleApplied}>
              {applied ? (
                <>
                  <Undo2Icon aria-hidden /> Use the original statement
                </>
              ) : (
                <>
                  <ShieldCheckIcon aria-hidden /> Use in migration
                </>
              )}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                copy(alternative);
              }}
            >
              <CopyIcon aria-hidden /> Copy
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            “Use in migration” replaces the statement in the up migration. Steps that must wait for
            a deploy are added as comments.
          </p>
        </div>
      )}
    </li>
  );
}

export function FindingsList({
  findings,
  warnings,
  operations,
  target,
  applied,
  onToggleApplied,
}: {
  findings: readonly Finding[];
  warnings: readonly DiffWarning[];
  operations: readonly Operation[];
  target: MigrationTarget;
  applied: ReadonlySet<string>;
  onToggleApplied: (finding: Finding) => void;
}) {
  return (
    <section className="space-y-2" aria-labelledby="findings-heading">
      <h3 id="findings-heading" className="text-sm font-medium">
        Safety checks
      </h3>
      {findings.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-text-muted" data-testid="no-findings">
          <ShieldCheckIcon className="size-4 text-success-text" aria-hidden />
          No risky operations found.
        </p>
      ) : (
        <ul className="space-y-2">
          {findings.map((finding) => (
            <FindingItem
              key={findingKey(finding)}
              finding={finding}
              operation={operations[Number(finding.operationId.slice(3))]}
              target={target}
              applied={applied.has(findingKey(finding))}
              onToggleApplied={() => {
                onToggleApplied(finding);
              }}
            />
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-text-muted" data-testid="diff-warnings">
          {warnings.map((warning) => (
            <li key={warning.message}>• {warning.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
