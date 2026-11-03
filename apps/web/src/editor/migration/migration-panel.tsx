'use client';

import { createSchema, type Schema } from '@dashdb/core/lite';
import {
  Badge,
  Button,
  Input,
  Kbd,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@dashdb/ui';
import {
  ArrowDownIcon,
  CheckCheckIcon,
  CopyIcon,
  DownloadIcon,
  FileArchiveIcon,
  GitCompareArrowsIcon,
  Loader2Icon,
  PencilIcon,
  SaveIcon,
  SparklesIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { downloadBlob, downloadText } from '@/lib/download';
import { track } from '@/lib/telemetry';
import { ActionButton } from '../components/action-button';
import { saveBaseline } from '../projects';
import { relativeTime } from '../schema-text';
import { editorStore, useEditor } from '../store';
import { findingKey, sortFindings, statementViews, summarize } from './annotate';
import { applyAlternatives, statementReplacements } from './alternatives';
import { isMigrationDialect, isMigrationTarget, type MigrationTarget } from './targets';
import { FindingsList } from './findings-list';
import { MAX_MIGRATION_NAME, migrationSlug, singleFileName, zipFiles } from './files';
import { createMigrationClient, type MigrationClient } from './migration-client';
import { useMigrationPanel, type MigrationResult, type MigrationSource } from './panel-store';
import { RenameDialog } from './rename-dialog';
import { RiskBadge } from './severity';
import { StatementList } from './statement-list';

/** Edits come in bursts; regenerate once they settle. */
export const REGENERATE_DELAY_MS = 250;

const TARGET_LABELS: Record<MigrationTarget, (dialect: Schema['dialect']) => string> = {
  sql: (dialect) => (dialect === 'mysql' ? 'SQL (MySQL)' : 'SQL (PostgreSQL)'),
  prisma: () => 'Prisma Migrate',
  drizzle: () => 'Drizzle Kit',
};

/** One empty schema per dialect, so "from an empty database" keeps its identity. */
const EMPTY = new Map<Schema['dialect'], Schema>();
function emptySchema(dialect: Schema['dialect']): Schema {
  let schema = EMPTY.get(dialect);
  if (!schema) {
    schema = createSchema(dialect, { id: 'empty' });
    EMPTY.set(dialect, schema);
  }
  return schema;
}

function copy(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success('Copied to clipboard'),
    () => toast.error('Could not copy to the clipboard'),
  );
}

function EmptyState({ onFromEmpty }: { onFromEmpty: () => void }) {
  const steps = [
    {
      icon: SaveIcon,
      title: 'Save a baseline',
      body: 'Freeze the schema as it is deployed today.',
    },
    {
      icon: PencilIcon,
      title: 'Edit the schema',
      body: 'Change tables on the canvas or in the Code tab.',
    },
    {
      icon: GitCompareArrowsIcon,
      title: 'Generate the migration',
      body: 'Review the risks, then download SQL, Prisma or Drizzle files.',
    },
  ];
  return (
    <section
      className="space-y-3 rounded-lg border border-dashed p-4"
      data-testid="migration-empty"
      aria-labelledby="migration-empty-title"
    >
      <h3 id="migration-empty-title" className="text-sm font-medium">
        How migrations work
      </h3>
      <ol className="space-y-3">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-text">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">
                {i + 1}. {title}
              </p>
              <p className="text-xs text-text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <ActionButton action="migration.saveBaseline" size="sm">
          <SaveIcon aria-hidden /> Save baseline
        </ActionButton>
        <Button variant="ghost" size="sm" onClick={onFromEmpty}>
          Generate from an empty database
        </Button>
      </div>
    </section>
  );
}

function SummaryChips({ result }: { result: MigrationResult }) {
  const summary = summarize(result.output);
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="migration-summary">
      <Badge variant="outline" data-testid="operation-count">
        {summary.operations} {summary.operations === 1 ? 'operation' : 'operations'}
      </Badge>
      <RiskBadge risk={summary.risk} />
      {summary.destructive > 0 && (
        <Badge className="bg-danger/10 text-danger-text" data-testid="destructive-count">
          {summary.destructive} destructive
        </Badge>
      )}
      {summary.irreversible > 0 && (
        <Badge className="bg-warning/10 text-warning-text" data-testid="irreversible-count">
          {summary.irreversible} irreversible
        </Badge>
      )}
      <span
        className="ml-auto text-xs text-text-muted"
        data-testid="migration-duration"
        data-duration={result.output.durationMs}
      >
        {result.output.durationMs} ms
      </span>
    </div>
  );
}

