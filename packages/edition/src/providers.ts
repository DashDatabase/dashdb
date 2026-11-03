import type { Finding, Schema } from '@dashdb/core';
import type { DocumentPatch } from './editor';

/** Called to stop listening. */
export type Unsubscribe = () => void;

/**
 * The parts of a project every edition can rely on. The editor's own project type has more
 * fields; a provider passes them through untouched, and the editor validates whatever it pulls.
 */
export interface EditionProject {
  readonly id: string;
  readonly name: string;
  readonly schema: Schema;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type SyncStatus =
  | { readonly state: 'local' }
  | { readonly state: 'synced' | 'syncing' | 'offline' }
  | { readonly state: 'error'; readonly message: string };

/** A change to an open project made somewhere else, as patches on its document. */
export interface RemoteChange {
  readonly projectId: string;
  readonly patches: readonly DocumentPatch[];
}

/** Where projects are saved and loaded. The Community edition keeps them in the browser. */
export interface SyncProvider {
  status(): SyncStatus;
  /** Saves the project and returns its new revision. Rejects on a conflicting revision. */
  push(project: EditionProject): Promise<number>;
  pull(projectId: string): Promise<EditionProject | null>;
  onRemoteChange(listener: (change: RemoteChange) => void): Unsubscribe;
}

export interface Session {
  readonly userId: string;
  readonly name: string;
  readonly email?: string;
}

export interface AuthProvider {
  getSession(): Promise<Session | null>;
  onChange(listener: (session: Session | null) => void): Unsubscribe;
}

/** Either a value, or why there isn't one. AI calls don't throw for expected failures. */
export type AIResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'not-configured' | 'error'; readonly message: string };

/**
 * AI review and generation. Results are @dashdb/core types; providers validate what a model
 * returns with core's zod schemas (`findingSchema`, `schemaSchema`) before returning it.
 */
export interface AIProvider {
  /** Whether calls can succeed now (for example, a key is set). */
  available(): boolean;
  review(ir: Schema): Promise<AIResult<Finding[]>>;
  generate(prompt: string): Promise<AIResult<Schema>>;
}

/** Features a paid edition may gate. The Community edition grants all of them. */
export type Feature =
  | 'cloud-sync'
  | 'share-links'
  | 'version-history'
  | 'shared-projects'
  | 'comments'
  | 'review'
  | 'ai'
  | 'sso'
  | 'audit-log';

export interface Limits {
  readonly projects: number;
  readonly baselinesPerProject: number;
  readonly collaborators: number;
}

/** UI gates features only through `has()`; the Community edition never shows a paywall. */
export interface EntitlementsProvider {
  has(feature: Feature): boolean;
  limits(): Limits;
}

export type TelemetryProps = Readonly<Record<string, string | number | boolean>>;

/** Anonymous product telemetry. Off unless the user opts in. */
export interface TelemetryProvider {
  isEnabled(): boolean;
  setOptIn(optIn: boolean): void;
  track(event: string, props?: TelemetryProps): void;
}

export interface EditionProviders {
  readonly sync: SyncProvider;
  readonly auth: AuthProvider;
  readonly ai: AIProvider;
  readonly entitlements: EntitlementsProvider;
  readonly telemetry: TelemetryProvider;
}
