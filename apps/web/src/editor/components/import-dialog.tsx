'use client';

import type { Diagnostic } from '@dashdb/core';
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
  Textarea,
  toast,
} from '@dashdb/ui';
import { FileUpIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import {
  IMPORT_ACCEPT,
  IMPORT_FORMATS,
  MAX_IMPORT_BYTES,
  detectImportFormat,
  importSchema,
  isImportFormat,
  type ImportFormat,
} from '../formats';
import { useEditor } from '../store';

export function ImportDialog() {
  const open = useEditor((s) => s.dialog === 'import');
  const closeDialog = useEditor((s) => s.closeDialog);
  const editSchema = useEditor((s) => s.editSchema);
  const [text, setText] = useState('');
  const [format, setFormat] = useState<ImportFormat>('postgres');
  const [errors, setErrors] = useState<readonly Diagnostic[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const textId = useId();
  const formatId = useId();

  const reset = () => {
    setText('');
    setErrors([]);
  };

  const loadFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error('That file is larger than 2 MB.');
      return;
    }
    const content = await file.text();
    setText(content);
    setFormat(detectImportFormat(file.name, content));
    setErrors([]);
  };

  const submit = () => {
    const { schema, diagnostics } = importSchema(format, text);
    const fatal = diagnostics.filter((d) => d.severity === 'error');
    if (fatal.length > 0 && schema.tables.length === 0) {
      setErrors(fatal);
      return;
    }
    editSchema('Import schema', () => schema);
    closeDialog();
    reset();
    const warnings = diagnostics.length;
    toast.success(
      `Imported ${String(schema.tables.length)} tables` +
        (warnings ? ` with ${String(warnings)} ${warnings === 1 ? 'note' : 'notes'}` : ''),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeDialog();
          reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import schema</DialogTitle>
          <DialogDescription>
            Replaces the current schema. You can undo the import.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label htmlFor={formatId} className="text-sm font-medium">
                Format
              </label>
              <Select
                value={format}
                onValueChange={(value) => {
                  if (isImportFormat(value)) setFormat(value);
                }}
              >
                <SelectTrigger id={formatId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(IMPORT_FORMATS).map(([id, { label }]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                fileRef.current?.click();
              }}
            >
              <FileUpIcon aria-hidden /> Choose file…
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept={IMPORT_ACCEPT}
              className="hidden"
              aria-label="Schema file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void loadFile(file);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={textId} className="text-sm font-medium">
              Schema source
            </label>
            <Textarea
              id={textId}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setErrors([]);
              }}
              placeholder="Paste DDL, a Prisma schema or DBML…"
              className="h-64 font-mono text-xs"
              spellCheck={false}
            />
          </div>
          {errors.length > 0 && (
            <ul
              role="alert"
              className="space-y-1 rounded-md border border-destructive/40 p-3 text-sm text-danger-text"
            >
              {errors.slice(0, 5).map((d) => (
                <li key={`${String(d.line)}:${String(d.column)}:${d.code}`}>
                  Line {d.line}: {d.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button disabled={!text.trim()} onClick={submit}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
