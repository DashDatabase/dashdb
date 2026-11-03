import type { ComponentType } from 'react';
import type { EditionEditor } from './editor';
import type { EditionProviders } from './providers';

/** Bump on any breaking change to EditionModule or the types it uses. */
export const EDITION_API_VERSION = 1;

export const ROUTE_NAMES = [
  'login',
  'signup',
  'verify',
  'reset',
  'settings',
  'share',
  'invite',
  'billing',
] as const;
export type RouteName = (typeof ROUTE_NAMES)[number];

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

export interface RouteProps {
  /** Dynamic segments: `token` for share and invite, `slug` (possibly empty) for settings. */
  readonly params: Readonly<Record<string, string | string[] | undefined>>;
  readonly searchParams: SearchParams;
}

/**
 * Everything an edition plugs into the app. apps/web imports the active one through the
 * `@dashdb/active-edition` alias; DashDB Community's is `apps/web/src/edition/oss.ts`.
 */
export interface EditionModule {
  /** `oss` for DashDB Community. */
  readonly id: string;
  /** The EDITION_API_VERSION the module was written against. */
  readonly apiVersion: number;
  readonly providers: EditionProviders;
  readonly editor: EditionEditor;
  /** Pages for the account routes. A route without one is a 404. */
  readonly routes: Partial<Record<RouteName, ComponentType<RouteProps>>>;
}

const PROVIDERS = ['sync', 'auth', 'ai', 'entitlements', 'telemetry'] as const;
const SLOTS = [
  'topBarItems',
  'rightPanelTabs',
  'statusBarItems',
  'commands',
  'canvasOverlays',
  'projectMenuItems',
] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Throws a readable error unless `value` is an EditionModule for this API version. */
export function assertEditionModule(value: unknown): asserts value is EditionModule {
  const fail = (problem: string): never => {
    throw new Error(`Invalid edition module: ${problem}`);
  };
  if (!isObject(value)) return fail('expected an object');
  if (typeof value.id !== 'string' || value.id === '') fail('`id` must be a non-empty string');
  if (value.apiVersion !== EDITION_API_VERSION) {
    fail(
      `written for edition API ${String(value.apiVersion)}, but this app uses ${String(EDITION_API_VERSION)}`,
    );
  }
  const { providers, editor, routes } = value;
  if (!isObject(providers)) return fail('`providers` is missing');
  for (const name of PROVIDERS) {
    if (!isObject(providers[name])) fail(`\`providers.${name}\` is missing`);
  }
  if (!isObject(editor)) return fail('`editor` is missing');
  for (const slot of SLOTS) {
    if (!Array.isArray(editor[slot])) fail(`\`editor.${slot}\` must be an array`);
  }
  if (!isObject(routes)) return fail('`routes` must be an object');
  for (const [name, route] of Object.entries(routes)) {
    if (!(ROUTE_NAMES as readonly string[]).includes(name)) fail(`unknown route \`${name}\``);
    // Components are functions, or objects for memo/lazy/forwardRef.
    if (typeof route !== 'function' && !isObject(route)) {
      fail(`\`routes.${name}\` must be a component`);
    }
  }
}
