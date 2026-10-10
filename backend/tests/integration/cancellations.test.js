import { describe, it, expect, beforeEach } from 'vitest';
import {
  createShowRunner,
  createSuperAdmin,
  createUser,
  signInAs,
  seedVenue,
  showPayload,
  futureDate,
  startShowSoon,
} from '../helpers.js';
import { Booking } from '../../src/models/Booking.js';
import { Refund } from '../../src/models/Refund.js';
import { Cancellation } from '../../src/models/Cancellation.js';
import { ShowSeat } from '../../src/models/ShowSeat.js';
import { Show } from '../../src/models/Show.js';
import { memoryProvider } from '../../src/services/media/providers.js';
import { memoryPaymentProvider } from '../../src/services/payments/providers.js';
import { clearSettingsCache } from '../../src/services/settingsService.js';
import { evaluateCancellation } from '../../src/services/cancellationPolicy.js';
import { BOOKING_STATUS, PAYMENT_STATUS, REFUND_STATUS, SEAT_STATE } from '../../src/constants/index.js';

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

beforeEach(() => {
  memoryProvider.__reset();
  memoryPaymentProvider.__reset();
  clearSettingsCache();
});

/** A confirmed, paid-for booking of two seats. */
async function confirmedBooking({ hoursUntilShow = 48, seatIds = ['A1', 'B1'] } = {}) {
  const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
  const adminAgent = await signInAs(admin);
  const runner = await createShowRunner({ email: `runner-${unique()}@example.com` });
  const runnerAgent = await signInAs(runner);

  const venue = await seedVenue(adminAgent, { managerId: runner.user._id });
  const created = await runnerAgent.post('/api/v1/show-runner/shows').send(
    showPayload({
      movieId: venue.movieId,
      screenId: venue.screenId,
      startAt: futureDate(hoursUntilShow),
    }),
  );
  const showId = created.body.data.show._id;
  await runnerAgent.post(`/api/v1/show-runner/shows/${showId}/publish`).send({});

  const customer = await createUser({ email: `cust-${unique()}@example.com` });
  const agent = await signInAs(customer);

  const hold = await agent.post('/api/v1/me/seat-holds').send({ showId, seatIds });
  const booking = await agent.post('/api/v1/me/bookings').send({ holdId: hold.body.data.hold.id });
  const bookingId = booking.body.data.booking.id;

  const order = await agent.post(`/api/v1/me/bookings/${bookingId}/payments`).send({});
  const paid = memoryPaymentProvider.__pay(order.body.data.order.orderId);
  const verified = await agent
    .post(`/api/v1/me/bookings/${bookingId}/payments/verify`)
    .send(paid);
  expect(verified.body.data.booking.status).toBe(BOOKING_STATUS.CONFIRMED);

  return { agent, adminAgent, runnerAgent, bookingId, showId, customer, amountPaise: booking.body.data.booking.amountPaise };
}

/**
 * Moves the booking's creation time back so the grace window no longer
 * applies. Goes through the raw collection because Mongoose marks `createdAt`
 * immutable, and a normal update would be silently ignored.
 */
async function pastGraceWindow(bookingId) {
  await Booking.collection.updateOne(
    { _id: new (await import('mongoose')).default.Types.ObjectId(String(bookingId)) },
    { $set: { createdAt: new Date(Date.now() - 48 * 3_600_000) } },
  );
}

