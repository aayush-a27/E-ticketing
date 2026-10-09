import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  api,
  createShowRunner,
  createSuperAdmin,
  createUser,
  futureDate,
  layoutPayload,
  seedVenue,
  showPayload,
  signInAs,
} from '../helpers.js';
import { Booking } from '../../src/models/Booking.js';
import { Theater } from '../../src/models/Theater.js';
import { memoryProvider } from '../../src/services/media/providers.js';
import { memoryPaymentProvider } from '../../src/services/payments/providers.js';
import { clearSettingsCache } from '../../src/services/settingsService.js';
import { maskEmail } from '../../src/modules/operations/operations.service.js';
import {
  BOOKING_STATUS,
  ERROR_CODES,
  REFUND_STATUS,
  SHOW_RUNNER_STATUS,
} from '../../src/constants/index.js';

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

beforeEach(() => {
  memoryProvider.__reset();
  memoryPaymentProvider.__reset();
  clearSettingsCache();
});

/**
 * Two venues, each run by a different show runner, each with a published show.
 *
 * Everything in the operations console is about one operator not seeing
 * another's trade, so almost every test here needs a second venue to prove the
 * boundary actually holds.
 */
async function twoVenues() {
  const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
  const adminAgent = await signInAs(admin);

  const runnerA = await createShowRunner({
    email: `runner-a-${unique()}@example.com`,
    businessName: 'Nova Cinemas',
  });
  const runnerB = await createShowRunner({
    email: `runner-b-${unique()}@example.com`,
    businessName: 'Grand Palace',
  });

  const agentA = await signInAs(runnerA);
  const agentB = await signInAs(runnerB);

  const venueA = await seedVenue(adminAgent, { managerId: runnerA.user._id, city: 'Dehradun' });
  const venueB = await seedVenue(adminAgent, { managerId: runnerB.user._id, city: 'Mumbai' });

  const showA = await publishShow(agentA, venueA);
  const showB = await publishShow(agentB, venueB);

  return {
    admin,
    adminAgent,
    runnerA,
    runnerB,
    agentA,
    agentB,
    venueA,
    venueB,
    showA,
    showB,
  };
}

async function publishShow(runnerAgent, venue) {
  const created = await runnerAgent
    .post('/api/v1/show-runner/shows')
    .send(showPayload({ movieId: venue.movieId, screenId: venue.screenId, startAt: futureDate(48) }));
  expect(created.status).toBe(201);
  const showId = created.body.data.show._id;
  const published = await runnerAgent.post(`/api/v1/show-runner/shows/${showId}/publish`).send({});
  expect(published.status).toBe(200);
  return showId;
}

/** A booking left unpaid, sitting in pending_payment. */
async function openBooking(showId, { seatIds = ['A1'], email } = {}) {
  const customer = await createUser({
    email: email ?? `cust-${unique()}@example.com`,
    name: 'Rhea Kapoor',
  });
  const agent = await signInAs(customer);

  const hold = await agent.post('/api/v1/me/seat-holds').send({ showId, seatIds });
  expect(hold.status).toBe(201);
  const booking = await agent
    .post('/api/v1/me/bookings')
    .send({ holdId: hold.body.data.hold.id });
  expect(booking.status).toBe(201);

  return { customer, agent, booking: booking.body.data.booking };
}

/** A booking paid for and confirmed through the normal verified path. */
async function paidBooking(showId, options = {}) {
  const context = await openBooking(showId, options);
  const order = await context.agent
    .post(`/api/v1/me/bookings/${context.booking.id}/payments`)
    .send({});
  const paid = memoryPaymentProvider.__pay(order.body.data.order.orderId);
  const verified = await context.agent
    .post(`/api/v1/me/bookings/${context.booking.id}/payments/verify`)
    .send(paid);
  expect(verified.body.data.booking.status).toBe(BOOKING_STATUS.CONFIRMED);

  return { ...context, orderId: order.body.data.order.orderId, paymentId: paid.paymentId };
}

// ---------------------------------------------------------------------------

