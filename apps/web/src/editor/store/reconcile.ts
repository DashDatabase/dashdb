import { isDraft, original, type Draft } from 'immer';

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

/**
 * Writes `next` into `draft[key]` touching only what changed, so Immer records minimal patches.
 *
 * @dashdb/core edit functions return new objects but keep references to unchanged parts, so
 * reference equality against the draft's original finds exactly the edited paths. Arrays that
 * change length are replaced whole (their elements are still shared, so this stays cheap).
 */
export function reconcile(draft: Draft<Container>, key: string | number, next: unknown): void {
  const parent = draft as Record<string | number, unknown>;
  const base = isDraft(draft)
    ? (original(draft) as Record<string | number, unknown>)[key]
    : parent[key];
  if (Object.is(base, next)) return;

  const current = parent[key];
  const sameShape =
    isContainer(base) &&
    isContainer(next) &&
    Array.isArray(base) === Array.isArray(next) &&
    (!Array.isArray(base) || (Array.isArray(next) && base.length === next.length));
  if (!sameShape || !isDraft(current)) {
    parent[key] = next;
    return;
  }

  const target = current as Draft<Container>;
  if (Array.isArray(next)) {
    next.forEach((item, i) => {
      reconcile(target, i, item);
    });
    return;
  }
  const nextRecord = next;
  const targetRecord = target as Record<string, unknown>;
  for (const k of Object.keys(targetRecord)) {
    if (!(k in nextRecord)) Reflect.deleteProperty(targetRecord, k);
  }
  for (const [k, value] of Object.entries(nextRecord)) reconcile(target, k, value);
}
