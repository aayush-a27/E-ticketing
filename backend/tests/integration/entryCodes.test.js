import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import {
  createShowRunner,
  createSuperAdmin,
  createUser,
  futureDate,
  seedVenue,
  showPayload,
  signInAs,
  startShowSoon,
} from '../helpers.js';
import { Booking } from '../../src/models/Booking.js';
import { Refund } from '../../src/models/Refund.js';
import { SeatHold } from '../../src/models/SeatHold.js';
import { memoryProvider } from '../../src/services/media/providers.js';
import { memoryPaymentProvider } from '../../src/services/payments/providers.js';
import { clearSettingsCache } from '../../src/services/settingsService.js';
import { normalizeEntryCode } from '../../src/services/ticketService.js';
import { BOOKING_STATUS, ERROR_CODES } from '../../src/constants/index.js';

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

beforeEach(() => {
  memoryProvider.__reset();
  memoryPaymentProvider.__reset();
  clearSettingsCache();
});

/** A venue with a published show two days out, and its operator. */
async function venueWithShow() {
  const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
  const adminAgent = await signInAs(admin);
  const runner = await createShowRunner({ email: `runner-${unique()}@example.com` });
  const runnerAgent = await signInAs(runner);
  const venue = await seedVenue(adminAgent, { managerId: runner.user._id });
  const created = await runnerAgent
    .post('/api/v1/show-runner/shows')
    .send(showPayload({ movieId: venue.movieId, screenId: venue.screenId, startAt: futureDate(48) }));
  const showId = created.body.data.show._id;
  await runnerAgent.post(`/api/v1/show-runner/shows/${showId}/publish`).send({});
  return { adminAgent, runnerAgent, showId };
}

/** A booking with a payment order open but not yet paid. */
async function unpaidBooking(showId, seatIds = ['A1', 'B1']) {
  const customer = await createUser({ email: `cust-${unique()}@example.com` });
  const agent = await signInAs(customer);
  const hold = await agent.post('/api/v1/me/seat-holds').send({ showId, seatIds });
  const booking = await agent.post('/api/v1/me/bookings').send({ holdId: hold.body.data.hold.id });
  const bookingId = booking.body.data.booking.id;
  const order = await agent.post(`/api/v1/me/bookings/${bookingId}/payments`).send({});
  return {
    agent,
    bookingId,
    amountPaise: booking.body.data.booking.amountPaise,
    orderId: order.body.data.order.orderId,
    holdId: hold.body.data.hold.id,
  };
}

async function paidBooking(showId, seatIds) {
  const context = await unpaidBooking(showId, seatIds);
  const paid = memoryPaymentProvider.__pay(context.orderId);
  const verified = await context.agent
    .post(`/api/v1/me/bookings/${context.bookingId}/payments/verify`)
    .send(paid);
  expect(verified.body.data.booking.status).toBe(BOOKING_STATUS.CONFIRMED);
  const ticket = await context.agent.get(`/api/v1/me/bookings/${context.bookingId}/ticket`);
  return { ...context, ticket: ticket.body.data.ticket };
}

// ---------------------------------------------------------------------------

