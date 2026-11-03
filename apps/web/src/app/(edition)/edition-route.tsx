import type { RouteName } from '@dashdb/edition';
import { notFound } from 'next/navigation';
import { edition } from '@/edition/active';

type Params = Record<string, string | string[] | undefined>;

export interface EditionPageProps {
  readonly params: Promise<Params>;
  readonly searchParams: Promise<Params>;
}

/** Renders the active edition's page for `name`, or a 404 when the edition has none. */
export async function renderEditionRoute(name: RouteName, props: EditionPageProps) {
  const Route = edition.routes[name];
  if (!Route) notFound();
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  return <Route params={params} searchParams={searchParams} />;
}