describe('cancellation policy', () => {
  const booking = (overrides = {}) => ({
    createdAt: new Date(Date.now() - 24 * 3_600_000),
    snapshot: { startAt: new Date(Date.now() + 48 * 3_600_000) },
    seats: [
      { seatId: 'A1', pricePaise: 15_000, cancelledAt: null },
      { seatId: 'B1', pricePaise: 25_000, cancelledAt: null },
    ],
    pricing: { subtotalPaise: 40_000, convenienceFeePaise: 2800, taxTotalPaise: 4500 },
    ...overrides,
  });

  const settings = {
    cancellation: {
      enabled: true,
      graceWindowMinutes: 120,
      rules: [
        { label: 'More than 24 hours', minHoursBeforeShow: 24, refundPercentBasisPoints: 10_000, refundFees: false },
        { label: '4 to 24 hours', minHoursBeforeShow: 4, refundPercentBasisPoints: 5_000, refundFees: false },
        { label: 'Under 4 hours', minHoursBeforeShow: 0, refundPercentBasisPoints: 0, refundFees: false },
      ],
    },
  };

  it('refunds the full ticket value more than 24 hours out', async () => {
    const decision = await evaluateCancellation({ booking: booking(), settings });

    expect(decision.eligible).toBe(true);
    expect(decision.policyApplied.label).toBe('More than 24 hours');
    expect(decision.seatRefundPaise).toBe(40_000);
    // Fees are not returned under this rule.
    expect(decision.feeRefundPaise).toBe(0);
    expect(decision.refundablePaise).toBe(40_000);
  });

  it('refunds half between 4 and 24 hours out', async () => {
    const decision = await evaluateCancellation({
      booking: booking({ snapshot: { startAt: new Date(Date.now() + 10 * 3_600_000) } }),
      settings,
    });

    expect(decision.policyApplied.label).toBe('4 to 24 hours');
    expect(decision.refundablePaise).toBe(20_000);
  });

  it('refunds nothing within 4 hours', async () => {
    const decision = await evaluateCancellation({
      booking: booking({ snapshot: { startAt: new Date(Date.now() + 2 * 3_600_000) } }),
      settings,
    });

    expect(decision.eligible).toBe(true);
    expect(decision.refundablePaise).toBe(0);
  });

  /** The grace window overrides the showtime rule, fees included. */
  it('refunds everything inside the grace window, even close to showtime', async () => {
    const decision = await evaluateCancellation({
      booking: booking({
        createdAt: new Date(Date.now() - 10 * 60_000),
        snapshot: { startAt: new Date(Date.now() + 2 * 3_600_000) },
      }),
      settings,
    });

    expect(decision.withinGraceWindow).toBe(true);
    expect(decision.seatRefundPaise).toBe(40_000);
    expect(decision.feeRefundPaise).toBe(7300);
    expect(decision.refundablePaise).toBe(47_300);
  });

  it('prices a partial cancellation by the seats given up', async () => {
    const decision = await evaluateCancellation({
      booking: booking(),
      seatIds: ['A1'],
      settings,
    });

    expect(decision.isWholeBooking).toBe(false);
    expect(decision.seatsValuePaise).toBe(15_000);
    expect(decision.refundablePaise).toBe(15_000);
  });

  it('refuses once the show has started', async () => {
    const decision = await evaluateCancellation({
      booking: booking({ snapshot: { startAt: new Date(Date.now() - 60_000) } }),
      settings,
    });

    expect(decision.eligible).toBe(false);
    expect(decision.reason).toContain('already started');
  });

  it('refuses when cancellation is switched off', async () => {
    const decision = await evaluateCancellation({
      booking: booking(),
      settings: { cancellation: { enabled: false } },
    });

    expect(decision.eligible).toBe(false);
  });

  it('ignores seats already cancelled', async () => {
    const decision = await evaluateCancellation({
      booking: booking({
        seats: [
          { seatId: 'A1', pricePaise: 15_000, cancelledAt: new Date() },
          { seatId: 'B1', pricePaise: 25_000, cancelledAt: null },
        ],
      }),
      settings,
    });

    expect(decision.seatIds).toEqual(['B1']);
    expect(decision.isWholeBooking).toBe(true);
  });
});

