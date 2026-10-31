import { Fragment } from 'react';

/** Renders `backticked` spans of registry text as inline code; everything else stays plain text. */
export function InlineCode({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.9em] text-text">
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
