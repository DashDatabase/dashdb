import { afterEach, describe, expect, it, vi } from 'vitest';
import { TAB_CHANNEL, watchProjectTabs, type TabSync } from './tab-sync';

// Node's BroadcastChannel delivers between instances in the same process, like browser tabs.
const open: TabSync[] = [];
function tab(projectId: string) {
  const onOtherTabs = vi.fn<(count: number) => void>();
  const onRemoteSave = vi.fn<(revision: number) => void>();
  const sync = watchProjectTabs(projectId, { onOtherTabs, onRemoteSave });
  open.push(sync);
  return { sync, onOtherTabs, onRemoteSave };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  for (const sync of open.splice(0)) sync.close();
});

describe('watchProjectTabs', () => {
  it('tells both tabs when the same project opens twice, and when one closes', async () => {
    const a = tab('p1');
    const b = tab('p1');
    await vi.waitFor(() => {
      expect(a.onOtherTabs).toHaveBeenLastCalledWith(1);
      expect(b.onOtherTabs).toHaveBeenLastCalledWith(1);
    });

    b.sync.close();
    await vi.waitFor(() => {
      expect(a.onOtherTabs).toHaveBeenLastCalledWith(0);
    });
  });

  it('ignores other projects and malformed messages', async () => {
    const a = tab('p1');
    tab('p2');
    const stranger = new BroadcastChannel(TAB_CHANNEL);
    stranger.postMessage({ type: 'hello', projectId: 'p1' });
    stranger.postMessage('junk');
    await settle();
    stranger.close();
    expect(a.onOtherTabs).not.toHaveBeenCalled();
  });

  it('relays saves to other tabs of the same project only', async () => {
    const a = tab('p1');
    const b = tab('p1');
    const c = tab('p2');
    await vi.waitFor(() => {
      expect(b.onOtherTabs).toHaveBeenLastCalledWith(1);
    });
    a.sync.announceSave(4);
    await vi.waitFor(() => {
      expect(b.onRemoteSave).toHaveBeenCalledWith(4);
    });
    expect(a.onRemoteSave).not.toHaveBeenCalled();
    expect(c.onRemoteSave).not.toHaveBeenCalled();
  });

  it('is inert after close', async () => {
    const a = tab('p1');
    a.sync.close();
    // pagehide and React cleanup can both close; the second call must be a no-op.
    expect(() => {
      a.sync.close();
    }).not.toThrow();
    a.sync.announceSave(1);
    const b = tab('p1');
    await settle();
    expect(b.onOtherTabs).not.toHaveBeenCalled();
  });
});
