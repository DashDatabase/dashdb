/**
 * Which build of DashDB this is. `cloud` is dashdb.dev: waitlist, pricing and "coming with DashDB
 * Cloud" hints. `oss` is a self-hosted build (the Docker image sets it): those are hidden and the
 * waitlist action refuses signups. A NEXT_PUBLIC_ variable, so it is fixed when the app is built.
 */
export type Edition = 'cloud' | 'oss';

export function getEdition(
  value: string | undefined = process.env.NEXT_PUBLIC_DASHDB_EDITION,
): Edition {
  return value?.trim().toLowerCase() === 'oss' ? 'oss' : 'cloud';
}

export function isCloudEdition(value?: string): boolean {
  return getEdition(value) === 'cloud';
}

export * from './editor';
export * from './module';
export * from './providers';
export * from './oss/providers';
