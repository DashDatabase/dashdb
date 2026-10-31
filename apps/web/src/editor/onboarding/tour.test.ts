import { describe, expect, it } from 'vitest';
import {
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  createTourStore,
  isStepDone,
  loadTourState,
  snapshotOf,
  type TourSnapshot,
} from './tour';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const START: TourSnapshot = {
  columns: 10,
  latestBaselineAt: 0,
  docVersion: 4,
  migrationRequest: 0,
};

describe('tour steps', () => {
  it('are the four documented steps, in order', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      'addColumn',
      'saveBaseline',
      'change',
      'generate',
    ]);
  });

  it.each([
    ['addColumn', { columns: 11 }],
    ['saveBaseline', { latestBaselineAt: 5 }],
    ['change', { docVersion: 5 }],
    ['generate', { migrationRequest: 1 }],
  ] as const)('%s is done once its signal moves', (step, moved) => {
    expect(isStepDone(step, START, START)).toBe(false);
    expect(isStepDone(step, START, { ...START, ...moved })).toBe(true);
  });

  it('does not count removing columns as adding one', () => {
    expect(isStepDone('addColumn', START, { ...START, columns: 9 })).toBe(false);
  });

  it('snapshots the editor state', () => {
    expect(
      snapshotOf({
        doc: null,
        baselines: [],
        docVersion: 2,
        migrationRequest: 3,
      }),
    ).toEqual({ columns: 0, latestBaselineAt: 0, docVersion: 2, migrationRequest: 3 });
  });
});

describe('tour state', () => {
  it('starts pending and survives reloads through storage', () => {
    const storage = memoryStorage();
    const store = createTourStore(storage);
    expect(store.getState().status).toBe('pending');
    store.getState().start('p1');
    store.getState().next();
    expect(createTourStore(storage).getState()).toMatchObject({
      status: 'active',
      step: 1,
      projectId: 'p1',
    });
  });

  it('moves back and forward, finishing after the last step', () => {
    const store = createTourStore(memoryStorage());
    store.getState().start('p1');
    store.getState().back();
    expect(store.getState().step).toBe(0);
    for (let i = 0; i < TOUR_STEPS.length; i++) store.getState().next();
    expect(store.getState().status).toBe('done');
  });

  it('remembers a dismissal', () => {
    const storage = memoryStorage();
    createTourStore(storage).getState().dismiss();
    expect(loadTourState(storage).status).toBe('dismissed');
  });

  it('treats missing, corrupt or blocked storage as a first run', () => {
    const pending = { status: 'pending', step: 0, projectId: null };
    expect(loadTourState(undefined)).toEqual(pending);
    expect(loadTourState(memoryStorage({ [TOUR_STORAGE_KEY]: '{oops' }))).toEqual(pending);
    expect(
      loadTourState(memoryStorage({ [TOUR_STORAGE_KEY]: '{"status":"active","step":99}' })),
    ).toEqual(pending);
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadTourState(blocked)).toEqual(pending);
    const failing = memoryStorage();
    failing.setItem = blocked.getItem;
    const store = createTourStore(failing);
    expect(() => {
      store.getState().start('p1');
    }).not.toThrow();
    expect(store.getState().status).toBe('active');
  });
});
