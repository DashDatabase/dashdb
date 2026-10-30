// Web Worker that runs ELK off the main thread so arranging 500 tables never blocks the UI.
import ELK from 'elkjs/lib/elk.bundled.js';
import { computeLayout, type LayoutRequest } from './elk';

// ELK's bundled build drives its own in-process "worker"; constructing it first means our
// message handler below is the one that stays installed.
const elk = new ELK();

interface LayoutMessage {
  readonly id: number;
  readonly request: LayoutRequest;
}

self.onmessage = (event: MessageEvent<LayoutMessage>) => {
  const { id, request } = event.data;
  computeLayout(elk, request).then(
    (positions) => {
      self.postMessage({ id, positions });
    },
    (error: unknown) => {
      self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
    },
  );
};