describe('operations: who may reach the console', () => {
  const paths = [
    '/api/v1/admin/dashboard',
    '/api/v1/admin/bookings',
    '/api/v1/admin/finance/summary',
    '/api/v1/admin/refunds',
  ];

  it('refuses an unauthenticated caller', async () => {
    for (const path of paths) {
      const response = await api().get(path);
      expect(response.status).toBe(401);
    }
  });

  it('refuses a customer on both namespaces', async () => {
    const customer = await createUser({ email: `c-${unique()}@example.com` });
    const agent = await signInAs(customer);

    for (const path of paths) {
      expect((await agent.get(path)).status).toBe(403);
    }
    expect((await agent.get('/api/v1/show-runner/bookings')).status).toBe(403);
    expect((await agent.get('/api/v1/show-runner/dashboard')).status).toBe(403);
  });

  it('refuses a show runner on the admin namespace', async () => {
    const runner = await createShowRunner({ email: `r-${unique()}@example.com` });
    const agent = await signInAs(runner);
    for (const path of paths) {
      expect((await agent.get(path)).status).toBe(403);
    }
  });

  it('refuses a suspended show runner, who still holds the role', async () => {
    const runner = await createShowRunner({
      email: `r-${unique()}@example.com`,
      status: SHOW_RUNNER_STATUS.SUSPENDED,
    });
    const agent = await signInAs(runner);

    const response = await agent.get('/api/v1/show-runner/bookings');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.SHOW_RUNNER_NOT_ACTIVE);
  });
});

describe('operations: booking visibility is scoped in the query', () => {
  it('shows a super admin both venues and each runner only their own', async () => {
    const ctx = await twoVenues();
    const bookingA = await paidBooking(ctx.showA);
    const bookingB = await paidBooking(ctx.showB);

    const platform = await ctx.adminAgent.get('/api/v1/admin/bookings');
    expect(platform.status).toBe(200);
    const references = platform.body.data.map((row) => row.reference);
    expect(references).toContain(bookingA.booking.reference);
    expect(references).toContain(bookingB.booking.reference);
    expect(platform.body.pagination.total).toBe(2);

    const ownA = await ctx.agentA.get('/api/v1/show-runner/bookings');
    expect(ownA.status).toBe(200);
    expect(ownA.body.pagination.total).toBe(1);
    expect(ownA.body.data[0].reference).toBe(bookingA.booking.reference);

    const ownB = await ctx.agentB.get('/api/v1/show-runner/bookings');
    expect(ownB.body.pagination.total).toBe(1);
    expect(ownB.body.data[0].reference).toBe(bookingB.booking.reference);
  });

  it('refuses a runner who asks for another venue by id', async () => {
    const ctx = await twoVenues();
    await paidBooking(ctx.showB);

    const response = await ctx.agentA.get(
      `/api/v1/show-runner/bookings?theaterId=${ctx.venueB.theaterId}`,
    );
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_THEATER_MANAGER);
  });

  it('still scopes when a runner asks for their own venue by id', async () => {
    const ctx = await twoVenues();
    const bookingA = await paidBooking(ctx.showA);
    await paidBooking(ctx.showB);

    const response = await ctx.agentA.get(
      `/api/v1/show-runner/bookings?theaterId=${ctx.venueA.theaterId}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.data[0].reference).toBe(bookingA.booking.reference);
  });

  it('reports another venue’s booking as not found, by id', async () => {
    const ctx = await twoVenues();
    const bookingB = await paidBooking(ctx.showB);

    const response = await ctx.agentA.get(`/api/v1/show-runner/bookings/${bookingB.booking.id}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODES.BOOKING_NOT_FOUND);

    // The same id is readable by the operator who actually sold it.
    const theirs = await ctx.agentB.get(`/api/v1/show-runner/bookings/${bookingB.booking.id}`);
    expect(theirs.status).toBe(200);
    expect(theirs.body.data.booking.reference).toBe(bookingB.booking.reference);
  });

  it('cannot be widened by a filter the client invents', async () => {
    const ctx = await twoVenues();
    await paidBooking(ctx.showA);
    await paidBooking(ctx.showB);

    // city belongs to the other venue; the theater scope must still win.
    const response = await ctx.agentA.get('/api/v1/show-runner/bookings?city=Mumbai');
    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(0);
  });

  it('shows an approved runner with no venue assigned an empty console', async () => {
    const runner = await createShowRunner({ email: `r-${unique()}@example.com` });
    const agent = await signInAs(runner);

    const bookings = await agent.get('/api/v1/show-runner/bookings');
    expect(bookings.status).toBe(200);
    expect(bookings.body.pagination.total).toBe(0);

    const dashboard = await agent.get('/api/v1/show-runner/dashboard');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.assignedTheaterCount).toBe(0);
    expect(dashboard.body.data.bookings.total).toBe(0);
    expect(dashboard.body.data.finance.collectedPaise).toBe(0);
  });

  it('scopes bookings a runner reaches through a customer filter', async () => {
    const ctx = await twoVenues();
    const shared = `shared-${unique()}@example.com`;
    const atA = await paidBooking(ctx.showA, { email: shared });
    // The same person books at the other venue too.
    const hold = await atA.agent.post('/api/v1/me/seat-holds').send({
      showId: ctx.showB,
      seatIds: ['A2'],
    });
    await atA.agent.post('/api/v1/me/bookings').send({ holdId: hold.body.data.hold.id });

    const asAdmin = await ctx.adminAgent.get(
      `/api/v1/admin/bookings?userId=${atA.customer.user._id}`,
    );
    expect(asAdmin.body.pagination.total).toBe(2);

    const asRunnerA = await ctx.agentA.get(
      `/api/v1/show-runner/bookings?userId=${atA.customer.user._id}`,
    );
    expect(asRunnerA.body.pagination.total).toBe(1);
    expect(asRunnerA.body.data[0].reference).toBe(atA.booking.reference);
  });
});

