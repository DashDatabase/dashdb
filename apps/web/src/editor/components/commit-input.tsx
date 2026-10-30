'use client';

import { Input, Textarea } from '@dashdb/ui';
import { useState, type ComponentProps } from 'react';

interface CommitProps {
  value: string;
  /** Called on blur or Enter when the text changed. Escape reverts. */
  onCommit: (value: string) => void;
}

/**
 * A text input that edits a draft and commits once (one undo step) instead of per keystroke.
 * Re-keying on `value` resets the draft when the underlying data changes (e.g. undo).
 */
export function CommitInput({
  value,
  onCommit,
  ...props
}: CommitProps & Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onBlur'>) {
  return <DraftInput key={value} value={value} onCommit={onCommit} {...props} />;
}

function DraftInput({
  value,
  onCommit,
  onKeyDown,
  ...props
}: CommitProps & Omit<ComponentProps<typeof Input>, 'value' | 'defaultValue' | 'onBlur'>) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <Input
      {...props}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Enter') {
          commit();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function CommitTextarea({
  value,
  onCommit,
  ...props
}: CommitProps & Omit<ComponentProps<typeof Textarea>, 'value' | 'defaultValue' | 'onBlur'>) {
  return <DraftTextarea key={value} value={value} onCommit={onCommit} {...props} />;
}

function DraftTextarea({
  value,
  onCommit,
  ...props
}: CommitProps & Omit<ComponentProps<typeof Textarea>, 'value' | 'defaultValue' | 'onBlur'>) {
  const [draft, setDraft] = useState(value);
  return (
    <Textarea
      {...props}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}
