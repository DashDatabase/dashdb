// A stand-in for a paid edition, for e2e/edition: DashDB Community plus one top-bar item and a
// login page. Run the app with DASHDB_EDITION_MODULE=./test/fixtures/test-edition.tsx to use it.
import type { EditionModule, RouteProps, SlotProps } from '@dashdb/edition';
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

const testEdition: EditionModule = {
  ...ossEdition,
  id: 'test-fixture',
  editor: {
    ...ossEdition.editor,
    topBarItems: [{ id: 'fixture', Component: FixtureTopBarItem }],
  },
  routes: { login: FixtureLogin },
};

export default testEdition;
