# CineReserve — customer app

The customer-facing booking experience. React 19 + Vite + Tailwind 4, plain
JavaScript and JSX.

Every page reads from the CineReserve API. There is no fixture data, no
invented metadata and no simulated payment success anywhere in this app.

## Running it

You need the backend, and the backend needs a MongoDB replica set because seat
holds use transactions.

```bash
# terminal 1 — a throwaway replica set (no MongoDB install needed)
cd backend && npm run dev:db

# terminal 2 — the API, pointed at the URI the first terminal printed
cd backend && npm run dev

# first run only: an admin account and a demo catalogue
cd backend && npm run bootstrap:admin && npm run dev:seed

# terminal 3 — this app
cd customer && npm run dev
```

Then open the address Vite prints (http://localhost:5173 unless that port is
taken).

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | empty | Leave empty in development: Vite proxies `/api` to `localhost:4000`, which keeps the session cookie same-origin. Set the full API origin in production. |

Everything in a `VITE_` variable is visible in the browser, so none of them may
hold a secret. The Razorpay key this app uses is the publishable one, and it
arrives from the API per booking rather than being configured here.

## Routes

| Route | What it does | Auth |
| --- | --- | --- |
| `/` | Hero, featured and latest movies, shows in your city | — |
| `/movies` | Grid with search, genre/language/certification filters, sorting, pagination | — |
| `/movies/:slug` | Details, cast, trailer, and that film's showtimes by date | — |
| `/shows` | Browse by city, date and format, grouped by venue | — |
| `/shows/:showId/seats` | Live seat map, selection, and acquiring the hold | — to browse |
| `/login` · `/register` | Session, with the intended destination preserved | — |
| `/checkout` | Price breakdown, countdown, Razorpay | required |
| `/bookings/:bookingId/ticket` | QR ticket, print-friendly | required |
| `/my-bookings` | Upcoming and past, cancellation, refund status | required |
| `/profile` | Details, preferred city, password | required |

Filters and the selected date live in the URL, so a filtered view is shareable
and survives a refresh.

## How correctness is kept

**Sessions.** The JWT is an httpOnly cookie the browser sends on its own. This
app never reads, stores or even sees a token — `localStorage` holds only the
chosen city. On startup it asks `/auth/me` who it is talking to, and protected
routes wait for that answer rather than redirecting mid-check.

**Money.** Every figure, including the total, comes from the server. The client
formats paise into rupees and adds nothing up. The one place it sums anything
is the "before fees" preview on the seat map, which is labelled as such.

**Seats.** Availability is re-read every 15 seconds while the tab is visible,
and any seat someone else takes is dropped from your selection with a notice.
The hold is acquired by the server; a `409` is surfaced as *"One or more
selected seats are no longer available."* The countdown is derived from the
server's `expiresAt`, so a sleeping tab cannot drift, and it never extends or
releases a hold on its own — when it reaches zero, checkout stops.

**Payment.** The browser's success callback proves nothing: it is passed to the
server, which checks the signature and decides. A booking is confirmed only
when the server says so. Double submission is guarded both by an in-flight ref
and by an `Idempotency-Key` on every unsafe POST. If payment lands after the
hold expired, the backend's actual reconciliation result is shown — including
that a refund has been started.

**Refreshes.** Checkout rebuilds itself from the hold id in the URL. Nothing
essential is carried in router state, so a refresh or a shared link behaves
exactly like arriving fresh.

## Design

Midnight and charcoal surfaces, ivory for reading, a single amber accent.
Fraunces for display, Inter for everything else.

Neumorphism is confined to controls that should feel pressable — the search
field, filter chips, seats, segmented controls — and every neumorphic surface
keeps a real border so it survives a high-contrast setting. The focus ring is
never replaced by it.

The golden ratio is used where proportion is visible: the hero split, the movie
detail columns, the checkout layout, the footer. It is deliberately not applied
to card sizes or spacing, where it would be arithmetic rather than design.

Accessibility: semantic landmarks, a skip link, focus trapped in dialogs and
returned on close, `aria-live` on results and the countdown, labelled icons,
and `prefers-reduced-motion` honoured globally.

## If payments are not configured

With `PAYMENT_PROVIDER=memory` the backend simulates the gateway for its own
tests. Checkout detects this and says so plainly rather than pretending a
payment can be taken. To complete a real booking, set `PAYMENT_PROVIDER=razorpay`
with Razorpay **test** keys on the backend — they are free.
