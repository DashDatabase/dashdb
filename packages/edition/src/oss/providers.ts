// DashDB Community's providers: everything stays in the browser and nothing is locked.
import type {
  AIProvider,
  AIResult,
  AuthProvider,
  EditionProject,
  EditionProviders,
  EntitlementsProvider,
  Limits,
  SyncProvider,
  TelemetryProps,
  TelemetryProvider,
  Unsubscribe,
} from '../providers';
import { sanitizeTelemetryEvent, type TelemetryEventName } from '../telemetry';

const noop: Unsubscribe = () => undefined;

/** The editor's local project storage (Dexie in apps/web). */
export interface LocalProjectStore {
  save(project: EditionProject): Promise<number>;
  load(projectId: string): Promise<EditionProject | null>;
}

/** Saves and loads through the browser's storage. There is no remote, so nothing changes remotely. */
export function createLocalOnlySyncProvider(store: LocalProjectStore): SyncProvider {
  return {
    status: () => ({ state: 'local' }),
    push: (project) => store.save(project),
    pull: (projectId) => store.load(projectId),
    onRemoteChange: () => noop,
  };
}

/** No accounts: nobody is ever signed in. */
export const noAuthProvider: AuthProvider = {
  getSession: () => Promise.resolve(null),
  onChange: () => noop,
};

const notConfigured: AIResult<never> = {
  ok: false,
  reason: 'not-configured',
  message: 'AI features need an API key. Add one in the editor settings.',
};

/**
 * Bring-your-own-key AI: calls go from the browser with the user's key. Until a key can be set
 * (P32a), it reports itself unavailable and makes no network calls.
 */
export function createByokAIProvider(): AIProvider {
  return {
    available: () => false,
    review: () => Promise.resolve(notConfigured),
    generate: () => Promise.resolve(notConfigured),
  };
}

const UNLIMITED: Limits = {
  projects: Infinity,
  baselinesPerProject: Infinity,
  collaborators: Infinity,
};

/** Every feature, no limits. Community builds never show a paywall. */
export const allLocalEntitlements: EntitlementsProvider = {
  has: () => true,
  limits: () => UNLIMITED,
};

export interface OptInTelemetryOptions {
  /** Reads the stored opt-in; anything but `true` means off. */
  readonly read: () => boolean | null;
  readonly write: (optIn: boolean) => void;
  /** Where events go once opted in, already sanitized. Without one, events are dropped. */
  readonly send?: (event: TelemetryEventName, props: TelemetryProps) => void;
}

/**
 * Off unless the user opted in; even then, only sends if a destination is configured, and only
 * the catalogued properties (anything else, or an invalid event, is dropped).
 */
export function createOptInTelemetry({
  read,
  write,
  send,
}: OptInTelemetryOptions): TelemetryProvider {
  const isEnabled = () => read() === true;
  return {
    isEnabled,
    setOptIn: (optIn) => {
      write(optIn);
    },
    track: (event, props) => {
      if (!send || !isEnabled()) return;
      const clean = sanitizeTelemetryEvent(event, props);
      if (clean) send(event, clean);
    },
  };
}

export interface OssProvidersOptions {
  readonly store: LocalProjectStore;
  readonly telemetry: OptInTelemetryOptions;
}

export function createOssProviders({ store, telemetry }: OssProvidersOptions): EditionProviders {
  return {
    sync: createLocalOnlySyncProvider(store),
    auth: noAuthProvider,
    ai: createByokAIProvider(),
    entitlements: allLocalEntitlements,
    telemetry: createOptInTelemetry(telemetry),
  };
}
