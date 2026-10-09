# CineReserve API

Movie ticketing backend. Express + Mongoose, plain JavaScript (ESM), no TypeScript.

Phases 2 and 3 of the rebuild are implemented:

- **Phase 2** — configuration, database, authentication, the three roles, the
  authorization gates, the organizer application and approval workflow, audit
  logging, notifications, and the bootstrap/migration scripts.
- **Phase 3** — the movie catalog with signed image uploads, theaters, venue
  assignment, screens, versioned seat layouts, show scheduling with overlap
  prevention, and server-side pricing with configurable fees and tax.

Seat inventory and holds (Phase 4) and payments and bookings (Phase 5) are not
built yet.

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
| `MEDIA_PROVIDER` | no | `memory` | `memory` (no account needed) \| `cloudinary` |
| `PAYMENT_PROVIDER` | no | `memory` | `memory` (simulated, free) \| `razorpay` |
| `RAZORPAY_KEY_ID` | only for razorpay | — | Publishable; safe to send to a browser |
| `RAZORPAY_KEY_SECRET` | only for razorpay | — | Never leaves the server |
| `RAZORPAY_WEBHOOK_SECRET` | only for razorpay | — | From the dashboard's webhook settings |
| `TICKET_TOKEN_SECRET` | **yes** | — | 32+ chars, different from the JWT secrets |
| `SEAT_HOLD_SWEEP_INTERVAL_MS` | no | `30000` | How often lapsed holds are swept |
| `RECONCILE_INTERVAL_MS` | no | `60000` | Abandoned bookings, refunds, notifications |
| `CLOUDINARY_CLOUD_NAME` | only for cloudinary | — | From the Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | only for cloudinary | — | From the Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | only for cloudinary | — | Never sent to a browser |
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