describe('entry codes', () => {
  it('comes with every ticket, short and unambiguous', async () => {
    const { showId } = await venueWithShow();
    const { ticket } = await paidBooking(showId);

    expect(ticket.entryCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);
    expect(ticket.entryCode).not.toMatch(/[01ILO]/);
    expect(ticket.token.length).toBeGreaterThan(100);
  });

  it('admits at the gate typed any way, once', async () => {
    const { runnerAgent, showId } = await venueWithShow();
    const { bookingId, ticket } = await paidBooking(showId);
    await startShowSoon(bookingId);

    // Lower case, no hyphen, stray spaces: how people actually type.
    const typed = ` ${ticket.entryCode.replace('-', '').toLowerCase()} `;
    const first = await runnerAgent.post('/api/v1/tickets/validate').send({ code: typed });
    expect(first.status).toBe(200);
    expect(first.body.data.seats).toEqual(['A1', 'B1']);

    // The same ticket by QR afterwards is refused: code and QR are one ticket.
    const viaQr = await runnerAgent.post('/api/v1/tickets/validate').send({ token: ticket.token });
    expect(viaQr.status).toBe(409);
    expect(viaQr.body.error.code).toBe(ERROR_CODES.TICKET_ALREADY_USED);

    const again = await runnerAgent.post('/api/v1/tickets/validate').send({ code: ticket.entryCode });
    expect(again.status).toBe(409);
  });

  it('obeys the same entry window as the QR', async () => {
    const { runnerAgent, showId } = await venueWithShow();
    const { bookingId, ticket } = await paidBooking(showId);

    const early = await runnerAgent.post('/api/v1/tickets/validate').send({ code: ticket.entryCode });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('TICKET_NOT_YET_VALID');
    expect((await Booking.findById(bookingId)).admittedAt ?? null).toBeNull();
  });

  it('is refused at a venue the staff member does not manage', async () => {
    const { showId } = await venueWithShow();
    const { bookingId, ticket } = await paidBooking(showId);
    await startShowSoon(bookingId);

    const outsider = await signInAs(await createShowRunner({ email: `o-${unique()}@example.com` }));
    const response = await outsider.post('/api/v1/tickets/validate').send({ code: ticket.entryCode });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_THEATER_MANAGER);
  });

  it('refuses an unknown or malformed code, and both kinds at once', async () => {
    const { runnerAgent } = await venueWithShow();

    const unknown = await runnerAgent.post('/api/v1/tickets/validate').send({ code: 'ABCDE-FGHJK' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe(ERROR_CODES.TICKET_INVALID);

    const malformed = await runnerAgent.post('/api/v1/tickets/validate').send({ code: 'O0O0O-1I1I1' });
    expect(malformed.status).toBe(400);

    const both = await runnerAgent
      .post('/api/v1/tickets/validate')
      .send({ code: 'ABCDE-FGHJK', token: 'x'.repeat(40) });
    expect(both.status).toBe(400);
  });

  it('dies with the booking when the customer cancels', async () => {
    const { runnerAgent, showId } = await venueWithShow();
    const { agent, bookingId, ticket } = await paidBooking(showId);
    await agent.post(`/api/v1/me/bookings/${bookingId}/cancellations`).send({ reason: 'Plans changed' });
    await startShowSoon(bookingId);

    const stored = await Booking.findById(bookingId);
    expect(stored.entryCode).toBeUndefined();
    const response = await runnerAgent.post('/api/v1/tickets/validate').send({ code: ticket.entryCode });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODES.TICKET_INVALID);
  });

  it('is never shown to venue staff or administrators', async () => {
    const { adminAgent, runnerAgent, showId } = await venueWithShow();
    const { bookingId, ticket } = await paidBooking(showId);
    const bare = normalizeEntryCode(ticket.entryCode);

    for (const [agent, path] of [
      [runnerAgent, '/api/v1/show-runner/bookings'],
      [runnerAgent, `/api/v1/show-runner/bookings/${bookingId}`],
      [adminAgent, '/api/v1/admin/bookings'],
      [adminAgent, `/api/v1/admin/bookings/${bookingId}`],
      [adminAgent, '/api/v1/admin/dashboard'],
    ]) {
      const body = JSON.stringify((await agent.get(path)).body);
      expect(body).not.toContain(bare);
      expect(body).not.toContain(ticket.entryCode);
    }
  });

  it('is issued on first view to a booking confirmed before codes existed', async () => {
    const { showId } = await venueWithShow();
    const { agent, bookingId } = await paidBooking(showId);
    await Booking.updateOne({ _id: bookingId }, { $unset: { entryCode: '' } });

    const first = await agent.get(`/api/v1/me/bookings/${bookingId}/ticket`);
    const second = await agent.get(`/api/v1/me/bookings/${bookingId}/ticket`);
    expect(first.body.data.ticket.entryCode).toBeTruthy();
    expect(second.body.data.ticket.entryCode).toBe(first.body.data.ticket.entryCode);
  });
});