describe('operations: customer contact details', () => {
  it('gives a platform admin the full address and a runner a masked one', async () => {
    const ctx = await twoVenues();
    const email = `pat-${unique()}@example.com`;
    await paidBooking(ctx.showA, { email });

    const asAdmin = await ctx.adminAgent.get('/api/v1/admin/bookings');
    expect(asAdmin.body.data[0].customer.email).toBe(email);
    expect(asAdmin.body.data[0].customer.emailMasked).toBe(false);

    const asRunner = await ctx.agentA.get('/api/v1/show-runner/bookings');
    const customer = asRunner.body.data[0].customer;
    expect(customer.emailMasked).toBe(true);
    expect(customer.email).not.toBe(email);
    expect(customer.email).toBe(maskEmail(email));
    // The name is kept: a counter needs to identify the person in front of it.
    expect(customer.name).toBe('Rhea Kapoor');
    expect(customer.phone).toBeNull();
  });

  it('masks the local part but keeps the domain readable', () => {
    expect(maskEmail('rhea@example.com')).toBe('r•••@example.com');
    expect(maskEmail('a@example.com')).toBe('a•@example.com');
    // Long local parts are capped rather than echoing their length exactly.
    expect(maskEmail('averyverylongaddress@example.com')).toBe('a••••••••@example.com');
    expect(maskEmail('not-an-email')).toBeNull();
    expect(maskEmail(undefined)).toBeNull();
  });

  it('refuses an email search from a runner instead of ignoring it', async () => {
    const ctx = await twoVenues();
    const email = `pat-${unique()}@example.com`;
    await paidBooking(ctx.showA, { email });

    const refused = await ctx.agentA.get(
      `/api/v1/show-runner/bookings?customerEmail=${encodeURIComponent(email)}`,
    );
    expect(refused.status).toBe(403);

    const allowed = await ctx.adminAgent.get(
      `/api/v1/admin/bookings?customerEmail=${encodeURIComponent(email)}`,
    );
    expect(allowed.status).toBe(200);
    expect(allowed.body.pagination.total).toBe(1);
  });

  it('returns nothing for an email that matches no account', async () => {
    const ctx = await twoVenues();
    await paidBooking(ctx.showA);

    const response = await ctx.adminAgent.get(
      '/api/v1/admin/bookings?customerEmail=nobody@example.com',
    );
    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(0);
  });
});

