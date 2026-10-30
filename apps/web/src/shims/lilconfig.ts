// Browser stand-in for `lilconfig`, which @mrleebo/prisma-ast (via @dashdb/core) calls at import
// time to look for a config file on disk. There is no disk in the browser, so nothing is found.
const noConfig = {
  search: () => null,
  load: () => null,
  clearLoadCache: () => undefined,
  clearSearchCache: () => undefined,
  clearCaches: () => undefined,
};

export function lilconfigSync() {
  return noConfig;
}

export function lilconfig() {
  return {
    search: () => Promise.resolve(null),
    load: () => Promise.resolve(null),
    clearLoadCache: () => undefined,
    clearSearchCache: () => undefined,
    clearCaches: () => undefined,
  };
}
