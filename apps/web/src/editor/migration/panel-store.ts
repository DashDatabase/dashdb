// Migration panel state, kept outside the component so a generated migration survives switching
// right-panel tabs. Reset whenever another project is opened.
import type { Schema } from '@dashdb/core/lite';
import { create } from 'zustand';
import type { MigrationOutput, MigrationTarget } from './compute';

/** `empty` generates from an empty database; anything else is a baseline id. */
export type MigrationSource = 'empty' | (string & {});

export interface MigrationResult {
  readonly output: MigrationOutput;
  readonly before: Schema;
  readonly after: Schema;
  readonly target: MigrationTarget;
  /** Migration name (slug) and confirmed renames it was generated with. */
  readonly slug: string;
  readonly confirmed: readonly string[];
}

export type GenerateStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'generating' }
  | { readonly kind: 'error'; readonly message: string };

interface PanelState {
  projectId: string | null;
  /** null until the user picks one: the latest baseline, else an empty database. */
  source: MigrationSource | null;
  target: MigrationTarget;
  name: string;
  /** Rename candidate key → true when it was a rename, false for drop + add. */
  decisions: ReadonlyMap<string, boolean>;
  /** Once generated, the migration regenerates as the inputs or schema change. */
  generated: boolean;
  result: MigrationResult | null;
  status: GenerateStatus;
  /** Finding keys whose safer alternative replaces the original statement. */
  applied: ReadonlySet<string>;
  direction: 'up' | 'down';
  showOnCanvas: boolean;
}

interface PanelActions {
  forProject: (projectId: string) => void;
  set: (patch: Partial<PanelState>) => void;
  decide: (decisions: ReadonlyMap<string, boolean>) => void;
  toggleApplied: (key: string) => void;
}

const initial: Omit<PanelState, 'projectId'> = {
  source: null,
  target: 'sql',
  name: '',
  decisions: new Map(),
  generated: false,
  result: null,
  status: { kind: 'idle' },
  applied: new Set(),
  direction: 'up',
  showOnCanvas: true,
};

export const useMigrationPanel = create<PanelState & PanelActions>()((set, get) => ({
  projectId: null,
  ...initial,
  forProject: (projectId) => {
    if (get().projectId !== projectId) set({ projectId, ...initial });
  },
  set: (patch) => {
    set(patch);
  },
  decide: (decisions) => {
    set({ decisions: new Map([...get().decisions, ...decisions]) });
  },
  toggleApplied: (key) => {
    const applied = new Set(get().applied);
    if (!applied.delete(key)) applied.add(key);
    set({ applied });
  },
}));