describe('operations: booking detail', () => {
  it('carries payments, seats and the stored price snapshot', async () => {
    const ctx = await twoVenues();
    const paid = await paidBooking(ctx.showA, { seatIds: ['A1', 'B1'] });

    const response = await ctx.adminAgent.get(`/api/v1/admin/bookings/${paid.booking.id}`);
    expect(response.status).toBe(200);

    const { booking, payments, refunds, cancellations } = response.body.data;
    expect(booking.status).toBe(BOOKING_STATUS.CONFIRMED);
    expect(booking.seats).toHaveLength(2);
    expect(booking.pricing.subtotalPaise).toBeGreaterThan(0);
    expect(booking.amountPaise).toBe(paid.booking.amountPaise);

    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('captured');
    expect(payments[0].signatureVerified).toBe(true);
    expect(refunds).toEqual([]);
    expect(cancellations).toEqual([]);
  });

  it('never returns the ticket token', async () => {
    const ctx = await twoVenues();
    const paid = await paidBooking(ctx.showA);

    const stored = await Booking.findById(paid.booking.id);
    expect(stored.ticketToken).toBeTruthy(); // it does exist

    for (const path of [
      `/api/v1/admin/bookings/${paid.booking.id}`,
      '/api/v1/admin/bookings',
      '/api/v1/admin/dashboard',
    ]) {
      const response = await ctx.adminAgent.get(path);
      expect(JSON.stringify(response.body)).not.toContain(stored.ticketToken);
    }
  });
});

