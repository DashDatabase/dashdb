'use client';

import { Badge, cn } from '@dashdb/ui';
import { ShieldCheckIcon } from 'lucide-react';
import { findingKey, type StatementView } from './annotate';
import { SeverityIcon } from './severity';
import { SqlCode } from './sql-code';

const PHASE_LABELS = {
  before: 'Before the transaction',
  after: 'After the transaction',
} as const;

function StatementCard({
  view,
  replacement,
}: {
  view: StatementView;
  /** The safer alternative standing in for this statement, if one was chosen. */
  replacement: string | null;
}) {
  const { statement, labels, findings } = view;
  return (
    <li
      className={cn(
        'rounded-md border bg-surface-raised',
        statement.destructive && !replacement && 'border-danger/40',
        replacement && 'border-success/40',
      )}
      data-testid="statement"
    >
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {labels.map((label) => (
          <span key={label} className="text-xs font-medium">
            {label}
          </span>
        ))}
        <span className="flex-1" />
        {findings.map((finding) => (
          <SeverityIcon
            key={findingKey(finding)}
            severity={finding.severity}
            label={finding.title}
          />
        ))}
        {statement.destructive && !replacement && (
          <Badge className="bg-danger/10 text-danger-text">destructive</Badge>
        )}
        {statement.phase !== 'main' && (
          <Badge variant="outline">{PHASE_LABELS[statement.phase]}</Badge>
        )}
        {!statement.transactional && statement.phase === 'main' && (
          <Badge variant="outline">no transaction</Badge>
        )}
        {replacement && (
          <Badge variant="success">
            <ShieldCheckIcon aria-hidden /> safer alternative
          </Badge>
        )}
      </div>
      {statement.comment && !replacement && (
        <p className="border-b px-2 py-1 text-xs text-text-muted">{statement.comment}</p>
      )}
      <SqlCode sql={replacement ?? statement.sql} className="px-2 py-1.5" />
    </li>
  );
}

/** Statements of one direction with the operations, findings and flags behind each. */
export function StatementList({
  views,
  replacements = new Map<string, string>(),
  empty,
}: {
  views: readonly StatementView[];
  /** Statement key → replacement SQL. */
  replacements?: ReadonlyMap<string, string>;
  empty: string;
}) {
  if (views.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  return (
    <ol className="space-y-2">
      {views.map((view) => (
        <StatementCard
          key={view.key}
          view={view}
          replacement={replacements.get(view.key) ?? null}
        />
      ))}
    </ol>
  );
}
