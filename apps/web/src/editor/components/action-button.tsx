'use client';

import { Button, Kbd, KbdGroup, Tooltip, TooltipContent, TooltipTrigger } from '@dashdb/ui';
import type { ComponentProps, ReactNode } from 'react';
import { getAction, isActionEnabled, type ActionId } from '../actions';
import { useIsMac, useRunAction } from '../hooks';
import { ariaShortcut, formatShortcut } from '../shortcuts';
import { useEditor } from '../store';

export function ShortcutKeys({ shortcut }: { shortcut: string }) {
  const isMac = useIsMac();
  return (
    <KbdGroup>
      {formatShortcut(shortcut, isMac).map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

type ActionButtonProps = Omit<ComponentProps<typeof Button>, 'onClick' | 'children'> & {
  action: ActionId;
  /** Visible content; defaults to the action title, which is always the accessible name. */
  children?: ReactNode;
};

/** A toolbar button bound to a registry action, with its title and shortcut in a tooltip. */
export function ActionButton({ action: id, children, ...props }: ActionButtonProps) {
  const action = getAction(id);
  const enabled = useEditor((state) => isActionEnabled(action, state));
  const run = useRunAction();
  const isMac = useIsMac();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          // Labels collapse to icons on narrow screens, so the title is always the accessible name.
          aria-label={action.title}
          aria-keyshortcuts={ariaShortcut(action.shortcut, isMac)}
          disabled={!enabled}
          onClick={() => {
            run(action);
          }}
        >
          {children ?? action.title}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {action.title} <ShortcutKeys shortcut={action.shortcut} />
      </TooltipContent>
    </Tooltip>
  );
}
