'use client';

import { cn } from '@dashdb/ui';
import { memo } from 'react';
import { tokenizeSql, type SqlTokenKind } from './sql-tokens';

const TOKEN_CLASSES: Record<SqlTokenKind, string> = {
  keyword: 'font-semibold text-primary-text',
  type: 'text-accent-text',
  string: 'text-success-text',
  identifier: 'text-text',
  number: 'text-danger-text',
  comment: 'italic text-text-muted',
  punctuation: 'text-text-muted',
  plain: '',
};

/** Read-only, highlighted SQL. */
export const SqlCode = memo(function SqlCode({
  sql,
  className,
}: {
  sql: string;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        'overflow-x-auto font-mono text-xs leading-5 whitespace-pre text-text',
        className,
      )}
    >
      <code>
        {tokenizeSql(sql).map((token, i) =>
          token.kind === 'plain' ? (
            token.text
          ) : (
            // Tokens never reorder, so the index is a stable key.
            <span key={i} className={TOKEN_CLASSES[token.kind]}>
              {token.text}
            </span>
          ),
        )}
      </code>
    </pre>
  );
});
