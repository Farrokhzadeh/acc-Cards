# Phase 1 — Repository and Production Baseline

Status: implementation complete; clean dependency/build verification must be run on a machine with working npm registry access.

## Completed

- Preserved the AccAbad Admin v3 UI baseline.
- Removed bundled `node_modules`, `.sites-runtime`, generated build output, TypeScript cache, and prototype hosting artifacts.
- Standardized the Node runtime at Node 22.13.1 for Docker/CI.
- Replaced prototype-specific build wrappers with normal `vite` / `vinext` scripts.
- Added `.env.example` and typed runtime environment validation.
- Added an explicit safety gate for live provider writes; writes are disabled by default.
- Added `/health` and `/ready` endpoints.
- Hardened the Docker container with non-root execution, a read-only root filesystem, tmpfs, and health checks.
- Added GitHub Actions CI for install, env validation, lint, typecheck, tests, and build.
- Removed the Cloudflare D1 placeholder database plumbing. PostgreSQL begins in Phase 2.

## Production startup safety

`ENABLE_LIVE_PROVIDER_WRITES` defaults to `false`.

If it is ever deliberately enabled later, startup also requires:

```text
LIVE_PROVIDER_WRITE_CONFIRMATION=ACCABAD_LIVE_WRITES_ENABLED
```

This is only a safety switch; real provider writes are not implemented in Phase 1.

## Local/Docker setup

```bash
cp .env.example .env
# Edit APP_BASE_URL for your deployment.
docker compose up -d --build
```

Health checks:

```text
GET /health
GET /ready
```

## Next phase

Phase 2 introduces PostgreSQL, migrations, constraints, backups, and the authoritative data layer.


## Validation note

The repository and lockfile were validated offline, but this packaging environment could not complete `npm ci` because dependency tarball downloads timed out. The definitive Phase 1 acceptance command on the deployment/dev machine is:

```bash
npm ci --no-audit --no-fund
npm run verify
docker compose build
```

Do not promote the package to staging until those commands pass.
