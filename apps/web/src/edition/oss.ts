// DashDB Community: projects stay in this browser, no accounts, every feature unlocked, no paid
// routes or editor slots. The app loads the active edition through `@dashdb/active-edition`
// (see next.config.ts); this is the default.
import {
  createOssProviders,
  EDITION_API_VERSION,
  EMPTY_EDITOR,
  type EditionModule,
} from '@dashdb/edition';
import { getProject, saveProject, type Project } from '@/editor/projects';

const TELEMETRY_KEY = 'dashdb.telemetry';

export const ossEdition = {
  id: 'oss',
  apiVersion: EDITION_API_VERSION,
  providers: createOssProviders({
    store: {
      // The editor only pushes its own Project values.
      save: (project) => saveProject(project as Project),
      load: getProject,
    },
    telemetry: {
      read: () => {
        try {
          return localStorage.getItem(TELEMETRY_KEY) === 'on';
        } catch {
          return null;
        }
      },
      write: (optIn) => {
        try {
          localStorage.setItem(TELEMETRY_KEY, optIn ? 'on' : 'off');
        } catch {
          // Storage is unavailable (private mode, blocked): stay off.
        }
      },
    },
  }),
  editor: EMPTY_EDITOR,
  routes: {},
} satisfies EditionModule;

export default ossEdition;
