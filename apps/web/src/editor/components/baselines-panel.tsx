'use client';

import { HistoryIcon, SaveIcon } from 'lucide-react';
import { MAX_BASELINES } from '../projects';
import { relativeTime } from '../schema-text';
import { useEditor } from '../store';
import { ActionButton } from './action-button';

/** Saved baselines: immutable "before" snapshots that migrations are generated against. */
export function BaselinesPanel() {
  const baselines = useEditor((s) => s.baselines);

  return (
    <div className="space-y-4 p-4" data-testid="baselines">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Baselines</h3>
        <p className="text-sm text-text-muted">
          A baseline freezes the schema as it is now. Migrations are generated from the latest
          baseline to your current edits. The {MAX_BASELINES} most recent are kept.
        </p>
      </div>
      <ActionButton action="migration.saveBaseline" size="sm" className="w-full">
        <SaveIcon aria-hidden /> Save baseline
      </ActionButton>
      {baselines.length === 0 ? (
        <p className="text-sm text-text-muted">No baselines yet.</p>
      ) : (
        <ol className="divide-y rounded-md border">
          {baselines.map((baseline, i) => (
            <li key={baseline.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <HistoryIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {baseline.name}
                  {i === 0 && <span className="ml-2 text-xs text-primary-text">latest</span>}
                </p>
                <p className="text-xs text-text-muted">
                  {relativeTime(baseline.createdAt)} · {baseline.schema.tables.length} tables
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
