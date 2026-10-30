// Multi-tab awareness over BroadcastChannel: who else has this project open, and did they save.
import { createId } from '@dashdb/core';

export const TAB_CHANNEL = 'dashdb:projects';

type Message =
  | { type: 'hello' | 'here' | 'bye'; projectId: string; tabId: string }
  | { type: 'saved'; projectId: string; tabId: string; revision: number };

function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.projectId === 'string' &&
    typeof m.tabId === 'string' &&
    (m.type === 'hello' ||
      m.type === 'here' ||
      m.type === 'bye' ||
      (m.type === 'saved' && typeof m.revision === 'number'))
  );
}

export interface TabSyncHandlers {
  /** Number of other tabs with the same project open. */
  onOtherTabs: (count: number) => void;
  /** Another tab saved this project at `revision`. */
  onRemoteSave: (revision: number) => void;
}

export interface TabSync {
  announceSave: (revision: number) => void;
  close: () => void;
}

/** Joins the tab channel for `projectId`. Without BroadcastChannel support it is a no-op. */
export function watchProjectTabs(
  projectId: string,
  handlers: TabSyncHandlers,
  createChannel: (name: string) => BroadcastChannel = (name) => new BroadcastChannel(name),
): TabSync {
  if (typeof BroadcastChannel === 'undefined') {
    return { announceSave: () => undefined, close: () => undefined };
  }
  const tabId = createId();
  const others = new Set<string>();
  const channel = createChannel(TAB_CHANNEL);
  let closed = false;

  const post = (message: Message) => {
    if (!closed) channel.postMessage(message);
  };
  const update = () => {
    handlers.onOtherTabs(others.size);
  };

  channel.onmessage = (event: MessageEvent) => {
    const message: unknown = event.data;
    if (!isMessage(message) || message.projectId !== projectId || message.tabId === tabId) return;
    switch (message.type) {
      case 'hello':
        others.add(message.tabId);
        post({ type: 'here', projectId, tabId });
        update();
        break;
      case 'here':
        others.add(message.tabId);
        update();
        break;
      case 'bye':
        others.delete(message.tabId);
        update();
        break;
      case 'saved':
        handlers.onRemoteSave(message.revision);
        break;
    }
  };

  post({ type: 'hello', projectId, tabId });

  return {
    announceSave: (revision) => {
      post({ type: 'saved', projectId, tabId, revision });
    },
    close: () => {
      if (closed) return;
      post({ type: 'bye', projectId, tabId });
      closed = true;
      channel.close();
    },
  };
}
