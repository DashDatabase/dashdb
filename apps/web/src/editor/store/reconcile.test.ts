import { enablePatches, produceWithPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import { reconcile } from './reconcile';

enablePatches();

type Doc = Record<string, unknown>;

function diff(base: Doc, next: unknown) {
  const [result, patches] = produceWithPatches(base, (draft) => {
    reconcile(draft, 'value', next);
  });
  return { result, patches };
}

describe('reconcile', () => {
  const shared = { deep: [1, 2, 3] };
  const base: Doc = {
    value: {
      a: 1,
      list: [
        { id: 'x', n: 1 },
        { id: 'y', n: 2 },
      ],
      shared,
    },
  };

  it('records only the changed leaves when references are shared', () => {
    const next = {
      a: 1,
      list: [
        { id: 'x', n: 1 },
        { id: 'y', n: 5 },
      ],
      shared,
    };
    const { result, patches } = diff(base, next);
    expect(result.value).toEqual(next);
    // list[0] is a new object with equal contents, so it produces no patch.
    expect(patches).toEqual([{ op: 'replace', path: ['value', 'list', 1, 'n'], value: 5 }]);
  });

  it('replaces arrays whose length changed and removes deleted keys', () => {
    const next = { list: [{ id: 'x', n: 1 }], shared };
    const { result, patches } = diff(base, next);
    expect(result.value).toEqual(next);
    expect(patches).toEqual(
      expect.arrayContaining([
        { op: 'remove', path: ['value', 'a'] },
        { op: 'replace', path: ['value', 'list'], value: [{ id: 'x', n: 1 }] },
      ]),
    );
  });

  it('records nothing when the value is identical', () => {
    expect(diff(base, base.value).patches).toEqual([]);
  });

  it('replaces values whose type changed', () => {
    expect(diff(base, null).patches).toEqual([{ op: 'replace', path: ['value'], value: null }]);
    expect(diff({ value: [1] }, { 0: 1 }).patches).toEqual([
      { op: 'replace', path: ['value'], value: { 0: 1 } },
    ]);
  });
});
