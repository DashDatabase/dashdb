export type SerializeWarningCode = 'unsupported-feature' | 'lossy-type' | 'renamed';

/** Something in the IR the target format could not express exactly. */
export interface SerializeWarning {
  readonly code: SerializeWarningCode;
  readonly message: string;
  /** Qualified name of the affected element, e.g. `public.users.email`. */
  readonly element: string;
}

export interface SerializeResult {
  readonly code: string;
  readonly warnings: readonly SerializeWarning[];
}
