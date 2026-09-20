// AccAbad's authoritative PostgreSQL schema is managed by versioned SQL files
// under db/migrations/. Runtime access is provided by server/database/pool.ts
// and repository implementations under server/repositories/.
export const schemaAuthority = "db/migrations" as const;
