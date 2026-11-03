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

/**
 * The contract a non-Community build implements to plug into this repository. The private
 * dashdb-cloud repository provides the implementation; this repository only defines the shape and
 * never imports one. Extension points are added here, as typed members, when the first paid
 * feature needs one.
 */
export interface EditionExtension {
  readonly edition: Edition;
}