export function MigrationPanel() {
  const projectId = useEditor((s) => s.projectId);
  const projectName = useEditor((s) => s.doc?.name ?? 'schema');
  const schema = useEditor((s) => s.doc?.schema ?? null);
  const baselines = useEditor((s) => s.baselines);
  const migrationRequest = useEditor((s) => s.migrationRequest);
  const overlayVisible = useEditor((s) => s.rightTab === 'migration' && s.rightOpen);
  const panel = useMigrationPanel();
  const { forProject } = panel;
  const ids = { from: useId(), target: useId(), name: useId() };

  const [renameQueue, setRenameQueue] = useState<MigrationResult['output']['renameCandidates']>([]);
  const client = useRef<MigrationClient | null>(null);
  /** The next run was asked for by the user, so it may open the rename dialog. */
  const interactive = useRef(false);

  useEffect(() => {
    if (projectId) forProject(projectId);
  }, [projectId, forProject]);

  useEffect(
    () => () => {
      client.current?.dispose();
      client.current = null;
    },
    [],
  );

  const dialect = schema?.dialect ?? 'postgres';
  const supported = isMigrationDialect(dialect);
  const source: MigrationSource = useMemo(() => {
    if (
      panel.source &&
      (panel.source === 'empty' || baselines.some((b) => b.id === panel.source))
    ) {
      return panel.source;
    }
    return baselines[0]?.id ?? 'empty';
  }, [panel.source, baselines]);
  const before = useMemo(
    () =>
      source === 'empty'
        ? emptySchema(dialect)
        : (baselines.find((b) => b.id === source)?.schema ?? emptySchema(dialect)),
    [source, baselines, dialect],
  );
  const slug = migrationSlug(panel.name);
  const confirmed = useMemo(
    () => [...panel.decisions].filter(([, renamed]) => renamed).map(([key]) => key),
    [panel.decisions],
  );

  const generate = () => {
    interactive.current = true;
    panel.set({ generated: true });
    // Same inputs as last time: the effect won't re-run, so run here.
    if (panel.generated) void run();
  };

  const run = async () => {
    const after = editorStore.getState().doc?.schema;
    if (!after || !supported) return;
    const wasInteractive = interactive.current;
    interactive.current = false;
    client.current ??= createMigrationClient();
    useMigrationPanel.getState().set({ status: { kind: 'generating' } });
    const response = await client.current.generate({
      before,
      after,
      target: panel.target,
      name: slug,
      confirmedRenames: confirmed,
      now: Date.now(),
    });
    if (!response) return;
    if (!response.ok) {
      useMigrationPanel.getState().set({ status: { kind: 'error', message: response.message } });
      return;
    }
    useMigrationPanel.getState().set({
      status: { kind: 'idle' },
      result: {
        output: response.output,
        before,
        after,
        target: panel.target,
        slug,
        confirmed,
      },
    });
    if (wasInteractive) {
      // Only when the user asks: regenerating as they edit isn't a new migration.
      track('migration_generated', {
        target: panel.target,
        risk: response.output.report.riskLevel,
        ops_count: response.output.operations.length,
      });
      const decided = useMigrationPanel.getState().decisions;
      const open = response.output.renameCandidates.filter((c) => !decided.has(c.key));
      if (open.length > 0) setRenameQueue(open);
    }
  };
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  // Regenerate whenever an input changes, once the user has generated.
  useEffect(() => {
    if (!panel.generated || !schema) return;
    const timer = setTimeout(
      () => {
        void runRef.current();
      },
      interactive.current ? 0 : REGENERATE_DELAY_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [panel.generated, schema, before, panel.target, slug, confirmed]);

  // The Generate migration action (Ctrl+Enter) from anywhere in the editor.
  const lastRequest = useRef(migrationRequest);
  const generateRef = useRef(generate);
  useEffect(() => {
    generateRef.current = generate;
  });
  useEffect(() => {
    if (migrationRequest === lastRequest.current) return;
    lastRequest.current = migrationRequest;
    generateRef.current();
  }, [migrationRequest]);

  const result = panel.result;
  const setOverlay = useEditor((s) => s.setMigrationOverlay);
  useEffect(() => {
    setOverlay(result && panel.showOnCanvas && overlayVisible ? result.before : null);
  }, [result, panel.showOnCanvas, overlayVisible, setOverlay]);
  useEffect(
    () => () => {
      editorStore.getState().setMigrationOverlay(null);
    },
    [],
  );

  const view = useMemo(() => {
    if (!result) return null;
    const { output, target } = result;
    const findings = sortFindings(output.report.findings);
    const appliedFindings = findings.filter((f) => panel.applied.has(findingKey(f)));
    const up = statementViews(output.statements, output.operations, output.report.findings);
    const down = statementViews(output.downStatements, output.downOperations);
    const files = output.files.map((file) =>
      file.path === output.upPath && appliedFindings.length > 0
        ? {
            ...file,
            contents: applyAlternatives(file.contents, output.statements, appliedFindings, target),
          }
        : file,
    );
    return {
      findings,
      up,
      down,
      replacements: statementReplacements(up, appliedFindings, target),
      files,
      upFile: files.find((f) => f.path === output.upPath),
      downFile: files.find((f) => f.path === output.downPath),
    };
  }, [result, panel.applied]);

  // Inputs changed since this result: its files would not match what the panel shows.
  const stale =
    result !== null &&
    (result.after !== schema ||
      result.before !== before ||
      result.target !== panel.target ||
      result.slug !== slug ||
      result.confirmed.join(',') !== confirmed.join(','));
  const activeFile = panel.direction === 'up' ? view?.upFile : view?.downFile;

  const markApplied = () => {
    if (!projectId || !result) return;
    const label = panel.name.trim() || slug;
    saveBaseline(projectId, result.after, label).then(
      (list) => {
        editorStore.getState().setBaselines(list);
        track('baseline_saved', { reason: 'applied' });
        useMigrationPanel.getState().set({ source: list[0]?.id ?? null, applied: new Set() });
        toast.success('Marked as applied', {
          description: `Saved baseline “${label}”. New changes are generated from it.`,
        });
      },
      () => toast.error('Could not save the baseline.'),
    );
  };

  const downloadZip = () => {
    if (!view) return;
    zipFiles(view.files).then(
      (blob) => {
        downloadBlob(`${migrationSlug(projectName)}-${slug}-${result?.target ?? 'sql'}.zip`, blob);
        if (result) track('migration_downloaded', { target: result.target, bundle: 'zip' });
      },
      () => toast.error('Could not build the zip file.'),
    );
  };

  if (!supported) {
    return (
      <div className="p-4 text-sm text-text-muted" data-testid="migration-panel">
        Migrations are available for PostgreSQL and MySQL projects.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="migration-panel">
      {baselines.length === 0 && !result && (
        <EmptyState
          onFromEmpty={() => {
            panel.set({ source: 'empty' });
            generate();
          }}
        />
      )}

      <section className="space-y-3" aria-label="Migration settings">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
          <label htmlFor={ids.from} className="text-xs font-medium text-text-muted">
            From
          </label>
          <Select
            value={source}
            onValueChange={(value) => {
              panel.set({ source: value });
            }}
          >
            <SelectTrigger id={ids.from} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {baselines.map((baseline, i) => (
                <SelectItem key={baseline.id} value={baseline.id}>
                  {baseline.name}
                  <span className="text-text-muted">
                    {' '}
                    · {i === 0 ? 'latest, ' : ''}
                    {relativeTime(baseline.createdAt)}
                  </span>
                </SelectItem>
              ))}
              <SelectItem value="empty">Empty database</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs font-medium text-text-muted">To</span>
          <span className="flex h-8 items-center gap-1.5 text-sm">
            <ArrowDownIcon className="size-3.5 text-text-muted" aria-hidden /> Current schema
          </span>
          <label htmlFor={ids.target} className="text-xs font-medium text-text-muted">
            Output
          </label>
          <Select
            value={panel.target}
            onValueChange={(value) => {
              if (isMigrationTarget(value)) panel.set({ target: value });
            }}
          >
            <SelectTrigger id={ids.target} size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['sql', 'prisma', 'drizzle'] as const).map((target) => (
                <SelectItem key={target} value={target}>
                  {TARGET_LABELS[target](dialect)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label htmlFor={ids.name} className="text-xs font-medium text-text-muted">
            Name
          </label>
          <div className="min-w-0">
            <Input
              id={ids.name}
              value={panel.name}
              maxLength={MAX_MIGRATION_NAME * 2}
              placeholder="add user email"
              className="h-8"
              onChange={(event) => {
                panel.set({ name: event.target.value });
              }}
            />
          </div>
          <span />
          <p className="truncate font-mono text-xs text-text-muted" data-testid="migration-slug">
            {slug}
          </p>
        </div>
        <Button className="w-full" onClick={generate} disabled={!schema}>
          {panel.status.kind === 'generating' ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : (
            <SparklesIcon aria-hidden />
          )}
          Generate migration
          <Kbd className="ml-auto bg-primary-foreground/15 text-primary-foreground">Ctrl ↵</Kbd>
        </Button>
      </section>

      {panel.status.kind === 'error' && (
        <p className="rounded-md border border-danger/40 p-3 text-sm text-danger-text" role="alert">
          {panel.status.message}
        </p>
      )}

      {result && view && (
        <section
          className="space-y-4"
          aria-label="Generated migration"
          data-testid="migration-result"
          aria-busy={stale}
        >
          <div className="space-y-2">
            <SummaryChips result={result} />
            {stale && <p className="text-xs text-text-muted">Updating…</p>}
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <Switch
                size="sm"
                checked={panel.showOnCanvas}
                onCheckedChange={(showOnCanvas) => {
                  panel.set({ showOnCanvas });
                }}
              />
              Show changes on the canvas
            </label>
          </div>

          {result.output.renameCandidates.some((c) => !panel.decisions.has(c.key)) && (
            <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-sm">
              <span className="flex-1">
                Possible renames need a decision; until then they are a drop and an add.
              </span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setRenameQueue(
                    result.output.renameCandidates.filter((c) => !panel.decisions.has(c.key)),
                  );
                }}
              >
                Review
              </Button>
            </div>
          )}

          {result.output.operations.length === 0 ? (
            <p className="rounded-md border p-4 text-sm text-text-muted" data-testid="no-changes">
              No changes: the current schema matches{' '}
              {source === 'empty' ? 'an empty database' : 'the selected baseline'}.
            </p>
          ) : (
            <>
              <FindingsList
                findings={view.findings}
                warnings={result.output.warnings}
                operations={result.output.operations}
                target={result.target}
                applied={panel.applied}
                onToggleApplied={(finding) => {
                  panel.toggleApplied(findingKey(finding));
                }}
              />

              <Tabs
                value={panel.direction}
                onValueChange={(value) => {
                  if (value === 'up' || value === 'down') panel.set({ direction: value });
                }}
                className="gap-2"
              >
                <div className="flex items-center gap-1">
                  <TabsList>
                    <TabsTrigger value="up">Up</TabsTrigger>
                    <TabsTrigger value="down">Down</TabsTrigger>
                  </TabsList>
                  <span className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy migration"
                    title="Copy migration"
                    disabled={!activeFile || stale}
                    onClick={() => {
                      if (activeFile) copy(activeFile.contents);
                    }}
                  >
                    <CopyIcon aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Download migration file"
                    title="Download migration file"
                    disabled={!activeFile || stale}
                    onClick={() => {
                      if (!activeFile) return;
                      downloadText(singleFileName(activeFile.path), activeFile.contents);
                      track('migration_downloaded', { target: result.target, bundle: 'file' });
                    }}
                  >
                    <DownloadIcon aria-hidden />
                  </Button>
                </div>
                {activeFile && (
                  <p className="truncate font-mono text-xs text-text-muted" title={activeFile.path}>
                    {activeFile.path}
                  </p>
                )}
                <TabsContent value="up" data-testid="migration-up">
                  <StatementList
                    views={view.up}
                    replacements={view.replacements}
                    empty="Nothing to run."
                  />
                </TabsContent>
                <TabsContent value="down" data-testid="migration-down">
                  <StatementList views={view.down} empty="Nothing to undo." />
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={downloadZip} disabled={stale}>
                  <FileArchiveIcon aria-hidden /> Download .zip
                </Button>
                <Button variant="outline" size="sm" onClick={markApplied} disabled={stale}>
                  <CheckCheckIcon aria-hidden /> Mark as applied
                </Button>
              </div>
              <p className="text-xs text-text-muted">
                The zip has every file in the layout {TARGET_LABELS[result.target](dialect)}{' '}
                expects. “Mark as applied” saves the current schema as a new baseline.
              </p>
            </>
          )}
        </section>
      )}

      {renameQueue.length > 0 && (
        <RenameDialog
          candidates={renameQueue}
          onCancel={() => {
            setRenameQueue([]);
          }}
          onDone={(decisions) => {
            setRenameQueue([]);
            panel.decide(decisions);
          }}
        />
      )}
    </div>
  );
}
