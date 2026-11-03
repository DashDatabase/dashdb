// Docker build only (apps/web/Dockerfile): makes pnpm install sharp's prebuilt binaries for
// every architecture the image is published for, not just the build machine's. The build then
// runs once, natively, and each per-architecture image keeps only its own binaries.
// Rewrites the root package.json in the build container; never run it in a checkout.
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'package.json';
const pkg = JSON.parse(readFileSync(file, 'utf8'));
pkg.pnpm = {
  ...pkg.pnpm,
  supportedArchitectures: { os: ['linux'], cpu: ['x64', 'arm64'], libc: ['glibc'] },
};
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
