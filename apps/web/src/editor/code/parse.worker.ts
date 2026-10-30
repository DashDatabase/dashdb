// Web Worker that parses Code panel text off the main thread, so a pathological input can be
// abandoned (the worker terminated) without freezing the editor.
import type { ParseResult } from '@dashdb/core';
import { importSchema, type ImportFormat } from '../formats';
import type { ParseReply, ParseRequest } from './parse-client';

/** The base text rarely changes between edits, so its parse is cached. */
let cachedBase: { parser: ImportFormat; text: string; result: ParseResult } | null = null;

function parseBase(parser: ImportFormat, text: string): ParseResult {
  if (cachedBase?.parser === parser && cachedBase.text === text) return cachedBase.result;
  const result = importSchema(parser, text);
  cachedBase = { parser, text, result };
  return result;
}

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  const { id, parser, text, baseText } = event.data;
  let reply: ParseReply;
  try {
    const result = importSchema(parser, text);
    const base = baseText === null ? null : parseBase(parser, baseText);
    const baseUsable = base?.diagnostics.every((d) => d.severity !== 'error') ?? false;
    reply = { id, result, base: base && baseUsable ? base.schema : null };
  } catch (error) {
    reply = { id, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
};

const ready: ParseReply = { ready: true };
self.postMessage(ready);
