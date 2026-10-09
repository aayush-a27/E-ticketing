# CineReserve — operations console

The internal console for platform administrators and show runners. React 19 +
Vite + Tailwind 4, plain JavaScript and JSX.

Every figure on every page comes from the CineReserve API. There is no fixture
data in this app, and no page fakes a number when an endpoint has nothing to
give — an empty platform shows zeros and says why.

## Running it

The console needs the backend, and the backend needs a MongoDB replica set
because seat holds use transactions.

```bash
# terminal 1 — a throwaway replica set (no MongoDB install needed)
cd backend && npm run dev:db
# copy the MONGODB_URI it prints into backend/.env

# terminal 2 — the API
cd backend && npm run dev

# first run only: an administrator account, then a demo catalogue
cd backend && npm run bootstrap:admin
cd backend && npm run dev:seed

# terminal 3 — this app
cd admin && npm run dev
```

Vite serves it at **http://localhost:5175** (the customer app uses 5173).

`npm run bootstrap:admin` is the only way a `super_admin` account comes into
existence. There is no HTTP endpoint that creates one, and nothing in this app
can grant a role.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | empty | Leave empty in development: Vite proxies `/api` to `localhost:4000`, which keeps the session cookie same-origin. Set the full API origin in production, and add this app's origin to the backend's `CORS_ORIGINS`. |

Everything in a `VITE_` variable is visible in the browser, so none of them may
hold a secret. There are no provider keys here: Cloudinary uploads use a
signature the server issues per upload, and the API secret never leaves the
backend.

## Who can sign in

Three roles exist; two of them have a console.

| Role | What they get |
| --- | --- |
| `super_admin` | Everything, platform-wide. Customer contact details in full. |
| `show_runner` | Only the theaters explicitly assigned to them. Customer email addresses masked. |
| `customer` | No console. Signing in here lands on `/no-access`, which explains why. |

**Approval and venue assignment are separate grants.** An approved show runner
with no theater assigned sees an empty dashboard and a notice saying so, rather
than a wall of unexplained zeros.

## Routes

| Route | What it does | Who |
| --- | --- | --- |
| `/login` | Sign in, preserving the page you were heading for | — |
| `/` | Dashboard: bookings, money, upcoming shows, 14-day trend | both roles |
| `/no-access` | Why this account has no console | — |

The sidebar grows as sections are built. Items whose pages do not exist yet are
left out of the menu entirely rather than shown as dead links, so nothing in
the navigation leads somewhere that does not work. See `src/utils/nav.js`.

## How correctness is kept

**Sessions.** The JWT is an httpOnly cookie the browser sends on its own. This
app never reads, stores or sees a token; `localStorage` holds one thing, whether
the sidebar is collapsed. On startup it asks `/auth/me` who it is talking to,
and protected routes wait for that answer rather than redirecting mid-check.

**Authorization.** The role in this app chooses what to render and which API
namespace to call. It is never what grants access. Every endpoint re-reads the
role, the account status, the show-runner profile status and the venue
assignment from the database on each request. Editing `user.role` in devtools
changes the menu and nothing else — the API still refuses.

**Venue scoping.** A show runner's queries are filtered server-side with
`theaterId: { $in: theirAssignedVenues }`. A `theaterId` in a request is
intersected with that set, never substituted for it, so changing an id in a URL
produces a refusal rather than another venue's data.

**Money.** Every figure arrives as an integer number of paise and is only ever
divided for display. Nothing in this app adds two amounts together. The
distinction the dashboard keeps is between *collected* — captured payments,
which exist only after the server has verified a gateway signature — and
*booked value*, which is what bookings said they cost. The trend chart is
labelled booked value for exactly that reason.

**Payment state is read-only.** There is no endpoint that marks a booking paid
or confirmed, and no screen here offers it. Confirmation requires a verified
gateway signature; refunds follow the configured cancellation policy. An
administrator cannot shortcut either.

**Stale responses.** `useResource` aborts an in-flight request when its inputs
change and carries a sequence number, so a slow earlier response can never
overwrite a newer one. That matters on filtered tables, where typing fires
several requests and the first to return is often not the one you want.

## Design

A dark navigation rail against a light working area — a tool someone reads for
a whole shift, not a cinema foyer. Amber is the only brand colour and appears
in three places: the active nav rail, the focus ring and primary brand actions.

Status colours are mapped once, in `src/components/ui/Badge.jsx`, so
"confirmed" is never green on one screen and grey on another. Figures use
tabular numerals so columns line up.

Accessibility: one focus treatment that is never removed, labelled icon
buttons, `aria-live` regions mounted before the first toast lands, focus
trapped in dialogs and returned on close, clickable table rows operable by
keyboard, and `prefers-reduced-motion` honoured globally.