describe('operations: query validation', () => {
  it('rejects an unknown status, a reversed date range and a malformed id', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const agent = await signInAs(admin);

    expect((await agent.get('/api/v1/admin/bookings?status=invented')).status).toBe(400);
    expect((await agent.get('/api/v1/admin/bookings?theaterId=nope')).status).toBe(400);
    expect((await agent.get('/api/v1/admin/bookings/not-an-id')).status).toBe(400);
    expect((await agent.get('/api/v1/admin/refunds?status=invented')).status).toBe(400);

    const reversed = await agent.get(
      '/api/v1/admin/finance/summary?from=2026-06-01&to=2026-01-01',
    );
    expect(reversed.status).toBe(400);
  });

  it('finds a booking by reference, case-insensitively', async () => {
    const ctx = await twoVenues();
    const paid = await paidBooking(ctx.showA);

    const response = await ctx.adminAgent.get(
      `/api/v1/admin/bookings?reference=${paid.booking.reference.toLowerCase()}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.data[0].reference).toBe(paid.booking.reference);
  });
});

describe('operations: finance totals', () => {
  it('counts a captured payment once and excludes an unpaid booking', async () => {
    const ctx = await twoVenues();
    const paid = await paidBooking(ctx.showA, { seatIds: ['A1'] });
    const unpaid = await openBooking(ctx.showA, { seatIds: ['B1'] });

    const response = await ctx.adminAgent.get('/api/v1/admin/finance/summary');
    expect(response.status).toBe(200);
    const summary = response.body.data.summary;

    expect(summary.collected.count).toBe(1);
    expect(summary.collected.amountPaise).toBe(paid.booking.amountPaise);
    expect(summary.netPaise).toBe(paid.booking.amountPaise);

    // The unpaid one is owed, not collected.
    expect(summary.awaitingPayment.count).toBe(1);
    expect(summary.awaitingPayment.amountPaise).toBe(unpaid.booking.amountPaise);
    expect(summary.refunded.amountPaise).toBe(0);
  });

  it('breaks the confirmed total into tickets, fees and tax that add up', async () => {
    const ctx = await twoVenues();
    const paid = await paidBooking(ctx.showA, { seatIds: ['A1', 'B1'] });

    const summary = (await ctx.adminAgent.get('/api/v1/admin/finance/summary')).body.data.summary;
    const confirmed = summary.confirmedBookings;

    expect(confirmed.count).toBe(1);
    expect(confirmed.grossPaise).toBe(paid.booking.amountPaise);
    expect(confirmed.ticketsPaise + confirmed.convenienceFeesPaise + confirmed.taxPaise).toBe(
      paid.booking.amountPaise,
    );

    const taxTotal = summary.taxBreakdown.reduce((sum, row) => sum + row.amountPaise, 0);
    expect(taxTotal).toBe(confirmed.taxPaise);
  });

  it('does not count a repeated gateway webhook twice', async () => {
    const ctx = await twoVenues();
    const paid = await paidBooking(ctx.showA);

    const before = (await ctx.adminAgent.get('/api/v1/admin/finance/summary')).body.data.summary;

    const body = JSON.stringify({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paid.paymentId,
            order_id: paid.orderId,
            amount: paid.booking.amountPaise,
            method: 'upi',
            status: 'captured',
          },
        },
      },
    });

    // The same captured payment arrives again, as a gateway retry would.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await api()
        .post('/api/v1/webhooks/razorpay')
        .set('x-razorpay-signature', memoryPaymentProvider.__signWebhook(body))
        .set('content-type', 'application/json')
        .send(body);
    }

    const after = (await ctx.adminAgent.get('/api/v1/admin/finance/summary')).body.data.summary;
    expect(after.collected.count).toBe(before.collected.count);
    expect(after.collected.amountPaise).toBe(before.collected.amountPaise);
    expect(after.netPaise).toBe(before.netPaise);
  });

  it('subtracts a completed refund once and lists it', async () => {
    const ctx = await twoVenues();
    const paid = await paidBooking(ctx.showA, { seatIds: ['A1', 'B1'] });

    const cancelled = await paid.agent
      .post(`/api/v1/me/bookings/${paid.booking.id}/cancellations`)
      .send({ reason: 'Plans changed' });
    expect(cancelled.status).toBe(200);
    const refundedPaise = cancelled.body.data.refund.amountPaise;
    expect(refundedPaise).toBeGreaterThan(0);

    const summary = (await ctx.adminAgent.get('/api/v1/admin/finance/summary')).body.data.summary;
    expect(summary.collected.amountPaise).toBe(paid.booking.amountPaise);
    expect(summary.refunded.amountPaise + summary.refundsOutstanding.amountPaise).toBe(
      refundedPaise,
    );
    expect(summary.netPaise).toBe(
      summary.collected.amountPaise - summary.refunded.amountPaise,
    );

    const refunds = await ctx.adminAgent.get('/api/v1/admin/refunds');
    expect(refunds.status).toBe(200);
    expect(refunds.body.pagination.total).toBe(1);
    expect(refunds.body.data[0].booking.reference).toBe(paid.booking.reference);
    expect(Object.values(REFUND_STATUS)).toContain(refunds.body.data[0].status);
  });

  it('gives each runner only their own takings', async () => {
    const ctx = await twoVenues();
    const atA = await paidBooking(ctx.showA);
    const atB = await paidBooking(ctx.showB);
    expect(atA.booking.amountPaise).toBeGreaterThan(0);

    const summaryA = (await ctx.agentA.get('/api/v1/show-runner/finance/summary')).body.data
      .summary;
    expect(summaryA.scope).toBe('theaters');
    expect(summaryA.collected.count).toBe(1);
    expect(summaryA.collected.amountPaise).toBe(atA.booking.amountPaise);

    const summaryB = (await ctx.agentB.get('/api/v1/show-runner/finance/summary')).body.data
      .summary;
    expect(summaryB.collected.amountPaise).toBe(atB.booking.amountPaise);

    const platform = (await ctx.adminAgent.get('/api/v1/admin/finance/summary')).body.data.summary;
    expect(platform.scope).toBe('platform');
    expect(platform.collected.amountPaise).toBe(
      atA.booking.amountPaise + atB.booking.amountPaise,
    );
  });

  it('scopes the refund list to the venue that sold the booking', async () => {
    const ctx = await twoVenues();
    const atB = await paidBooking(ctx.showB, { seatIds: ['A1', 'B1'] });
    await atB.agent
      .post(`/api/v1/me/bookings/${atB.booking.id}/cancellations`)
      .send({ reason: 'Plans changed' });

    expect((await ctx.agentA.get('/api/v1/show-runner/refunds')).body.pagination.total).toBe(0);
    expect((await ctx.agentB.get('/api/v1/show-runner/refunds')).body.pagination.total).toBe(1);
    expect((await ctx.adminAgent.get('/api/v1/admin/refunds')).body.pagination.total).toBe(1);
  });

  it('honours a date window', async () => {
    const ctx = await twoVenues();
    await paidBooking(ctx.showA);

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const beyond = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const empty = await ctx.adminAgent.get(
      `/api/v1/admin/finance/summary?from=${future}&to=${beyond}`,
    );
    expect(empty.body.data.summary.collected.count).toBe(0);

    const past = new Date(Date.now() - 86_400_000).toISOString();
    const inside = await ctx.adminAgent.get(`/api/v1/admin/finance/summary?from=${past}`);
    expect(inside.body.data.summary.collected.count).toBe(1);
  });
});

describe('operations: dashboard', () => {
  it('counts bookings by status and reports money from captured payments', async () => {
    const ctx = await twoVenues();
    const paid = await paidBooking(ctx.showA, { seatIds: ['A1'] });
    await openBooking(ctx.showA, { seatIds: ['B1'] });

    const response = await ctx.adminAgent.get('/api/v1/admin/dashboard');
    expect(response.status).toBe(200);
    const data = response.body.data;

    expect(data.scope).toBe('platform');
    expect(data.bookings.total).toBe(2);
    expect(data.bookings.confirmed).toBe(1);
    expect(data.bookings.pendingPayment).toBe(1);
    expect(data.finance.collectedPaise).toBe(paid.booking.amountPaise);
    expect(data.finance.netPaise).toBe(paid.booking.amountPaise);
    expect(data.shows.upcomingPublished).toBe(2);
    expect(data.recentBookings).toHaveLength(2);
    expect(data.trend.series).toHaveLength(14);
    expect(data.trend.series.at(-1).bookings).toBe(1);
  });

  it('scopes a runner’s dashboard to their own venue', async () => {
    const ctx = await twoVenues();
    const atA = await paidBooking(ctx.showA);
    await paidBooking(ctx.showB);

    const data = (await ctx.agentA.get('/api/v1/show-runner/dashboard')).body.data;
    expect(data.scope).toBe('theaters');
    expect(data.assignedTheaterCount).toBe(1);
    expect(data.bookings.total).toBe(1);
    expect(data.finance.collectedPaise).toBe(atA.booking.amountPaise);
    expect(data.shows.upcomingPublished).toBe(1);
    expect(data.theaters.active).toBe(1);
    // Platform counters are not a venue operator's business.
    expect(data.platform).toBeNull();
    expect(data.recentBookings[0].customer.emailMasked).toBe(true);
  });

  it('gives an admin the platform counters a runner does not get', async () => {
    const ctx = await twoVenues();
    const data = (await ctx.adminAgent.get('/api/v1/admin/dashboard')).body.data;

    expect(data.platform).not.toBeNull();
    expect(data.platform.moviesPublished).toBe(2);
    expect(data.platform.theatersTotal).toBe(2);
    expect(data.platform.pendingApplications).toBe(0);
    expect(data.platform.pendingTheaterRequests).toBe(0);
  });
});

describe('operations: seat layouts in the admin namespace', () => {
  it('lets a super admin list, read and activate a layout', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const adminAgent = await signInAs(admin);
    const venue = await seedVenue(adminAgent);

    const list = await adminAgent.get(`/api/v1/admin/screens/${venue.screenId}/layouts`);
    expect(list.status).toBe(200);
    expect(list.body.data.layouts).toHaveLength(1);
    expect(list.body.data.layouts[0].version).toBe(1);

    const one = await adminAgent.get(`/api/v1/admin/screens/${venue.screenId}/layouts/1`);
    expect(one.status).toBe(200);
    expect(one.body.data.layout.seats).toHaveLength(8);

    // A second version, then switch to it.
    const created = await adminAgent
      .post(`/api/v1/admin/screens/${venue.screenId}/layouts`)
      .send(layoutPayload({ activate: false }));
    expect(created.status).toBe(201);
    expect(created.body.data.layout.version).toBe(2);

    const activated = await adminAgent
      .post(`/api/v1/admin/screens/${venue.screenId}/layouts/2/activate`)
      .send({});
    expect(activated.status).toBe(200);
    expect(activated.body.data.layout.version).toBe(2);
  });

  it('refuses a runner reading a layout at a screen they do not manage', async () => {
    const ctx = await twoVenues();
    const response = await ctx.agentA.get(
      `/api/v1/show-runner/screens/${ctx.venueB.screenId}/layouts`,
    );
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_THEATER_MANAGER);
  });

  it('rejects a version that is not a number', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const adminAgent = await signInAs(admin);
    const venue = await seedVenue(adminAgent);

    const response = await adminAgent.get(`/api/v1/admin/screens/${venue.screenId}/layouts/abc`);
    expect(response.status).toBe(400);
  });
});

describe('operations: theater images', () => {
  async function seededAsset(id) {
    return memoryProvider.__seed(`cinereserve/theaters/${id}`);
  }

  it('attaches a verified upload and removes it again', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const adminAgent = await signInAs(admin);
    const venue = await seedVenue(adminAgent);
    const asset = await seededAsset(`shot-${unique()}`);

    const attached = await adminAgent
      .post(`/api/v1/admin/theaters/${venue.theaterId}/images`)
      .send({ publicId: asset.publicId, caption: 'The foyer' });
    expect(attached.status).toBe(201);
    expect(attached.body.data.theater.images).toHaveLength(1);
    expect(attached.body.data.theater.images[0].url).toBe(asset.url);
    expect(attached.body.data.theater.images[0].caption).toBe('The foyer');

    const removed = await adminAgent.delete(
      `/api/v1/admin/theaters/${venue.theaterId}/images?publicId=${encodeURIComponent(asset.publicId)}`,
    );
    expect(removed.status).toBe(200);
    expect(removed.body.data.theater.images).toHaveLength(0);
  });

  it('refuses an id the media provider does not know', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const adminAgent = await signInAs(admin);
    const venue = await seedVenue(adminAgent);

    const response = await adminAgent
      .post(`/api/v1/admin/theaters/${venue.theaterId}/images`)
      .send({ publicId: 'cinereserve/theaters/never-uploaded' });
    expect(response.status).toBe(400);
  });

  it('refuses the same image twice', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const adminAgent = await signInAs(admin);
    const venue = await seedVenue(adminAgent);
    const asset = await seededAsset(`dupe-${unique()}`);

    await adminAgent
      .post(`/api/v1/admin/theaters/${venue.theaterId}/images`)
      .send({ publicId: asset.publicId });
    const again = await adminAgent
      .post(`/api/v1/admin/theaters/${venue.theaterId}/images`)
      .send({ publicId: asset.publicId });
    expect(again.status).toBe(409);
  });

  it('lets a runner illustrate their own venue but not another’s', async () => {
    const ctx = await twoVenues();
    const mine = await seededAsset(`mine-${unique()}`);
    const theirs = await seededAsset(`theirs-${unique()}`);

    const own = await ctx.agentA
      .post(`/api/v1/show-runner/theaters/${ctx.venueA.theaterId}/images`)
      .send({ publicId: mine.publicId });
    expect(own.status).toBe(201);

    const other = await ctx.agentA
      .post(`/api/v1/show-runner/theaters/${ctx.venueB.theaterId}/images`)
      .send({ publicId: theirs.publicId });
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe(ERROR_CODES.NOT_THEATER_MANAGER);

    const stillEmpty = await Theater.findById(ctx.venueB.theaterId);
    expect(stillEmpty.images).toHaveLength(0);
  });

  it('404s removing an image the venue does not have', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const adminAgent = await signInAs(admin);
    const venue = await seedVenue(adminAgent);

    const response = await adminAgent.delete(
      `/api/v1/admin/theaters/${venue.theaterId}/images?publicId=nothing`,
    );
    expect(response.status).toBe(404);
  });

  it('requires a publicId', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const adminAgent = await signInAs(admin);
    const venue = await seedVenue(adminAgent);

    expect(
      (await adminAgent.post(`/api/v1/admin/theaters/${venue.theaterId}/images`).send({})).status,
    ).toBe(400);
    expect(
      (await adminAgent.delete(`/api/v1/admin/theaters/${venue.theaterId}/images`)).status,
    ).toBe(400);
  });
});

describe('operations: show runners and their assignments', () => {
  it('lists each runner with the venues actually assigned to them', async () => {
    const ctx = await twoVenues();
    const unassigned = await createShowRunner({
      email: `idle-${unique()}@example.com`,
      businessName: 'Still Waiting Cinemas',
    });
    expect(unassigned.profile.status).toBe(SHOW_RUNNER_STATUS.ACTIVE);

    const response = await ctx.adminAgent.get('/api/v1/admin/show-runners');
    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(3);

    const byBusiness = Object.fromEntries(
      response.body.data.map((row) => [row.businessName, row]),
    );

    expect(byBusiness['Nova Cinemas'].assignedTheaters).toHaveLength(1);
    expect(byBusiness['Nova Cinemas'].needsTheaterAssignment).toBe(false);
    expect(byBusiness['Nova Cinemas'].assignedTheaters[0].id).toBe(
      String(ctx.venueA.theaterId),
    );

    // Approved is not the same as assigned, and the list must say so.
    expect(byBusiness['Still Waiting Cinemas'].assignedTheaters).toHaveLength(0);
    expect(byBusiness['Still Waiting Cinemas'].needsTheaterAssignment).toBe(true);
  });

  it('filters by whether a venue has been assigned, before paginating', async () => {
    const ctx = await twoVenues();
    await createShowRunner({
      email: `idle-${unique()}@example.com`,
      businessName: 'Still Waiting Cinemas',
    });

    const waiting = await ctx.adminAgent.get('/api/v1/admin/show-runners?assigned=false');
    expect(waiting.status).toBe(200);
    expect(waiting.body.pagination.total).toBe(1);
    expect(waiting.body.data[0].businessName).toBe('Still Waiting Cinemas');

    const operating = await ctx.adminAgent.get('/api/v1/admin/show-runners?assigned=true');
    expect(operating.body.pagination.total).toBe(2);
  });

  it('searches by business name and validates the query', async () => {
    const ctx = await twoVenues();

    const found = await ctx.adminAgent.get('/api/v1/admin/show-runners?search=Nova');
    expect(found.body.pagination.total).toBe(1);
    expect(found.body.data[0].businessName).toBe('Nova Cinemas');

    expect((await ctx.adminAgent.get('/api/v1/admin/show-runners?status=invented')).status).toBe(
      400,
    );
    expect((await ctx.adminAgent.get('/api/v1/admin/show-runners?limit=9999')).status).toBe(400);
  });
});

describe('operations: a customer account in the console', () => {
  it('reports what the account has booked without fetching the bookings', async () => {
    const ctx = await twoVenues();
    const paid = await paidBooking(ctx.showA);

    const response = await ctx.adminAgent.get(
      `/api/v1/admin/users/${paid.customer.user._id}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data.bookingSummary.totalBookings).toBe(1);
    expect(response.body.data.bookingSummary.confirmedBookings).toBe(1);
    expect(response.body.data.bookingSummary.confirmedValuePaise).toBe(
      paid.booking.amountPaise,
    );
    expect(response.body.data.user.email).toBe(paid.customer.user.email);
  });
});

