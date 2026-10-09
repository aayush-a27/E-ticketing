# CineReserve

A movie ticketing platform: catalogue and venue administration, concurrency-safe
seat booking, verified payments, QR tickets at the gate, and refunds under a
configurable cancellation policy.

One repository, three applications and one API.

| Directory | What it is | Port |
| --- | --- | --- |
| [backend/](backend/) | The API. Express 4, Mongoose 8, ESM, zod, pino. | 4000 |
| [customer/](customer/) | The public booking site. React 19 + Vite + Tailwind 4. | 5173 |
| [admin/](admin/) | The operations console, for administrators and show runners. | 5175 |
| `frontend/` | The original learning-stage app. Superseded, nothing references it. | — |

Each application has its own README with the detail; this page is only the map.

## Running the whole thing

Nothing here needs a paid service. Payments, image storage and notifications
all have local providers, and the development database runs in memory.

```bash
# install
cd backend  && npm install
cd customer && npm install
cd admin    && npm install
```

Seat holds and bookings use MongoDB transactions, which need a replica set.
`npm run dev:db` gives you one without installing MongoDB:

```bash
# terminal 1 — a throwaway in-memory replica set
cd backend && npm run dev:db
# copy the MONGODB_URI it prints into backend/.env

# terminal 2 — the API
cd backend && npm run dev                      # http://localhost:4000

# first run only — an administrator account, then a demo catalogue
cd backend && npm run bootstrap:admin
cd backend && npm run dev:seed

# terminal 3 — the customer site
cd customer && npm run dev                     # http://localhost:5173

# terminal 4 — the operations console
cd admin && npm run dev                        # http://localhost:5175
```

`npm run bootstrap:admin` is the only way a `super_admin` account comes into
existence. No HTTP endpoint creates one, so no request can escalate to it.

Data in the in-memory replica set is gone when you stop it. For anything you
want to keep, point `MONGODB_URI` at a real MongoDB deployment — it must be a
replica set, not a standalone server.

## Tests

```bash
cd backend && npm test
```

The suite boots its own in-memory replica set, so transactions behave as they
do in production. No external service, no cost.

## The three roles

| Role | Can |
| --- | --- |
| `customer` | Browse, book, pay, cancel, view tickets. No console. |
| `show_runner` | Manage the theaters **explicitly assigned** to them, and nothing else. |
| `super_admin` | Everything, platform-wide. |

Becoming a show runner takes two separate grants: an application a super admin
approves, and then a theater assignment. Approval alone grants no access to any
venue — that separation is enforced in the API, not just in the interface.

## Security

Read [backend/README.md](backend/README.md) for the full account. In short: the
session is an httpOnly cookie and no frontend ever sees a token; roles and
account status are re-read from the database on every request; prices, booking
state and payment state are server-decided and never accepted from a client;
and no endpoint can mark a booking paid without a verified gateway signature.

> **Credential rotation still outstanding.** Earlier commits in this
> repository's history contain a hardcoded SerpAPI key and TMDB key (in a
> since-deleted `backend/app.js`) and a `JWT_SECRET` and `RAZORPAY_KEY_SECRET`
> (in a since-untracked `backend/.env`). Nothing is exposed in the current
> working tree, but the blobs remain reachable in history. Those five
> credentials must be revoked and reissued at their source; removing the files
> does not undo the exposure.
