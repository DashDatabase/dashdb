// Web Worker that generates migrations off the main thread.
import { computeMigration, type MigrationRequest } from './compute';

self.onmessage = (event: MessageEvent<{ id: number; request: MigrationRequest }>) => {
  const { id, request } = event.data;
  void computeMigration(request).then((response) => {
    self.postMessage({ id, response });
  });
};
