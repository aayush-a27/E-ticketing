# CineReserve API

Movie ticketing backend. Express + Mongoose, plain JavaScript (ESM), no TypeScript.

Phase 2 of the rebuild is implemented: configuration, database, authentication,
the three roles, the authorization gates, the organizer application and approval
workflow, audit logging, notifications and the bootstrap/migration scripts.
Catalog, venues, inventory and payments arrive in Phases 3 to 5.

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20+ | Developed on 25.2.1 |
| MongoDB | 6+ | A **replica set** is required for transactions |

Everything here runs on free tooling. There is no paid dependency: notifications
write to the log, rate limiting is in-process, and the test suite runs an
in-memory MongoDB that downloads once and is cached.

### Why a replica set

Multi-document transactions only exist on a replica set. The approval workflow
uses one, and the seat holds in Phase 4 depend on it entirely.

- **MongoDB Atlas** — every tier is a replica set, nothing to configure.
- **Locally** — start mongod with `mongod --replSet rs0 --dbpath <path>` then,
  once, `mongosh --eval "rs.initiate()"`.

On a standalone mongod the server still starts, logs a warning, and runs
multi-document writes without atomicity. That is fine for a first look and not
fine for anything else; Phase 4 operations refuse to run at all.

## Setup

```bash
cd backend
npm install
cp .env.example .env     # then fill in the values
npm run bootstrap:admin  # creates the one super admin
npm run dev
```

The API is then on `http://localhost:4000`, health on `/health`.

### Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `4000` | HTTP port |
| `MONGODB_URI` | **yes** | — | Connection string, replica set |
| `LEGACY_MONGODB_URI` | no | — | Old database, read only by the migration script |
| `JWT_ACCESS_SECRET` | **yes** | — | 32+ chars. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | **yes** | — | 32+ chars, different from the access secret |
| `ACCESS_TOKEN_TTL` | no | `15m` | Access cookie lifetime |
| `REFRESH_TOKEN_TTL` | no | `30d` | Refresh cookie lifetime |
| `BCRYPT_ROUNDS` | no | `12` | 10–15 |
| `COOKIE_DOMAIN` | no | — | Set when the API and frontends share a parent domain |
| `COOKIE_SECURE` | no | `false` | **`true` in production** |
| `COOKIE_SAME_SITE` | no | `lax` | `none` + `COOKIE_SECURE=true` for cross-origin frontends |
| `CORS_ORIGINS` | no | `http://localhost:5173` | Comma-separated allow-list; credentials are sent |
| `RATE_LIMIT_WINDOW_MS` | no | `900000` | Window for all limiters |
| `RATE_LIMIT_PUBLIC_MAX` | no | `300` | Browsing endpoints |
| `RATE_LIMIT_AUTH_MAX` | no | `10` | Login, register, password reset |
| `RATE_LIMIT_SENSITIVE_MAX` | no | `30` | Applications, refresh, password change |
| `NOTIFICATION_TRANSPORT` | no | `console` | `console` \| `noop` |
| `APP_PUBLIC_URL` | no | `http://localhost:5173` | Used to build links in notifications |
| `LOG_LEVEL` | no | `info` | pino level |
| `SUPER_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | no | — | Bootstrap script only; remove after the first run |

Cookies in production: when the frontends are on a different origin than the
API, set `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=none`, and list both
frontend origins in `CORS_ORIGINS`. A browser silently drops a `SameSite=none`
cookie that is not `Secure`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with file watching |
| `npm start` | Start |
| `npm test` | Run the whole suite |
| `npm run test:watch` | Watch mode |
| `npm run bootstrap:admin` | Create the super admin (prompts if env vars are absent) |
| `npm run migrate:users` | Migrate legacy accounts (`--dry-run` to preview) |

## Authentication

An access token (15 min) and a refresh token (30 days) are issued as httpOnly
cookies. The token carries a user id and a token version, nothing else: role,
account status and the show-runner profile are read from the database on every
request. Bumping `tokenVersion` — on logout-all, password change, suspension,
role change or approval — invalidates every token already issued.

A `Bearer` token is also accepted, for the gate-scanner client and for API
tooling.

## Authorization

Four independent checks, all from the database:

1. **Role** — `customer`, `show_runner`, `super_admin`
2. **Account status** — `active`, `suspended`, `deactivated`
3. **Show-runner profile status** — `active`, `suspended`, `revoked`
4. **Resource assignment** — venue ownership (Phase 3)

Approval grants the role. It does not assign a venue: that is a second request
and a second decision. A super admin exists only via `bootstrap:admin`; no
endpoint can create or promote one, and `role` in a registration body is
discarded before any code reads it.

## Endpoints

### Auth — `/api/v1/auth`

| Method | Path | Access |
| --- | --- | --- |
| POST | `/register` | public |
| POST | `/login` | public |
| POST | `/refresh` | refresh cookie |
| POST | `/logout` | public |
| POST | `/forgot-password` | public |
| POST | `/reset-password` | public |
| GET | `/me` | signed in |
| PATCH | `/me` | signed in |
| POST | `/change-password` | signed in |
| POST | `/logout-all` | signed in |

### Organizer applications — `/api/v1/me/organizer-applications`

| Method | Path | Access |
| --- | --- | --- |
| POST | `/` | signed in |
| GET | `/` | signed in (own only) |
| GET | `/:id` | signed in (own only) |
| POST | `/:id/withdraw` | signed in (own, pending only) |

### Show runner — `/api/v1/show-runner`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/profile` | active show runner |

### Admin — `/api/v1/admin`

| Method | Path |
| --- | --- |
| GET | `/organizer-applications` |
| GET | `/organizer-applications/:id` |
| POST | `/organizer-applications/:id/approve` |
| POST | `/organizer-applications/:id/reject` |
| GET | `/users` |
| GET | `/users/:id` |
| PATCH | `/users/:id/status` |
| GET | `/show-runners` |
| PATCH | `/show-runners/:id/status` |
| GET | `/audit-logs` |

All of these require `super_admin`.

### Response shapes

Success is `{ "data": ... }`; a list adds `{ "pagination": {...} }`. Errors are:

```json
{ "error": { "code": "SEATS_UNAVAILABLE", "message": "...", "requestId": "..." } }
```

Branch on `code`, never on `message`. Codes are listed in
`src/constants/index.js`.

## Rate limiting

`express-rate-limit` with an **in-memory store**. Counters live in one process
and are not shared, so running two instances doubles every effective limit. A
shared store (Redis or a Mongo-backed store) is required before scaling
horizontally — deliberately not added yet, to keep the project free to run.

Rate limiting sits on top of authentication, authorization, idempotency keys and
database constraints. It is never the thing keeping data correct.

## Migrating from the legacy database

```bash
node scripts/migrateLegacyUsers.js --dry-run
node scripts/migrateLegacyUsers.js
```

Accounts carry over with their bcrypt hashes intact, so existing passwords keep
working. Legacy bookings are **not** converted: they name a movie, a theater and
a showtime string that match no show, screen or seat in the new schema and have
no price or payment record. They are copied into a read-only `legacy_bookings`
collection so history can still display them.

## Testing

```bash
npm test
```

`mongodb-memory-server` runs a real single-node replica set, so transactions
behave as they do on Atlas. `tests/integration/transactions.test.js` fails the
run if transactions are not actually available, which stops the concurrency
tests from passing against a weaker setup than they claim to test.
