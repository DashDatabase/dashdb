// Blog authors. A post's `author` front matter must be one of these ids.

export interface Author {
  readonly name: string;
  readonly url: string;
}

export const AUTHORS = {
  'dashdb-team': { name: 'The DashDB team', url: 'https://github.com/DashDatabase' },
} as const satisfies Record<string, Author>;

export type AuthorId = keyof typeof AUTHORS;

export const AUTHOR_IDS = Object.keys(AUTHORS) as [AuthorId, ...AuthorId[]];