describe('cancelling a booking', () => {
  it('quotes before committing', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);

    const response = await context.agent.get(
      `/api/v1/me/bookings/${context.bookingId}/cancellation-quote`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.quote.eligible).toBe(true);
    expect(response.body.data.quote.refundablePaise).toBe(40_000);
  });

  it('releases the seats and records a refund', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);

    const response = await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Plans changed' });

    expect(response.status).toBe(200);
    expect(response.body.data.booking.status).toBe(BOOKING_STATUS.CANCELLED);
    expect(response.body.data.refund.amountPaise).toBe(40_000);

    const seats = await ShowSeat.find({ showId: context.showId, seatId: { $in: ['A1', 'B1'] } });
    expect(seats.every((seat) => seat.state === SEAT_STATE.AVAILABLE)).toBe(true);
    expect(seats.every((seat) => seat.bookingId === null)).toBe(true);

    const show = await Show.findById(context.showId);
    expect(show.bookedSeatCount).toBe(0);
  });

  /** Financial history is never deleted. */
  it('keeps the booking record rather than removing it', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);

    await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Plans changed' });

    const stored = await Booking.findById(context.bookingId);
    expect(stored).not.toBeNull();
    expect(stored.cancellationReason).toBe('Plans changed');
    expect(stored.cancelledAt).toBeInstanceOf(Date);
    expect(await Cancellation.countDocuments({ bookingId: context.bookingId })).toBe(1);
  });

  /** A cancelled ticket must not open a gate. */
  it('invalidates the ticket', async () => {
    const context = await confirmedBooking();
    const ticket = await context.agent.get(`/api/v1/me/bookings/${context.bookingId}/ticket`);
    const token = ticket.body.data.ticket.token;
    await pastGraceWindow(context.bookingId);

    await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Plans changed' });

    const stored = await Booking.findById(context.bookingId);
    expect(stored.ticketToken).toBeUndefined();

    const scan = await context.runnerAgent.post('/api/v1/tickets/validate').send({ token });
    expect(scan.status).toBe(400);
    expect(scan.body.error.code).toBe('TICKET_INVALID');
  });

  it('cancels only the named seats in a partial cancellation', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);

    const response = await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ seatIds: ['A1'], reason: 'One of us cannot make it' });

    expect(response.status).toBe(200);
    // The booking stays confirmed; one seat is gone.
    expect(response.body.data.booking.status).toBe(BOOKING_STATUS.CONFIRMED);
    expect(response.body.data.refund.amountPaise).toBe(15_000);

    const seats = response.body.data.booking.seats;
    expect(seats.find((seat) => seat.seatId === 'A1').cancelled).toBe(true);
    expect(seats.find((seat) => seat.seatId === 'B1').cancelled).toBe(false);

    const released = await ShowSeat.findOne({ showId: context.showId, seatId: 'A1' });
    const kept = await ShowSeat.findOne({ showId: context.showId, seatId: 'B1' });
    expect(released.state).toBe(SEAT_STATE.AVAILABLE);
    expect(kept.state).toBe(SEAT_STATE.BOOKED);

    const show = await Show.findById(context.showId);
    expect(show.bookedSeatCount).toBe(1);
  });

  it('still issues a ticket after a partial cancellation', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);
    await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ seatIds: ['A1'], reason: 'One fewer' });

    const ticket = await context.agent.get(`/api/v1/me/bookings/${context.bookingId}/ticket`);
    expect(ticket.status).toBe(200);

    await startShowSoon(context.bookingId);
    const scan = await context.runnerAgent
      .post('/api/v1/tickets/validate')
      .send({ token: ticket.body.data.ticket.token });
    expect(scan.body.data.seats).toEqual(['B1']);
  });

  it('refuses to cancel twice', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);

    const first = await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Plans changed' });
    expect(first.status).toBe(200);

    const second = await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Again' });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CANCELLATION_NOT_ELIGIBLE');
    expect(await Refund.countDocuments({ bookingId: context.bookingId })).toBe(1);
  });

  it('refuses to cancel an unpaid booking', async () => {
    const context = await confirmedBooking();
    await Booking.updateOne(
      { _id: context.bookingId },
      { status: BOOKING_STATUS.PENDING_PAYMENT },
    );

    const response = await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Not paid yet' });

    expect(response.status).toBe(409);
  });

  it('does not let one customer cancel another’s booking', async () => {
    const context = await confirmedBooking();
    const stranger = await createUser({ email: `stranger-${unique()}@example.com` });
    const strangerAgent = await signInAs(stranger);

    const response = await strangerAgent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Not mine' });

    expect(response.status).toBe(404);
    expect((await Booking.findById(context.bookingId)).status).toBe(BOOKING_STATUS.CONFIRMED);
  });

  it('refuses a cancellation within four hours of the show, with no refund', async () => {
    const context = await confirmedBooking({ hoursUntilShow: 2 });
    await pastGraceWindow(context.bookingId);

    const response = await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Too late' });

    // The cancellation is allowed; the refund is simply zero.
    expect(response.status).toBe(200);
    expect(response.body.data.refund).toBeNull();
    expect(await Refund.countDocuments({ bookingId: context.bookingId })).toBe(0);
  });
});