describe('operations: there is no way to mark a booking paid', () => {
  it('offers no write endpoint on a booking', async () => {
    const ctx = await twoVenues();
    const unpaid = await openBooking(ctx.showA);

    // Built as thunks: a supertest request starts as soon as it is created,
    // so an array of live requests sharing one agent cannot be awaited later.
    const attempts = [
      () =>
        ctx.adminAgent
          .patch(`/api/v1/admin/bookings/${unpaid.booking.id}`)
          .send({ status: BOOKING_STATUS.CONFIRMED }),
      () => ctx.adminAgent.post(`/api/v1/admin/bookings/${unpaid.booking.id}/confirm`).send({}),
      () =>
        ctx.adminAgent
          .patch(`/api/v1/admin/bookings/${unpaid.booking.id}/status`)
          .send({ status: BOOKING_STATUS.CONFIRMED }),
      () =>
        ctx.adminAgent
          .post(`/api/v1/admin/bookings/${unpaid.booking.id}/refunds`)
          .send({ amountPaise: 1 }),
      () => ctx.adminAgent.delete(`/api/v1/admin/bookings/${unpaid.booking.id}`),
    ];

    for (const attempt of attempts) {
      const response = await attempt();
      expect([404, 405]).toContain(response.status);
    }

    // And the booking is untouched.
    const stored = await Booking.findById(unpaid.booking.id);
    expect(stored.status).toBe(BOOKING_STATUS.PENDING_PAYMENT);
    expect(stored.ticketToken).toBeFalsy();
  });
});
