'use client';

import type { IntrospectionDialect } from '@dashdb/core/lite';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, toast } from '@dashdb/ui';
import { CopyIcon, DownloadIcon, FileUpIcon, ShieldCheckIcon } from 'lucide-react';
import { useId, useRef } from 'react';
import { downloadText } from '@/lib/download';
import { CLIENT_GUIDES, QUERY_FILE_NAME } from './client-guides';
import { MAX_IMPORT_BYTES } from '../formats';
import { introspectionQuery } from './import-sources';

const DIALECT_LABELS: Record<IntrospectionDialect, string> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
};

/** Renders `code` spans in guide text. */
function GuideText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') ? (
          <code key={i} className="rounded bg-highlight px-1 font-mono text-xs">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

const DIALECTS: readonly IntrospectionDialect[] = ['postgres', 'mysql'];

function ClientGuides({ dialect }: { dialect: IntrospectionDialect }) {
  const guides = CLIENT_GUIDES[dialect];
  return (
    <Tabs defaultValue={guides[0]?.id}>
      <TabsList aria-label="SQL client">
        {guides.map((guide) => (
          <TabsTrigger key={guide.id} value={guide.id}>
            {guide.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {guides.map((guide) => (
        <TabsContent key={guide.id} value={guide.id}>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-text-muted">
            {guide.steps.map((step, i) => (
              <li key={step}>
                <GuideText text={step} />
                {i === 1 && guide.command && (
                  <pre className="mt-1 overflow-x-auto rounded bg-highlight p-2 font-mono text-xs text-text">
                    {guide.command}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}

export interface DatabaseTabProps {
  readonly dialect: IntrospectionDialect;
  readonly onDialectChange: (dialect: IntrospectionDialect) => void;
  readonly result: string;
  readonly onResultChange: (text: string) => void;
}

export function DatabaseTab({
  dialect,
  onDialectChange,
  result,
  onResultChange,
}: DatabaseTabProps) {
  const query = introspectionQuery(dialect);
  const resultId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const copy = () => {
    navigator.clipboard.writeText(query).then(
      () => toast.success('Query copied'),
      () => toast.error('Could not copy to the clipboard'),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/5 p-3 text-sm">
        <ShieldCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-success-text" />
        <p>
          <span className="font-medium">DashDB never connects to your database.</span> You run this
          read-only query in your own client. It reads schema metadata only (tables, columns, keys,
          indexes, enums and comments), never your rows, and the result you paste is parsed here in
          your browser.
        </p>
      </div>

      <Tabs
        value={dialect}
        onValueChange={(value) => {
          if (value === 'postgres' || value === 'mysql') onDialectChange(value);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <TabsList aria-label="Database type">
            <TabsTrigger value="postgres">PostgreSQL</TabsTrigger>
            <TabsTrigger value="mysql">MySQL 8</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copy}>
              <CopyIcon aria-hidden /> Copy query
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Download query as .sql"
              onClick={() => {
                downloadText(
                  QUERY_FILE_NAME[dialect],
                  `${query}
`,
                  'application/sql',
                );
              }}
            >
              <DownloadIcon aria-hidden /> .sql
            </Button>
          </div>
        </div>
        {DIALECTS.map((d) => (
          <TabsContent key={d} value={d} className="space-y-4">
            {/* Focusable so keyboard users can scroll the query. */}
            <pre
              tabIndex={0}
              className="h-36 overflow-auto rounded-md border bg-surface p-3 font-mono text-[11px] leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              data-testid="introspection-query"
              aria-label={`${DIALECT_LABELS[d]} introspection query`}
            >
              {introspectionQuery(d)}
            </pre>
            <ClientGuides dialect={d} />
          </TabsContent>
        ))}
      </Tabs>

      <div className="space-y-1.5">
        <div className="flex items-end justify-between">
          <label htmlFor={resultId} className="text-sm font-medium">
            Query result (JSON)
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              fileRef.current?.click();
            }}
          >
            <FileUpIcon aria-hidden /> Load schema.json…
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt"
            className="hidden"
            aria-label="Query result file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              if (file.size > MAX_IMPORT_BYTES) {
                toast.error('That file is larger than 2 MB.');
                return;
              }
              void file.text().then(onResultChange);
            }}
          />
        </div>
        <Textarea
          id={resultId}
          value={result}
          onChange={(event) => {
            onResultChange(event.target.value);
          }}
          placeholder='{"tables": [...], "columns": [...], ...}'
          className="h-28 font-mono text-xs"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
