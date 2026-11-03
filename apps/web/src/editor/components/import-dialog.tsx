'use client';

import type { IntrospectionDialect, ParseResult } from '@dashdb/core/lite';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@dashdb/ui';
import { FileUpIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { track } from '@/lib/telemetry';
import {
  IMPORT_FORMATS,
  detectPastedFormat,
  importSchema,
  isImportFormat,
  type ImportFormat,
} from '../formats';
import { applyProjectFile } from '../import/apply';
import { DatabaseTab } from '../import/database-tab';
import {
  UPLOAD_ACCEPT,
  classifyUpload,
  importIntrospection,
  maxUploadBytes,
  type UploadedFile,
} from '../import/import-sources';
import { useEditor } from '../store';

type Source = 'paste' | 'upload' | 'database';
const AUTO = 'auto';

/** A problem shown under the tabs: parser diagnostics carry a line, file errors do not. */
interface Problem {
  readonly key: string;
  readonly text: string;
}

function FormatSelect({
  id,
  detected,
  override,
  onChange,
}: {
  id: string;
  detected: ImportFormat;
  override: ImportFormat | null;
  onChange: (format: ImportFormat | null) => void;
}) {
  return (
    <Select
      value={override ?? AUTO}
      onValueChange={(value) => {
        onChange(isImportFormat(value) ? value : null);
      }}
    >
      <SelectTrigger id={id} className="w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>Auto-detect ({IMPORT_FORMATS[detected].label})</SelectItem>
        {Object.entries(IMPORT_FORMATS).map(([value, { label }]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ImportDialog() {
  const open = useEditor((s) => s.dialog === 'import');
  const closeDialog = useEditor((s) => s.closeDialog);
  const editSchema = useEditor((s) => s.editSchema);
  const transact = useEditor((s) => s.transact);
  const setNodePositions = useEditor((s) => s.setNodePositions);
  const setNodeCollapsed = useEditor((s) => s.setNodeCollapsed);
  const setNodeColor = useEditor((s) => s.setNodeColor);
  const runCanvasCommand = useEditor((s) => s.runCanvasCommand);
  const projectDialect = useEditor((s) => s.doc?.schema.dialect);

  const [source, setSource] = useState<Source>('paste');
  const [pasted, setPasted] = useState('');
  const [pasteOverride, setPasteOverride] = useState<ImportFormat | null>(null);
  const [upload, setUpload] = useState<{ name: string; file: UploadedFile } | null>(null);
  const [uploadOverride, setUploadOverride] = useState<ImportFormat | null>(null);
  const [dialect, setDialect] = useState<IntrospectionDialect>(
    projectDialect === 'mysql' ? 'mysql' : 'postgres',
  );
  const [result, setResult] = useState('');
  const [problems, setProblems] = useState<readonly Problem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { paste: useId(), pasteFormat: useId(), uploadFormat: useId() };

  const detectedPaste = detectPastedFormat(pasted);

  const reset = () => {
    setPasted('');
    setPasteOverride(null);
    setUpload(null);
    setUploadOverride(null);
    setResult('');
    setProblems([]);
  };
  const close = () => {
    closeDialog();
    reset();
  };

  const loadFile = async (file: File) => {
    setProblems([]);
    setUploadOverride(null);
    if (file.size > maxUploadBytes(file.name)) {
      setUpload({
        name: file.name,
        file: { kind: 'error', errors: ['That file is too large to import.'] },
      });
      return;
    }
    setUpload({ name: file.name, file: classifyUpload(file.name, await file.text()) });
  };

  /** Puts a parsed schema into the project, or shows why it cannot. */
  const applySchema = (
    format: ImportFormat | 'database',
    { schema, diagnostics }: ParseResult,
    emptyHint?: string,
  ) => {
    const fatal = diagnostics.filter((d) => d.severity === 'error');
    if (fatal.length > 0 && schema.tables.length === 0) {
      setProblems(
        fatal.map((d) => ({
          key: `${String(d.line)}:${String(d.column)}:${d.code}:${d.message}`,
          text: d.line > 1 ? `Line ${String(d.line)}: ${d.message}` : d.message,
        })),
      );
      return;
    }
    if (schema.tables.length === 0 && emptyHint) {
      setProblems([{ key: 'empty', text: emptyHint }]);
      return;
    }
    if (editSchema('Import schema', () => schema)) runCanvasCommand('arrange');
    track('schema_imported', { format });
    close();
    const notes = diagnostics.length;
    toast.success(
      `Imported ${String(schema.tables.length)} tables` +
        (notes ? ` with ${String(notes)} ${notes === 1 ? 'note' : 'notes'}` : ''),
    );
  };

  const submit = async () => {
    setProblems([]);
    if (source === 'paste') {
      const format = pasteOverride ?? detectedPaste;
      applySchema(format, await importSchema(format, pasted));
    } else if (source === 'database') {
      applySchema(
        'database',
        importIntrospection(dialect, result),
        dialect === 'mysql'
          ? 'The result has no tables. Select the database to import before running the query: it reads the current database (DATABASE()).'
          : 'The result has no tables. Check that you ran the query against the right database.',
      );
    } else if (upload?.file.kind === 'schema') {
      const format = uploadOverride ?? upload.file.format;
      applySchema(format, await importSchema(format, upload.file.text));
    } else if (upload?.file.kind === 'project') {
      const { file } = upload.file;
      if (
        applyProjectFile(
          { transact, editSchema, setNodePositions, setNodeCollapsed, setNodeColor },
          file,
        )
      ) {
        track('schema_imported', { format: 'project' });
        close();
        toast.success(`Imported ${String(file.project.schema.tables.length)} tables`, {
          description: `Schema and layout from “${file.project.name}”.`,
        });
      } else {
        setProblems([{ key: 'apply', text: 'This project file could not be applied.' }]);
      }
    }
  };

  const canSubmit =
    source === 'paste'
      ? pasted.trim() !== ''
      : source === 'database'
        ? result.trim() !== ''
        : upload !== null && upload.file.kind !== 'error';

  const uploadErrors = upload?.file.kind === 'error' ? upload.file.errors : [];
  const shown: readonly Problem[] = [
    ...problems,
    ...(source === 'upload' ? uploadErrors.map((text) => ({ key: text, text })) : []),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import schema</DialogTitle>
          <DialogDescription>
            Replaces the current schema. You can undo the import.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={source}
          onValueChange={(value) => {
            if (value === 'paste' || value === 'upload' || value === 'database') {
              setSource(value);
              setProblems([]);
            }
          }}
        >
          <TabsList aria-label="Import source">
            <TabsTrigger value="paste">Paste SQL</TabsTrigger>
            <TabsTrigger value="upload">Upload file</TabsTrigger>
            <TabsTrigger value="database">From existing database</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <label htmlFor={ids.pasteFormat} className="text-sm font-medium">
                Format
              </label>
              <FormatSelect
                id={ids.pasteFormat}
                detected={detectedPaste}
                override={pasteOverride}
                onChange={setPasteOverride}
              />
            </div>
            <Textarea
              id={ids.paste}
              aria-label="Schema source"
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
                setProblems([]);
              }}
              placeholder="Paste CREATE TABLE statements, a pg_dump / mysqldump schema, a Prisma schema or DBML…"
              className="h-64 font-mono text-xs"
              spellCheck={false}
            />
          </TabsContent>

          <TabsContent value="upload" className="space-y-3 pt-2">
            <button
              type="button"
              className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm text-text-muted outline-none hover:bg-highlight focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => {
                fileRef.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void loadFile(file);
              }}
            >
              <FileUpIcon aria-hidden className="size-6" />
              <span>{upload ? upload.name : 'Choose or drop a file'}</span>
              <span className="text-xs">.sql · .prisma · .dbml · .dashdb.json</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              className="hidden"
              aria-label="Schema file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void loadFile(file);
              }}
            />
            {upload?.file.kind === 'schema' && (
              <div className="flex items-center gap-3">
                <label htmlFor={ids.uploadFormat} className="text-sm font-medium">
                  Format
                </label>
                <FormatSelect
                  id={ids.uploadFormat}
                  detected={upload.file.format}
                  override={uploadOverride}
                  onChange={setUploadOverride}
                />
              </div>
            )}
            {upload?.file.kind === 'project' && (
              <p className="text-sm text-text-muted">
                DashDB project “{upload.file.file.project.name}” with{' '}
                {upload.file.file.project.schema.tables.length} tables. Its schema and layout
                replace this project&apos;s; baselines are kept. To bring its baselines too, import
                it as a new project from the projects page.
              </p>
            )}
          </TabsContent>

          <TabsContent value="database" className="pt-2">
            <DatabaseTab
              dialect={dialect}
              onDialectChange={(next) => {
                setDialect(next);
                setProblems([]);
              }}
              result={result}
              onResultChange={(text) => {
                setResult(text);
                setProblems([]);
              }}
            />
          </TabsContent>
        </Tabs>

        {shown.length > 0 && (
          <ul
            role="alert"
            className="space-y-1 rounded-md border border-destructive/40 p-3 text-sm text-danger-text"
          >
            {shown.slice(0, 5).map((p) => (
              <li key={p.key}>{p.text}</li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
