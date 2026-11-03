# syntax=docker/dockerfile:1
# DashDB web app, self-hosted (OSS) edition. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t dashdb .
# Base images are pinned by digest; Dependabot proposes updates.
#
# Multi-arch without emulating the build: the app is built once on the build machine's own
# platform ($BUILDPLATFORM). The output is platform-independent JavaScript except sharp (used
# by next/image), whose prebuilt binaries are installed for both architectures; each image
# keeps only its own.

FROM --platform=$BUILDPLATFORM node:22-trixie-slim@sha256:2117f713a417f3aff682ac8f5bc2ebbdf1beed51f36e67ab1e0fd3866b6d2d8f AS deps
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1 \
    HUSKY=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Dependencies first, so they stay cached until the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/scripts/docker-architectures.mjs /tmp/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    node /tmp/docker-architectures.mjs && pnpm fetch --frozen-lockfile

COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    node /tmp/docker-architectures.mjs && pnpm install --frozen-lockfile --offline

FROM deps AS build
# NEXT_PUBLIC_* values are compiled into the pages, so they are build arguments.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GITHUB_URL
ARG NEXT_PUBLIC_DASHDB_EDITION=oss
# Build memory grows with the CPU count: on 16 CPUs the build was OOM-killed at 7 GB. These cap
# it at about 6 GB whatever the machine. NEXT_BUILD_CPUS sets Next's static generation workers;
# BUILD_THREADS goes to the thread pools of Turbopack's Rust runtimes (tokio and rayon read
# these variables themselves; Next has no option for it). Raise both on bigger build machines.
ARG NEXT_BUILD_CPUS=2
ARG BUILD_THREADS=4
ENV NEXT_OUTPUT=standalone \
    NEXT_BUILD_CPUS=$NEXT_BUILD_CPUS \
    TOKIO_WORKER_THREADS=$BUILD_THREADS \
    RAYON_NUM_THREADS=$BUILD_THREADS \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_GITHUB_URL=$NEXT_PUBLIC_GITHUB_URL \
    NEXT_PUBLIC_DASHDB_EDITION=$NEXT_PUBLIC_DASHDB_EDITION
RUN pnpm turbo run build --filter=@dashdb/web

# The standalone server does not copy static assets; they go next to it.
RUN cp -r apps/web/public apps/web/.next/standalone/apps/web/public \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

# Per target architecture: keep only that architecture's glibc sharp binaries. (pnpm installs
# the musl builds as well; the runtime is glibc.)
FROM --platform=$BUILDPLATFORM build AS standalone
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) other=arm64 ;; \
      arm64) other=x64 ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && cd apps/web/.next/standalone/node_modules/.pnpm \
 && rm -rf @img+sharp-*linuxmusl* @img+sharp-*linux-"$other"@*

# Distroless: no shell or package manager, runs as uid 65532 (nonroot). Debian 13, like the
# build stage, so sharp's glibc binaries match the runtime.
FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:8ad9cc935b7843c4024b7e1487b5ef472c354ea847b97c667023e2618552607e
LABEL org.opencontainers.image.title="DashDB" \
      org.opencontainers.image.description="Design your database visually. Ship the migration." \
      org.opencontainers.image.source="https://github.com/DashDatabase/dashdb" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080
WORKDIR /app
COPY --from=standalone --chown=nonroot:nonroot /repo/apps/web/.next/standalone ./
USER nonroot
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["apps/web/server.js"]
