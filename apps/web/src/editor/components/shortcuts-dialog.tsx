'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@dashdb/ui';
import { ACTIONS, GROUP_ORDER, shortcutsOf, type EditorAction } from '../actions';
import { useEditor } from '../store';
import { ShortcutKeys } from './action-button';

/** The "?" cheat sheet: every registry action with its keys, so it can never go stale. */
export function ShortcutsDialog() {
  const open = useEditor((s) => s.dialog === 'shortcuts');
  const closeDialog = useEditor((s) => s.closeDialog);
  const actions = ACTIONS as readonly EditorAction[];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Single-key shortcuts work when you are not typing in a field. Press ? to show this list
            again.
          </DialogDescription>
        </DialogHeader>
        {/* Focusable so the list can be scrolled from the keyboard. */}
        <div
          tabIndex={0}
          aria-label="Shortcut list"
          className="max-h-[65vh] overflow-y-auto rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <div className="grid gap-x-8 gap-y-5 pr-3 sm:grid-cols-2">
            {GROUP_ORDER.map((group) => {
              const inGroup = actions.filter((a) => a.group === group);
              if (inGroup.length === 0) return null;
              return (
                <section key={group} aria-labelledby={`shortcuts-${group}`}>
                  <h3
                    id={`shortcuts-${group}`}
                    className="mb-1.5 text-xs font-semibold tracking-wide text-text-muted uppercase"
                  >
                    {group}
                  </h3>
                  <dl className="space-y-1">
                    {inGroup.map((action) => (
                      <div
                        key={action.id}
                        className="flex items-center justify-between gap-3 text-sm"
                        data-testid="shortcut-row"
                      >
                        <dt>{action.title.replace(/…$/, '')}</dt>
                        <dd className="flex shrink-0 items-center gap-1.5 text-text-muted">
                          {shortcutsOf(action).map((shortcut, i) => (
                            <span key={shortcut} className="flex items-center gap-1.5">
                              {i > 0 && <span className="text-xs">or</span>}
                              <ShortcutKeys shortcut={shortcut} />
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
