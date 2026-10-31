'use client';

import type { SerializeResult } from '@dashdb/core/lite';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@dashdb/ui';
import { CopyIcon, DownloadIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import {
  EXPORT_FORMATS,
  defaultExportFormat,
  exportFileName,
  exportSchema,
  isExportFormat,
  type ExportFormat,
} from '../formats';
import { downloadText } from '@/lib/download';
import { useEditor } from '../store';

export function ExportDialog() {
  const open = useEditor((s) => s.dialog === 'export');
  const closeDialog = useEditor((s) => s.closeDialog);
  const project = useEditor((s) => s.doc);
  const chosen = useEditor((s) => s.exportFormat);
  const openExport = useEditor((s) => s.openExport);
  const [result, setResult] = useState<{ format: ExportFormat; value: SerializeResult } | null>(
    null,
  );
  const formatId = useId();

  const schema = project?.schema;
  const format = chosen ?? (schema ? defaultExportFormat(schema) : 'postgres');

  useEffect(() => {
    if (!open || !schema) return;
    let cancelled = false;
    exportSchema(format, schema).then(
      (value) => {
        if (!cancelled) setResult({ format, value });
      },
      () => {
        if (!cancelled) toast.error('Export failed.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, schema, format]);

  const output = result?.format === format ? result.value : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export schema</DialogTitle>
          <DialogDescription>Copy or download the schema in another format.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor={formatId} className="text-sm font-medium">
            Format
          </label>
          <Select
            value={format}
            onValueChange={(value) => {
              if (isExportFormat(value)) openExport(value);
            }}
          >
            <SelectTrigger id={formatId} className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EXPORT_FORMATS).map(([id, { label }]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="h-80 rounded-md border bg-surface">
          <pre className="p-3 font-mono text-xs" data-testid="export-output">
            {output ? output.code || '-- empty schema' : 'Generating…'}
          </pre>
        </ScrollArea>
        {output && output.warnings.length > 0 && (
          <p className="text-sm text-warning-text">
            {output.warnings.length} {output.warnings.length === 1 ? 'element' : 'elements'} could
            not be expressed exactly in this format.
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={!output}
            onClick={() => {
              if (!output) return;
              navigator.clipboard.writeText(output.code).then(
                () => toast.success('Copied to clipboard'),
                () => toast.error('Could not copy to the clipboard'),
              );
            }}
          >
            <CopyIcon aria-hidden /> Copy
          </Button>
          <Button
            disabled={!output || !project}
            onClick={() => {
              if (output && project)
                downloadText(exportFileName(project.name, format), output.code);
            }}
          >
            <DownloadIcon aria-hidden /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
