// Two-way sync between one Monaco editor and the schema. Kept outside React: the editor's
// callbacks need the latest state, and none of it affects rendering except `onStatus`.
import type { Schema } from '@dashdb/core';
import type * as Monaco from 'monaco-editor/editor/editor.api';
import { exportSchema } from '../formats';
import { resolveCodeFormat, type CodeFormat, type ResolvedCodeFormat } from './code-formats';
import type { MonacoApi } from './monaco';
import { createParseClient, type ParseClient } from './parse-client';
import { resolveOutcome, toMarkers, type MarkerData } from './sync';

/** Idle time after typing before the code is parsed and applied. */
export const CODE_APPLY_DELAY_MS = 600;
/** Canvas edits come in bursts (dragging, typing names); regenerate once they settle. */
export const CODE_SERIALIZE_DELAY_MS = 150;
const MARKER_OWNER = 'dashdb';

export type CodeStatus =
  | { readonly kind: 'synced' }
  | { readonly kind: 'editing' }
  | { readonly kind: 'parsing' }
  | { readonly kind: 'invalid'; readonly errors: number }
  | { readonly kind: 'generate-failed' };

export interface CodeControllerHost {
  readonly onStatus: (status: CodeStatus) => void;
  /** The schema code is merged into (read when a parse finishes, so it is never stale). */
  readonly getSchema: () => Schema | null;
  /** Commits a merged schema; returns the stored schema, or null if the edit was refused. */
  readonly commit: (schema: Schema) => Schema | null;
}

export class CodeController {
  readonly editor: Monaco.editor.IStandaloneCodeEditor;
  private format: CodeFormat | null = null;
  private resolved: ResolvedCodeFormat | null = null;
  /** Text last known to describe the canvas: the serializer's output or applied code. */
  private syncedText: string | null = null;
  /** Latest schema shown or produced by the panel; its echo through the store is ignored. */
  private shownSchema: Schema | null = null;
  /** Set while the panel writes text, so its own writes don't count as user edits. */
  private writing = false;
  private applyTimer: ReturnType<typeof setTimeout> | undefined;
  private serializeTimer: ReturnType<typeof setTimeout> | undefined;
  private serializeRun = 0;
  private parser: ParseClient | null = null;
  private disposed = false;

  constructor(
    private readonly monaco: MonacoApi,
    container: HTMLElement,
    private readonly host: CodeControllerHost,
  ) {
    this.editor = monaco.editor.create(container, {
      value: '',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 12,
      lineNumbersMinChars: 3,
      scrollBeyondLastLine: false,
      tabSize: 2,
      fixedOverflowWidgets: true,
      readOnly: true,
      ariaLabel: 'Schema code',
    });
    this.editor.onDidChangeModelContent(() => {
      if (this.writing || !this.resolved?.parser) return;
      this.host.onStatus({ kind: 'editing' });
      clearTimeout(this.applyTimer);
      this.applyTimer = setTimeout(() => {
        void this.apply();
      }, CODE_APPLY_DELAY_MS);
    });
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void this.apply();
    });
  }

  getText(): string {
    return this.editor.getValue();
  }

  /**
   * Canvas → code. Regenerates the text when the schema or format changes, except for the
   * panel's own edits coming back from the store (the user's text already says it).
   */
  show(schema: Schema, format: CodeFormat): void {
    if (schema === this.shownSchema && format === this.format) return;
    const formatChanged = format !== this.format;
    this.format = format;
    this.resolved = resolveCodeFormat(format, schema.dialect);
    this.shownSchema = schema;
    const resolved = this.resolved;
    if (resolved.parser) {
      this.parser ??= createParseClient();
      this.parser.warm();
    }
    const run = ++this.serializeRun;
    const firstFill = this.syncedText === null || formatChanged;

    clearTimeout(this.serializeTimer);
    this.serializeTimer = setTimeout(
      () => {
        exportSchema(resolved.exportFormat, schema).then(
          ({ code }) => {
            if (run === this.serializeRun && !this.disposed) this.fill(code, resolved, firstFill);
          },
          () => {
            if (run === this.serializeRun && !this.disposed) {
              this.host.onStatus({ kind: 'generate-failed' });
            }
          },
        );
      },
      firstFill ? 0 : CODE_SERIALIZE_DELAY_MS,
    );
  }

  private fill(code: string, resolved: ResolvedCodeFormat, firstFill: boolean): void {
    const model = this.editor.getModel();
    if (!model) return;
    clearTimeout(this.applyTimer);
    this.monaco.editor.setModelLanguage(model, resolved.language);
    this.editor.updateOptions({ readOnly: resolved.parser === null });
    if (model.getValue() !== code) {
      const view = this.editor.saveViewState();
      this.writing = true;
      model.setValue(code);
      this.writing = false;
      if (!firstFill && view) this.editor.restoreViewState(view);
    }
    this.syncedText = code;
    this.setMarkers([]);
    this.host.onStatus({ kind: 'synced' });
  }

  /** Code → canvas: parses the text and, if it is valid, merges it into the schema. */
  async apply(): Promise<void> {
    clearTimeout(this.applyTimer);
    const parser = this.resolved?.parser;
    if (!parser || this.disposed) return;
    const text = this.editor.getValue();
    if (text === this.syncedText) {
      this.setMarkers([]);
      this.host.onStatus({ kind: 'synced' });
      return;
    }
    this.parser ??= createParseClient();
    this.host.onStatus({ kind: 'parsing' });
    const outcome = await this.parser.parse({ parser, text, baseText: this.syncedText });
    // Typing continued (a newer parse is due), or the panel closed (no model): drop the result.
    if (!this.editor.getModel() || this.editor.getValue() !== text) return;
    const current = this.host.getSchema();
    const result = current ? resolveOutcome(current, outcome) : null;
    if (!result) return;

    this.setMarkers(toMarkers(result.diagnostics, text));
    if (result.kind === 'invalid') {
      const errors = result.diagnostics.filter((d) => d.severity === 'error').length;
      this.host.onStatus({ kind: 'invalid', errors });
      return;
    }
    if (result.kind === 'changed') {
      const stored = this.host.commit(result.schema);
      if (!stored) {
        this.host.onStatus({ kind: 'invalid', errors: 1 });
        return;
      }
      this.shownSchema = stored;
    }
    this.syncedText = text;
    this.host.onStatus({ kind: 'synced' });
  }

  private setMarkers(markers: readonly MarkerData[]): void {
    const model = this.editor.getModel();
    if (!model) return;
    const { MarkerSeverity } = this.monaco;
    const severity = {
      error: MarkerSeverity.Error,
      warning: MarkerSeverity.Warning,
      info: MarkerSeverity.Info,
    };
    this.monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      markers.map((m) => ({ ...m, severity: severity[m.severity] })),
    );
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.applyTimer);
    clearTimeout(this.serializeTimer);
    this.parser?.dispose();
    this.editor.getModel()?.dispose();
    this.editor.dispose();
  }
}