describe('refunds', () => {
  it('processes the refund and marks the booking refunded', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);

    await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Plans changed' });

    const { processPendingRefunds } = await import('../../src/modules/refunds/refunds.service.js');
    await processPendingRefunds();

    const refund = await Refund.findOne({ bookingId: context.bookingId });
    expect(refund.status).toBe(REFUND_STATUS.COMPLETED);
    expect(refund.providerRefundId).toMatch(/^rfnd_mem_/);
  });

  it('marks a partial refund as partially refunded', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);

    await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ seatIds: ['A1'], reason: 'One fewer' });

    const { processPendingRefunds } = await import('../../src/modules/refunds/refunds.service.js');
    await processPendingRefunds();

    const booking = await Booking.findById(context.bookingId);
    expect(booking.paymentStatus).toBe(PAYMENT_STATUS.PARTIALLY_REFUNDED);
  });

  it('does not refund the same cancellation twice', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);
    await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Plans changed' });

    const { processPendingRefunds } = await import('../../src/modules/refunds/refunds.service.js');
    await processPendingRefunds();
    await processPendingRefunds();
    await processPendingRefunds();

    expect(await Refund.countDocuments({ bookingId: context.bookingId })).toBe(1);
    const refunds = await Refund.find({ bookingId: context.bookingId });
    expect(refunds[0].attempts).toBe(1);
  });

  it('lists refund status to the customer', async () => {
    const context = await confirmedBooking();
    await pastGraceWindow(context.bookingId);
    await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/cancellations`)
      .send({ reason: 'Plans changed' });

    const response = await context.agent.get(`/api/v1/me/bookings/${context.bookingId}/refunds`);

    expect(response.status).toBe(200);
    expect(response.body.data.refunds).toHaveLength(1);
    expect(response.body.data.refunds[0].reason).toBe('cancellation');
  });
});

describe('abandoned bookings', () => {
  it('expires one whose hold lapsed without payment', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const adminAgent = await signInAs(admin);
    const runner = await createShowRunner({ email: `runner-${unique()}@example.com` });
    const runnerAgent = await signInAs(runner);
    const venue = await seedVenue(adminAgent, { managerId: runner.user._id });
    const created = await runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: venue.movieId, screenId: venue.screenId }));
    const showId = created.body.data.show._id;
    await runnerAgent.post(`/api/v1/show-runner/shows/${showId}/publish`).send({});

    const customer = await createUser({ email: `cust-${unique()}@example.com` });
    const agent = await signInAs(customer);
    const hold = await agent.post('/api/v1/me/seat-holds').send({ showId, seatIds: ['A1'] });
    const booking = await agent
      .post('/api/v1/me/bookings')
      .send({ holdId: hold.body.data.hold.id });

    const { SeatHold } = await import('../../src/models/SeatHold.js');
    await SeatHold.updateOne(
      { _id: hold.body.data.hold.id },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const { expireAbandonedBookings } = await import('../../src/jobs/reconcile.job.js');
    const result = await expireAbandonedBookings();

    expect(result.expired).toBe(1);
    const stored = await Booking.findById(booking.body.data.booking.id);
    expect(stored.status).toBe(BOOKING_STATUS.EXPIRED);
  });

  /** A paid booking is a refund case, never an expiry. */
  it('never expires a booking that has been paid for', async () => {
    const context = await confirmedBooking();

    const { expireAbandonedBookings } = await import('../../src/jobs/reconcile.job.js');
    await expireAbandonedBookings();

    expect((await Booking.findById(context.bookingId)).status).toBe(BOOKING_STATUS.CONFIRMED);
  });
});
