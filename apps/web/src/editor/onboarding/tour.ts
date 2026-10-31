// The first-run guided tour: four steps, each finished by doing it in the editor. Progress is
// read from the editor store, so the tour never needs hooks inside the features it teaches.
import { createStore } from 'zustand/vanilla';
import type { EditorState } from '../store';

export interface TourStep {
  readonly id: 'addColumn' | 'saveBaseline' | 'change' | 'generate';
  readonly title: string;
  readonly body: string;
  /** CSS selector of the control the card points at; the first visible match wins. */
  readonly target: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'addColumn',
    title: 'Add a column',
    body: 'Select a table on the canvas or in the sidebar, then press C or click “Add column”.',
    target: '[data-tour="add-column"], [data-testid="canvas"]',
  },
  {
    id: 'saveBaseline',
    title: 'Save a baseline',
    body: 'A baseline is a snapshot of the schema as it is in production. Migrations are generated from it to your current design.',
    target: '[data-action="migration.saveBaseline"]',
  },
  {
    id: 'change',
    title: 'Change something',
    body: 'Rename a column, change a type, or add a table with T. Anything you change now becomes part of the migration.',
    target: '[data-testid="canvas"]',
  },
  {
    id: 'generate',
    title: 'Generate the migration',
    body: 'Press Ctrl/⌘+G or click “Generate migration” to see the SQL, its safety review and the changes on the canvas.',
    target: '[data-action="migration.generate"]',
  },
];

/** What the steps compare against: the editor as it was when the step began. */
export interface TourSnapshot {
  readonly columns: number;
  readonly latestBaselineAt: number;
  readonly docVersion: number;
  readonly migrationRequest: number;
}

export function snapshotOf(
  state: Pick<EditorState, 'doc' | 'baselines' | 'docVersion' | 'migrationRequest'>,
): TourSnapshot {
  return {
    columns: state.doc?.schema.tables.reduce((n, t) => n + t.columns.length, 0) ?? 0,
    latestBaselineAt: Math.max(0, ...state.baselines.map((b) => b.createdAt)),
    docVersion: state.docVersion,
    migrationRequest: state.migrationRequest,
  };
}

/** Whether `step` has been done since `start`. */
export function isStepDone(step: TourStep['id'], start: TourSnapshot, now: TourSnapshot): boolean {
  switch (step) {
    case 'addColumn':
      return now.columns > start.columns;
    case 'saveBaseline':
      // Only the newest baselines are kept, so a count can stay flat; the newest date moves.
      return now.latestBaselineAt > start.latestBaselineAt;
    case 'change':
      return now.docVersion > start.docVersion;
    case 'generate':
      return now.migrationRequest > start.migrationRequest;
  }
}

// --- State and persistence ------------------------------------------------------------------

export const TOUR_STORAGE_KEY = 'dashdb-onboarding';

export type TourStatus = 'pending' | 'active' | 'done' | 'dismissed';

export interface TourState {
  readonly status: TourStatus;
  readonly step: number;
  /** The project the tour runs in; it only shows there. */
  readonly projectId: string | null;
}

const INITIAL: TourState = { status: 'pending', step: 0, projectId: null };

function isTourState(value: unknown): value is TourState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    ['pending', 'active', 'done', 'dismissed'].includes(v.status as string) &&
    typeof v.step === 'number' &&
    Number.isInteger(v.step) &&
    v.step >= 0 &&
    v.step < TOUR_STEPS.length &&
    (v.projectId === null || typeof v.projectId === 'string')
  );
}

/** Reads the saved tour state; storage can be missing or blocked, which counts as a first run. */
export function loadTourState(storage: Pick<Storage, 'getItem'> | undefined): TourState {
  try {
    const raw = storage?.getItem(TOUR_STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed: unknown = JSON.parse(raw);
    return isTourState(parsed) ? parsed : INITIAL;
  } catch {
    return INITIAL;
  }
}

function save(storage: Pick<Storage, 'setItem'> | undefined, state: TourState): void {
  try {
    storage?.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or blocked storage: the tour still works for this visit.
  }
}

export interface TourActions {
  start: (projectId: string) => void;
  next: () => void;
  back: () => void;
  dismiss: () => void;
}

export function createTourStore(storage: Storage | undefined) {
  return createStore<TourState & TourActions>()((set, get) => {
    const update = (patch: Partial<TourState>) => {
      set(patch);
      const { status, step, projectId } = get();
      save(storage, { status, step, projectId });
    };
    return {
      ...loadTourState(storage),
      start: (projectId) => {
        update({ status: 'active', step: 0, projectId });
      },
      next: () => {
        const { step } = get();
        if (step + 1 >= TOUR_STEPS.length) update({ status: 'done' });
        else update({ step: step + 1 });
      },
      back: () => {
        update({ step: Math.max(0, get().step - 1) });
      },
      dismiss: () => {
        update({ status: 'dismissed' });
      },
    };
  });
}

const browserStorage = (): Storage | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

export const tourStore = createTourStore(browserStorage());

/** True until the user has started, finished or dismissed the tour once. */
export function isFirstRun(): boolean {
  return tourStore.getState().status === 'pending';
}
