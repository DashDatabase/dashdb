import { parsePrisma, toPrisma, type Diagnostic, type Schema } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../store';
import { testProject } from '../test-fixtures';
import { shopSchema as sampleSchema } from '../canvas/test-schema';
import { resolveCodeFormat } from './code-formats';
import { applyParsed, resolveOutcome, toMarkers } from './sync';

const error = (line: number, column: number, message = 'bad'): Diagnostic => ({
  severity: 'error',
  code: 'syntax-error',
  message,
  line,
  column,
});

function editPrisma(schema: Schema, edit: (text: string) => string) {
  const text = toPrisma(schema).code;
  const edited = edit(text);
  expect(edited).not.toBe(text);
  return { result: parsePrisma(edited), base: parsePrisma(text).schema };
}

describe('applyParsed', () => {
  it('rejects code with errors without merging', () => {
    const schema = sampleSchema();
    const result = { schema: { ...schema, tables: [] }, diagnostics: [error(3, 1)] };
    expect(applyParsed(schema, result, null)).toEqual({
      kind: 'invalid',
      diagnostics: [error(3, 1)],
    });
  });

  it('rejects a dialect change', () => {
    const schema = sampleSchema();
    const outcome = applyParsed(
      schema,
      { schema: { ...schema, dialect: 'mysql' }, diagnostics: [] },
      null,
    );
    expect(outcome.kind).toBe('invalid');
    expect(outcome.diagnostics[0]?.message).toMatch(/PostgreSQL/);
  });

  it('reports unedited code as unchanged', () => {
    const schema = sampleSchema();
    const text = toPrisma(schema).code;
    const base = parsePrisma(text).schema;
    expect(applyParsed(schema, parsePrisma(text), base).kind).toBe('unchanged');
  });

  it('a Prisma column type edit updates the canvas without moving any node', () => {
    const schema = sampleSchema();
    const store = createEditorStore();
    store.getState().load(testProject({ schema }));
    const before = store.getState().doc;
    if (!before) throw new Error('not loaded');

    const { result, base } = editPrisma(before.schema, (text) =>
      text.replace(/(\n\s+name\s+)String/, '$1Int'),
    );
    const outcome = applyParsed(before.schema, result, base);
    if (outcome.kind !== 'changed') throw new Error(`expected a change, got ${outcome.kind}`);
    expect(store.getState().editSchema('Edit code', () => outcome.schema)).toBe(true);

    const after = store.getState().doc;
    expect(after?.layout).toBe(before.layout);
    expect(after?.schema.tables.map((t) => t.id)).toEqual(before.schema.tables.map((t) => t.id));
    const changed = after?.schema.tables
      .flatMap((t) => t.columns)
      .filter((c) => c.name === 'name' && c.logicalType.kind === 'int');
    expect(changed?.length).toBeGreaterThan(0);
    // One undo restores the original schema.
    store.getState().undo();
    expect(store.getState().doc?.schema).toEqual(before.schema);
  });
});

describe('resolveOutcome', () => {
  const schema = sampleSchema();

  it('ignores cancelled parses', () => {
    expect(resolveOutcome(schema, { kind: 'cancelled' })).toBeNull();
  });

  it('turns timeouts and failures into errors', () => {
    expect(resolveOutcome(schema, { kind: 'timeout' })).toMatchObject({
      kind: 'invalid',
      diagnostics: [
        { severity: 'error', message: expect.stringMatching(/longer than 2 s/) as string },
      ],
    });
    expect(resolveOutcome(schema, { kind: 'failed', message: 'boom' })).toMatchObject({
      kind: 'invalid',
      diagnostics: [{ message: 'The parser failed: boom' }],
    });
  });
});

describe('toMarkers', () => {
  it('spans the word at the diagnostic and clamps to the document', () => {
    const text = 'model User {\n  id Strin\n}';
    expect(toMarkers([error(2, 6), error(99, 99)], text)).toEqual([
      expect.objectContaining({ startLineNumber: 2, startColumn: 6, endColumn: 11 }),
      expect.objectContaining({ startLineNumber: 3, startColumn: 2, endColumn: 3 }),
    ]);
  });
});

describe('resolveCodeFormat', () => {
  it('maps SQL onto the project dialect and makes Drizzle read-only', () => {
    expect(resolveCodeFormat('sql', 'mysql')).toMatchObject({ parser: 'mysql', language: 'mysql' });
    expect(resolveCodeFormat('sql', 'postgres')).toMatchObject({
      parser: 'postgres',
      language: 'pgsql',
    });
    expect(resolveCodeFormat('sql', 'sqlite').parser).toBeNull();
    expect(resolveCodeFormat('drizzle', 'postgres').parser).toBeNull();
    expect(resolveCodeFormat('dbml', 'postgres').parser).toBe('dbml');
  });
});
