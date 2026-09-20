# Database runtime

PostgreSQL is the authoritative AccAbad store.

- Pool: `server/database/pool.ts`
- SQL authority: `db/migrations/`
- Repository implementations: `server/repositories/postgres.ts`
- Admin authentication/security: `server/auth/`
- Secret encryption: `server/security/crypto.ts`

All admin-facing `/api/v1` data routes now require an authenticated server-side admin session and appropriate RBAC permission. The temporary Phase 3 unauthenticated API flag has been removed.
