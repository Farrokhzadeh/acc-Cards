# Test structure

| Directory | Purpose |
| --- | --- |
| `unit` | Isolated application, configuration, security, and UI checks |
| `contracts` | External provider contracts, fixtures, and operational readiness |
| `flows` | User, admin, provider, messaging, funding, and recovery workflows |
| `integration` | PostgreSQL schema and live database integration checks |
| `fixtures` | Sanitized provider responses used by contract and flow tests |

`npm test` runs every suite that does not require a live PostgreSQL instance. `npm run test:db-integration` runs the live database checks separately.
