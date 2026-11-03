import { describe, expect, it } from 'vitest';
import { EMPTY_EDITOR } from './editor';
import { assertEditionModule, EDITION_API_VERSION, type EditionModule } from './module';
import { createOssProviders } from './oss/providers';

const valid: EditionModule = {
  id: 'oss',
  apiVersion: EDITION_API_VERSION,
  providers: createOssProviders({
    store: { save: () => Promise.resolve(0), load: () => Promise.resolve(null) },
    telemetry: { read: () => null, write: () => undefined },
  }),
  editor: EMPTY_EDITOR,
  routes: { login: () => null },
};

const without = (key: string, from: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(from).filter(([k]) => k !== key));

describe('assertEditionModule', () => {
  it('accepts a complete module', () => {
    expect(() => {
      assertEditionModule(valid);
    }).not.toThrow();
    expect(() => {
      assertEditionModule({ ...valid, routes: { share: { $$typeof: Symbol('memo') } } });
    }).not.toThrow();
  });

  it.each<[string, unknown, RegExp]>([
    ['a non-object', null, /expected an object/],
    ['an empty id', { ...valid, id: '' }, /`id`/],
    ['another API version', { ...valid, apiVersion: 99 }, /edition API 99.*uses 1/],
    ['no providers', without('providers', { ...valid }), /`providers` is missing/],
    [
      'a missing provider',
      { ...valid, providers: without('telemetry', { ...valid.providers }) },
      /`providers.telemetry`/,
    ],
    ['no editor', without('editor', { ...valid }), /`editor` is missing/],
    [
      'a slot that is not an array',
      { ...valid, editor: { ...EMPTY_EDITOR, commands: {} } },
      /`editor.commands`/,
    ],
    ['no routes', { ...valid, routes: null }, /`routes` must be an object/],
    ['an unknown route', { ...valid, routes: { admin: () => null } }, /unknown route `admin`/],
    ['a route that is not a component', { ...valid, routes: { login: 'Login' } }, /`routes.login`/],
  ])('rejects %s', (_name, value, message) => {
    expect(() => {
      assertEditionModule(value);
    }).toThrow(message);
  });
});