### Public catalog and browsing — no authentication

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/movies` | Published movies; filter by `genre`, `language`, `certification`, `featured`, `search` |
| GET | `/movies/:slug` | One published movie |
| GET | `/cities` | Cities with at least one active theater |
| GET | `/theaters` | Active theaters; filter by `city` |
| GET | `/shows` | Upcoming published shows; filter by `city`, `movieId`, `theaterId`, `date`, `language`, `format` |
| GET | `/shows/:id` | One published show |
| GET | `/shows/:id/seats` | Seat map for that show's layout version, with per-category prices |
| POST | `/shows/:id/price-quote` | Server-computed total for a set of seat ids |

### Show runner — `/api/v1/show-runner`

Requires an active show-runner profile. Every route that names a venue also
checks that this user manages it.

| Method | Path |
| --- | --- |
| GET | `/profile` |
| GET | `/theaters` · `/theaters/:theaterId` |
| PATCH | `/theaters/:theaterId` |
| POST | `/theater-requests` · GET `/theater-requests` |
| GET / POST | `/theaters/:theaterId/screens` |
| PATCH | `/screens/:screenId` |
| GET / POST | `/screens/:screenId/layouts` |
| GET | `/screens/:screenId/layouts/:version` |
| POST | `/screens/:screenId/layouts/:version/activate` |
| POST | `/theaters/:theaterId/images` · DELETE `/theaters/:theaterId/images?publicId=` |
| GET / POST | `/shows` |
| GET / PATCH | `/shows/:id` |
| POST | `/shows/:id/publish` · `/shows/:id/cancel` |
| GET | `/shows/:showId/inventory` · `/shows/:showId/seats` |
| POST | `/shows/:showId/seats/:seatId/block` · `/unblock` |
| GET | `/dashboard` |
| GET | `/bookings` · `/bookings/:id` |
| GET | `/finance/summary` · `/refunds` |

The last four rows are read-only and scoped to this runner's assigned venues
in the database query rather than afterwards. Customer email addresses come
back masked, and a runner with no venue assigned yet sees an empty console.

### Admin — `/api/v1/admin`

All of these require `super_admin` and are not scoped to any venue.

| Method | Path |
| --- | --- |
| GET | `/organizer-applications` · `/organizer-applications/:id` |
| POST | `/organizer-applications/:id/approve` · `/reject` |
| GET | `/users` · `/users/:id` · PATCH `/users/:id/status` |
| GET | `/show-runners` · PATCH `/show-runners/:id/status` |
| GET | `/audit-logs` |
| GET / POST | `/movies` · GET/PATCH `/movies/:id` |
| POST | `/movies/:id/publish` · `/unpublish` · `/archive` · `/media` |
| DELETE | `/movies/:id/media/:kind` |
| POST | `/uploads/signature` |
| GET / POST | `/theaters` · GET/PATCH `/theaters/:theaterId` |
| POST | `/theaters/:theaterId/managers` · DELETE `/theaters/:theaterId/managers/:id` |
| GET | `/theater-requests` · POST `/theater-requests/:id/approve` · `/reject` |
| GET / POST | `/theaters/:theaterId/screens` · PATCH `/screens/:screenId` |
| GET / POST | `/screens/:screenId/layouts` |
| GET | `/screens/:screenId/layouts/:version` |
| POST | `/screens/:screenId/layouts/:version/activate` |
| POST | `/theaters/:theaterId/images` · DELETE `/theaters/:theaterId/images?publicId=` |
| GET / POST | `/shows` · GET/PATCH `/shows/:id` · POST `/shows/:id/publish` · `/cancel` |
| GET | `/shows/:showId/inventory` · `/shows/:showId/seats` |
| POST | `/shows/:showId/seats/:seatId/block` · `/unblock` |
| GET | `/settings` · PATCH `/settings` |
| GET | `/dashboard` |
| GET | `/bookings` · `/bookings/:id` |
| GET | `/finance/summary` · `/refunds` |

#### The operations endpoints only read

`/dashboard`, `/bookings`, `/finance/summary` and `/refunds` exist in both
namespaces. Nothing there writes. There is deliberately no endpoint that sets
a booking's status or payment status, and none that starts a refund from a
console: confirming a booking requires a gateway signature the server has
checked, and refunds follow the configured cancellation policy. An
administrator cannot shortcut either.

Money is reported from the records that prove it. Collected totals come from
captured payment attempts; refunds come from the `Refund` collection alone,
because `Payment.refundedPaise` tracks the same rupees for reconciliation and
adding both would double them. A repeated gateway webhook cannot inflate
either figure, since `providerPaymentId` and `providerRefundId` are uniquely
indexed. Attempts that merely reached the gateway are reported separately and
are never counted as revenue.
| GET / PATCH | `/settings` |

## Catalog, venues and scheduling

**Movies** belong to the platform. The super admin writes them; show runners
schedule published ones and cannot create or publish catalog records.
Publishing requires a poster, synopsis, languages, runtime and certification.

**Images** use signed direct upload. The server issues a signature scoped to one
folder and public id, the browser uploads straight to the provider, and the
resource's media endpoint then asks the provider whether that asset really
exists before storing anything. The API secret never reaches a browser and no
file passes through this process. With `MEDIA_PROVIDER=memory` the same flow
runs against an in-process store, so nothing here needs an account to develop
against.

**Theaters** are created and assigned by the super admin. A show runner cannot
create one; they request access, and approval adds them to the theater's
`managers`, which is what gate 4 checks.

**Seat layouts are versioned, never edited.** A change creates a new version;
the old one is retired but kept, because every show pins the version it was
scheduled with. Switching the active version is refused while upcoming
published shows still use the current one.

**Shows** cannot overlap on a screen. The occupied window is the film's runtime
plus a cleanup gap (15 minutes by default), and a new show whose window
intersects an existing one is rejected with `SHOW_OVERLAP`. Cancelled shows
free their slot. Once a seat is sold, start time, price, format and language are
frozen; only the booking window can still move.

## Pricing

Every amount is an integer number of paise and is computed on the server from
the show's own price table plus `PlatformSettings`. The client sends seat ids
and receives a breakdown; it never sends an amount.

Configurable through `PATCH /api/v1/admin/settings`:

- **Fees** — a percentage of the ticket subtotal plus a flat amount per ticket,
  with an optional per-booking cap.
- **Tax** — a list of named components, each with its own rate, threshold and
  whether it applies to tickets, fees or both. The threshold is tested per
  ticket, which is how India's price-banded GST actually works, so a basket of
  cheap tickets is not taxed just because it sums past the band.
- **Cancellation** — a grace window after booking plus refund rules by hours
  before showtime. Stored and evaluated as data; Phase 5 applies them.

A show must price every seat category its layout contains, and may not price one
it does not — otherwise a customer could select a seat the server cannot price.

### Response shapes

Success is `{ "data": ... }`; a list adds `{ "pagination": {...} }`. Errors are:

```json
{ "error": { "code": "SEATS_UNAVAILABLE", "message": "...", "requestId": "..." } }
```

Branch on `code`, never on `message`. Codes are listed in
`src/constants/index.js`.

## Booking, payment and tickets

The path a customer walks, and what guards each step:

```
POST /api/v1/me/seat-holds                     take seats   (Idempotency-Key)
POST /api/v1/me/bookings                       open a booking against the hold
POST /api/v1/me/bookings/:id/payments          create a gateway order
POST /api/v1/me/bookings/:id/payments/verify   verify the signature
GET  /api/v1/me/bookings/:id/ticket            QR ticket, once confirmed
```

**The amount is never sent by the client.** It comes from the hold's price
snapshot, which the server computed from the show's own price table. The
browser's callback is treated as a hint; the signature check is the evidence.

**One confirming transition.** Both the browser verification call and the
webhook route into the same service, so a duplicate finds the booking already
confirmed and does nothing. Confirmation converts the hold, marks the seats
booked, captures the payment and issues the ticket in one transaction.

**Payment that lands after the hold expired** is never confirmed over whoever
holds the seats now. The booking becomes `unfulfillable` and the money is
queued for return.

### Webhooks

`POST /api/v1/webhooks/razorpay` is mounted *before* the JSON body parser,
because the signature is computed over the exact bytes the gateway sent.
Parsing and reserializing would break every signature.

Duplicates are handled by a unique index on `(provider, eventId)`: the event is
stored before it is acted on, so a gateway that retries loses the race and the
second delivery is a no-op. The endpoint returns 200 for duplicates so the
gateway stops retrying.

### Tickets

The QR encodes an opaque token — `<bookingId>.<nonce>.<hmac>` — carrying no
name, email or seat list, so a photographed ticket reveals nothing and cannot
be altered into another booking's. `POST /api/v1/tickets/validate` admits once,
using a conditional update, so two scanners reading the same code cannot both
let someone in. Staff may only admit at venues they manage.

### Cancellations and refunds

Cancelling and refunding are separate: cancelling releases seats and settles
entitlement inside a transaction; the money moves afterwards, so a gateway
failure cannot reverse a cancellation the customer has already been shown.
Partial cancellation is supported — the remaining seats keep a valid ticket.

Refund amounts come from the configurable policy in `PlatformSettings`: a grace
window measured from booking time, then rules by hours before showtime.
Nothing is hardcoded. Financial history is never deleted.

## Background jobs

| Job | Interval | Does |
| --- | --- | --- |
| Seat hold sweep | `SEAT_HOLD_SWEEP_INTERVAL_MS` | Returns lapsed holds to the pool |
| Reconciliation | `RECONCILE_INTERVAL_MS` | Expires abandoned bookings, retries pending refunds, flushes the notification outbox |

Both are safe to run on every instance and safe to run late: each operation is
guarded so a delayed pass matches nothing once the data has moved on. The seat
sweep is housekeeping, not the mechanism — an expired hold is already claimable,
because the acquisition filter reclaims it on sight.

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
