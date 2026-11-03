// A stand-in for a paid edition, for e2e/edition: DashDB Community plus one top-bar item, a
// login page, and telemetry that is on and records events in `window.__dashdbTelemetry`.
// Run the app with DASHDB_EDITION_MODULE=./test/fixtures/test-edition.tsx to use it.
import {
  createOptInTelemetry,
  type EditionModule,
  type RouteProps,
  type SlotProps,
  type TelemetryProps,
} from '@dashdb/edition';
import { ossEdition } from '../../src/edition/oss';

function FixtureTopBarItem({ editor }: SlotProps) {
  return (
    <span data-testid="fixture-top-bar-item" className="text-xs text-text-muted">
      Fixture edition · {editor.projectId() ?? 'no project'}
    </span>
  );
}

function FixtureLogin({ searchParams }: RouteProps) {
  const next = typeof searchParams.next === 'string' ? searchParams.next : '/app';
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Fixture login</h1>
      <p data-testid="fixture-login-next">{next}</p>
    </main>
  );
}

declare global {
  interface Window {
    __dashdbTelemetry?: [string, TelemetryProps][];
  }
}

const recordingTelemetry = createOptInTelemetry({
  read: () => true,
  write: () => undefined,
  send: (event, props) => {
    (window.__dashdbTelemetry ??= []).push([event, props]);
  },
});

const testEdition: EditionModule = {
  ...ossEdition,
  id: 'test-fixture',
  providers: { ...ossEdition.providers, telemetry: recordingTelemetry },
  editor: {
    ...ossEdition.editor,
    topBarItems: [{ id: 'fixture', Component: FixtureTopBarItem }],
  },
  routes: { login: FixtureLogin },
};

export default testEdition;