describe('cancelling a show looks after its customers', () => {
  it('cancels and fully refunds every confirmed booking, and voids the tickets', async () => {
    const { runnerAgent, showId } = await venueWithShow();
    const one = await paidBooking(showId, ['A1', 'B1']);
    const two = await paidBooking(showId, ['A2']);

    const response = await runnerAgent
      .post(`/api/v1/show-runner/shows/${showId}/cancel`)
      .send({ reason: 'Projector failure' });
    expect(response.status).toBe(200);
    expect(response.body.data.cancelledBookings).toBe(2);
    expect(response.body.data.refundsCreated).toBe(2);
    expect(response.body.data.refundPaise).toBe(one.amountPaise + two.amountPaise);

    for (const context of [one, two]) {
      const booking = await Booking.findById(context.bookingId);
      expect(booking.status).toBe(BOOKING_STATUS.CANCELLED);
      expect(booking.paymentStatus).toBe('refund_pending');
      expect(booking.ticketToken).toBeUndefined();
      expect(booking.entryCode).toBeUndefined();

      const refunds = await Refund.find({ bookingId: context.bookingId });
      expect(refunds).toHaveLength(1);
      expect(refunds[0].reason).toBe('show_cancelled');
      // Fees included: the customer did nothing wrong.
      expect(refunds[0].amountPaise).toBe(context.amountPaise);

      const ticket = await context.agent.get(`/api/v1/me/bookings/${context.bookingId}/ticket`);
      expect(ticket.status).toBe(409);
    }
  });

  it('refunds only what is left after an earlier partial cancellation', async () => {
    const { runnerAgent, showId } = await venueWithShow();
    const context = await paidBooking(showId, ['A1', 'B1']);
    const partial = await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ seatIds: ['A1'], reason: 'One of us cannot come' });
    const alreadyBack = partial.body.data.refund?.amountPaise ?? 0;

    await runnerAgent.post(`/api/v1/show-runner/shows/${showId}/cancel`).send({ reason: 'Flooding' });

    const refunds = await Refund.find({ bookingId: context.bookingId });
    const total = refunds.reduce((sum, refund) => sum + refund.amountPaise, 0);
    expect(total).toBe(context.amountPaise);
    expect(refunds.find((refund) => refund.reason === 'show_cancelled').amountPaise).toBe(
      context.amountPaise - alreadyBack,
    );
  });

  it('expires unpaid bookings and releases their holds', async () => {
    const { runnerAgent, showId } = await venueWithShow();
    const unpaid = await unpaidBooking(showId, ['A3']);

    const response = await runnerAgent
      .post(`/api/v1/show-runner/shows/${showId}/cancel`)
      .send({ reason: 'Power cut' });
    expect(response.body.data.expiredUnpaidBookings).toBe(1);
    expect((await Booking.findById(unpaid.bookingId)).status).toBe(BOOKING_STATUS.EXPIRED);
    expect((await SeatHold.findById(unpaid.holdId)).status).toBe('released');
  });

  it('refunds a payment that completes after the show was cancelled', async () => {
    const { runnerAgent, showId } = await venueWithShow();
    const unpaid = await unpaidBooking(showId, ['A4']);
    await runnerAgent.post(`/api/v1/show-runner/shows/${showId}/cancel`).send({ reason: 'Storm' });

    // The customer was already on the gateway's page and pays anyway.
    const paid = memoryPaymentProvider.__pay(unpaid.orderId);
    const verified = await unpaid.agent
      .post(`/api/v1/me/bookings/${unpaid.bookingId}/payments/verify`)
      .send(paid);

    expect(verified.status).toBe(200);
    expect(verified.body.data.outcome).toBe('unfulfillable');
    const refunds = await Refund.find({ bookingId: unpaid.bookingId });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amountPaise).toBe(unpaid.amountPaise);
  });
});

describe('a payment that lands after the booking expired', () => {
  it('is refunded, not kept', async () => {
    const { showId } = await venueWithShow();
    const unpaid = await unpaidBooking(showId, ['B4']);

    // What the clean-up job does once the hold has run out.
    await SeatHold.updateOne({ _id: unpaid.holdId }, { expiresAt: new Date(Date.now() - 60_000) });
    await Booking.updateOne(
      { _id: unpaid.bookingId },
      { status: BOOKING_STATUS.EXPIRED, expiredAt: new Date() },
    );

    const paid = memoryPaymentProvider.__pay(unpaid.orderId);
    const verified = await unpaid.agent
      .post(`/api/v1/me/bookings/${unpaid.bookingId}/payments/verify`)
      .send(paid);

    expect(verified.status).toBe(200);
    expect(verified.body.data.outcome).toBe('unfulfillable');
    expect((await Booking.findById(unpaid.bookingId)).status).toBe(BOOKING_STATUS.UNFULFILLABLE);

    const refunds = await Refund.find({ bookingId: unpaid.bookingId });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amountPaise).toBe(unpaid.amountPaise);

    // A second confirmation of the same payment does not queue a second refund.
    const again = await unpaid.agent
      .post(`/api/v1/me/bookings/${unpaid.bookingId}/payments/verify`)
      .send(paid);
    expect(again.body.data.outcome).toBe('unfulfillable');
    expect(await Refund.countDocuments({ bookingId: unpaid.bookingId })).toBe(1);
    expect(mongoose.isValidObjectId(refunds[0].paymentId)).toBe(true);
  });
});
