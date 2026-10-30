// The local IndexedDB database. Bump the version and add an upgrade for every shape change;
// never edit a shipped version.
import Dexie, { type EntityTable } from 'dexie';
import type { Baseline, Project } from './store/types';
import { DEFAULT_VIEW, EMPTY_LAYOUT } from './store/types';

export const DB_NAME = 'dashdb-local';

export class DashDb extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  baselines!: EntityTable<Baseline, 'id'>;

  constructor(name: string = DB_NAME) {
    super(name);

    // v1: projects only ({ id, name, schema, createdAt, updatedAt }).
    this.version(1).stores({ projects: 'id, updatedAt' });

    // v2: canvas layout, per-project view state and a revision counter on projects;
    // baselines get their own table so the project row stays small.
    this.version(2)
      .stores({ projects: 'id, updatedAt', baselines: 'id, projectId, [projectId+createdAt]' })
      .upgrade((tx) =>
        tx
          .table('projects')
          .toCollection()
          .modify((project: Record<string, unknown>) => {
            project.layout ??= EMPTY_LAYOUT;
            project.view ??= DEFAULT_VIEW;
            project.revision ??= 0;
          }),
      );
  }
}

let instance: DashDb | undefined;

/** The shared database, opened lazily (IndexedDB only exists in the browser). */
export function db(): DashDb {
  instance ??= new DashDb();
  return instance;
}

/** Tests: point the repository at a fresh database. */
export function setDb(next: DashDb): void {
  instance = next;
}
