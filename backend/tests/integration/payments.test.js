import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  api,
  createShowRunner,
  createSuperAdmin,
  createUser,
  signInAs,
  seedVenue,
  showPayload,
} from '../helpers.js';
import { Booking } from '../../src/models/Booking.js';
import { Payment } from '../../src/models/Payment.js';
import { Refund } from '../../src/models/Refund.js';
import { SeatHold } from '../../src/models/SeatHold.js';
import { ShowSeat } from '../../src/models/ShowSeat.js';
import { WebhookEvent } from '../../src/models/WebhookEvent.js';
import { Show } from '../../src/models/Show.js';
import { memoryProvider } from '../../src/services/media/providers.js';
import { memoryPaymentProvider } from '../../src/services/payments/providers.js';
import { clearSettingsCache } from '../../src/services/settingsService.js';
import {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  REFUND_STATUS,
  SEAT_STATE,
} from '../../src/constants/index.js';

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

beforeEach(() => {
  memoryProvider.__reset();
  memoryPaymentProvider.__reset();
  clearSettingsCache();
});

/** A published show, a signed-in customer, and seats already held. */
async function readyToPay({ seatIds = ['A1', 'B1'] } = {}) {
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

  const hold = await agent.post('/api/v1/me/seat-holds').send({ showId, seatIds });
  expect(hold.status).toBe(201);

  return {
    showId,
    agent,
    adminAgent,
    runnerAgent,
    customer,
    runner,
    holdId: hold.body.data.hold.id,
    expectedTotal: hold.body.data.hold.pricing.totalPaise,
  };
}

async function openBooking(context) {
  const response = await context.agent
    .post('/api/v1/me/bookings')
    .send({ holdId: context.holdId });
  expect(response.status).toBe(201);
  return response.body.data.booking;
}

async function createOrder(context, bookingId) {
  const response = await context.agent.post(`/api/v1/me/bookings/${bookingId}/payments`).send({});
  expect(response.status).toBe(200);
  return response.body.data.order;
}

/** Pays and verifies the way a real browser callback would. */
async function payAndVerify(context, bookingId, order) {
  const paid = memoryPaymentProvider.__pay(order.orderId);
  return context.agent.post(`/api/v1/me/bookings/${bookingId}/payments/verify`).send(paid);
}

describe('opening a booking', () => {
  it('creates one from a live hold, priced by the server', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);

    expect(booking.status).toBe(BOOKING_STATUS.PENDING_PAYMENT);
    expect(booking.amountPaise).toBe(context.expectedTotal);
    expect(booking.reference).toMatch(/^CR[A-Z2-9]{8}$/);
    expect(booking.seats).toHaveLength(2);
  });

  it('snapshots the movie and venue so a later rename cannot alter the ticket', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);

    expect(booking.movie.title).toBe('The Long Afternoon');
    expect(booking.theater.name).toContain('Nova Cinemas');
    expect(booking.theater.screen).toBe('Screen 1');
  });

  it('returns the same booking if asked twice for one hold', async () => {
    const context = await readyToPay();
    const first = await openBooking(context);

    const second = await context.agent
      .post('/api/v1/me/bookings')
      .send({ holdId: context.holdId });

    expect(second.status).toBe(200);
    expect(second.body.data.booking.id).toBe(first.id);
    expect(await Booking.countDocuments({})).toBe(1);
  });

  it('refuses a hold that has expired', async () => {
    const context = await readyToPay();
    await SeatHold.updateOne(
      { _id: context.holdId },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const response = await context.agent
      .post('/api/v1/me/bookings')
      .send({ holdId: context.holdId });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HOLD_EXPIRED');
  });

  it('refuses another customer’s hold', async () => {
    const context = await readyToPay();
    const stranger = await createUser({ email: `stranger-${unique()}@example.com` });
    const strangerAgent = await signInAs(stranger);

    const response = await strangerAgent
      .post('/api/v1/me/bookings')
      .send({ holdId: context.holdId });

    expect(response.status).toBe(404);
  });
});

describe('creating a payment order', () => {
  it('uses the booking amount and never a client-supplied one', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);

    const response = await context.agent
      .post(`/api/v1/me/bookings/${booking.id}/payments`)
      .send({ amountPaise: 1, amount: 1 });

    expect(response.status).toBe(200);
    expect(response.body.data.order.amountPaise).toBe(context.expectedTotal);

    const payment = await Payment.findOne({ bookingId: booking.id });
    expect(payment.amountPaise).toBe(context.expectedTotal);
  });

  it('returns the publishable key only', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const response = await context.agent
      .post(`/api/v1/me/bookings/${booking.id}/payments`)
      .send({});

    expect(response.body.data.publicKey).toBe('memory_key_id');
    expect(JSON.stringify(response.body)).not.toContain('memory-payment-secret');
  });

  it('reuses an open attempt rather than creating a second order', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);

    const first = await createOrder(context, booking.id);
    const second = await createOrder(context, booking.id);

    expect(second.orderId).toBe(first.orderId);
    expect(await Payment.countDocuments({ bookingId: booking.id })).toBe(1);
  });

  it('refuses once the hold has expired', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    await SeatHold.updateOne({ _id: context.holdId }, { expiresAt: new Date(Date.now() - 1000) });

    const response = await context.agent
      .post(`/api/v1/me/bookings/${booking.id}/payments`)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HOLD_EXPIRED');
  });
});

describe('verifying a payment', () => {
  it('confirms the booking and issues a ticket on a valid signature', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);

    const response = await payAndVerify(context, booking.id, order);

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe('confirmed');
    expect(response.body.data.booking.status).toBe(BOOKING_STATUS.CONFIRMED);
    expect(response.body.data.booking.paymentStatus).toBe(PAYMENT_STATUS.PAID);

    const seats = await ShowSeat.find({ showId: context.showId, seatId: { $in: ['A1', 'B1'] } });
    expect(seats.every((seat) => seat.state === SEAT_STATE.BOOKED)).toBe(true);

    const show = await Show.findById(context.showId);
    expect(show.bookedSeatCount).toBe(2);
  });

  /** The central rule: a browser claim is not evidence. */
  it('refuses an invalid signature and issues no ticket', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);

    const response = await context.agent
      .post(`/api/v1/me/bookings/${booking.id}/payments/verify`)
      .send({
        orderId: order.orderId,
        paymentId: 'pay_forged',
        signature: crypto.randomBytes(32).toString('hex'),
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SIGNATURE_INVALID');

    const stored = await Booking.findById(booking.id);
    expect(stored.status).toBe(BOOKING_STATUS.PAYMENT_FAILED);
    expect(stored.ticketToken).toBeUndefined();

    const seats = await ShowSeat.find({ showId: context.showId, seatId: { $in: ['A1', 'B1'] } });
    expect(seats.every((seat) => seat.state === SEAT_STATE.HELD)).toBe(true);
  });

  it('refuses when the gateway amount does not match the booking', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);

    const paid = memoryPaymentProvider.__pay(order.orderId);
    // The gateway reports a different amount than we asked for.
    memoryPaymentProvider.payments.get(paid.paymentId).amountPaise = 100;

    const response = await context.agent
      .post(`/api/v1/me/bookings/${booking.id}/payments/verify`)
      .send(paid);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('AMOUNT_MISMATCH');
    expect((await Booking.findById(booking.id)).status).toBe(BOOKING_STATUS.PAYMENT_FAILED);
  });

  it('is idempotent: verifying twice gives one ticket', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);

    const first = await payAndVerify(context, booking.id, order);
    const paid = memoryPaymentProvider.__pay(order.orderId);
    const second = await context.agent
      .post(`/api/v1/me/bookings/${booking.id}/payments/verify`)
      .send(paid);

    expect(first.body.data.outcome).toBe('confirmed');
    expect(second.body.data.outcome).toBe('already_confirmed');

    const show = await Show.findById(context.showId);
    expect(show.bookedSeatCount).toBe(2);
  });

  /**
   * The case the plan called out: money taken after the seats went back. The
   * booking must never be confirmed over whoever holds them now.
   */
  it('does not confirm when the hold expired before payment landed', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);

    // The hold lapses and the seats are released while the customer pays.
    await SeatHold.updateOne({ _id: context.holdId }, { expiresAt: new Date(Date.now() - 1000) });
    await ShowSeat.updateMany(
      { holdId: context.holdId },
      { holdExpiresAt: new Date(Date.now() - 1000) },
    );
    const { expireHolds } = await import('../../src/modules/seat-holds/seatHolds.service.js');
    await expireHolds();

    const response = await payAndVerify(context, booking.id, order);

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe('unfulfillable');

    const stored = await Booking.findById(booking.id);
    expect(stored.status).toBe(BOOKING_STATUS.UNFULFILLABLE);
    expect(stored.ticketToken).toBeUndefined();
    expect(stored.paymentStatus).toBe(PAYMENT_STATUS.REFUND_PENDING);

    // The money is queued to go back.
    const refund = await Refund.findOne({ bookingId: booking.id });
    expect(refund.reason).toBe('unfulfillable');
    expect(refund.amountPaise).toBe(context.expectedTotal);
  });

  it('does not let another customer verify someone else’s booking', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);

    const stranger = await createUser({ email: `nosy-${unique()}@example.com` });
    const strangerAgent = await signInAs(stranger);
    const paid = memoryPaymentProvider.__pay(order.orderId);

    const response = await strangerAgent
      .post(`/api/v1/me/bookings/${booking.id}/payments/verify`)
      .send(paid);

    expect(response.status).toBe(404);
  });
});

describe('webhooks', () => {
  function webhookBody(orderId, paymentId, { event = 'payment.captured', amount } = {}) {
    return JSON.stringify({
      id: `evt_${crypto.randomBytes(6).toString('hex')}`,
      event,
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: orderId,
            amount,
            method: 'upi',
            status: 'captured',
          },
        },
      },
    });
  }

  async function postWebhook(body, signature = null) {
    return api()
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', signature ?? memoryPaymentProvider.__signWebhook(body))
      .set('content-type', 'application/json')
      .send(body);
  }

  it('confirms a booking from a signed webhook, with no browser involved', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);
    const paid = memoryPaymentProvider.__pay(order.orderId);

    const response = await postWebhook(
      webhookBody(order.orderId, paid.paymentId, { amount: context.expectedTotal }),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe('confirmed');

    const stored = await Booking.findById(booking.id);
    expect(stored.status).toBe(BOOKING_STATUS.CONFIRMED);
    expect(stored.ticketToken).toBeTruthy();
  });

  it('rejects an unsigned or wrongly signed webhook', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);
    const paid = memoryPaymentProvider.__pay(order.orderId);
    const body = webhookBody(order.orderId, paid.paymentId, { amount: context.expectedTotal });

    const unsigned = await api()
      .post('/api/v1/webhooks/razorpay')
      .set('content-type', 'application/json')
      .send(body);
    expect(unsigned.status).toBe(400);

    const wrong = await postWebhook(body, crypto.randomBytes(32).toString('hex'));
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('SIGNATURE_INVALID');

    expect((await Booking.findById(booking.id)).status).toBe(BOOKING_STATUS.PENDING_PAYMENT);
  });

  /** A gateway that retries must not produce two tickets. */
  it('processes a duplicate event only once', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);
    const paid = memoryPaymentProvider.__pay(order.orderId);
    const body = webhookBody(order.orderId, paid.paymentId, { amount: context.expectedTotal });

    const first = await postWebhook(body);
    const second = await postWebhook(body);

    expect(first.body.data.outcome).toBe('confirmed');
    expect(second.status).toBe(200);
    expect(second.body.data.outcome).toBe('duplicate');

    expect(await WebhookEvent.countDocuments({})).toBe(1);
    const show = await Show.findById(context.showId);
    expect(show.bookedSeatCount).toBe(2);
  });

  it('converges with the browser path: verify then webhook gives one ticket', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);

    const paid = memoryPaymentProvider.__pay(order.orderId);
    await context.agent.post(`/api/v1/me/bookings/${booking.id}/payments/verify`).send(paid);

    const response = await postWebhook(
      webhookBody(order.orderId, paid.paymentId, { amount: context.expectedTotal }),
    );

    expect(response.body.data.outcome).toBe('already_confirmed');
    const show = await Show.findById(context.showId);
    expect(show.bookedSeatCount).toBe(2);
  });

  it('marks a failure from a payment.failed event', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);
    const paid = memoryPaymentProvider.__pay(order.orderId, { status: 'failed' });

    const response = await postWebhook(
      webhookBody(order.orderId, paid.paymentId, {
        event: 'payment.failed',
        amount: context.expectedTotal,
      }),
    );

    expect(response.body.data.outcome).toBe('payment_failed');
    expect((await Booking.findById(booking.id)).status).toBe(BOOKING_STATUS.PAYMENT_FAILED);
  });

  it('refuses a webhook whose amount disagrees with the booking', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);
    const paid = memoryPaymentProvider.__pay(order.orderId);

    const response = await postWebhook(
      webhookBody(order.orderId, paid.paymentId, { amount: 1 }),
    );

    expect(response.body.data.outcome).toBe('amount_mismatch');
    expect((await Booking.findById(booking.id)).status).toBe(BOOKING_STATUS.PAYMENT_FAILED);
  });

  it('ignores an event for an unknown order without failing', async () => {
    const response = await postWebhook(
      webhookBody('order_does_not_exist', 'pay_nope', { amount: 1000 }),
    );

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe('unknown_order');
  });
});

describe('tickets', () => {
  async function confirmedBooking() {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);
    await payAndVerify(context, booking.id, order);
    return { context, bookingId: booking.id };
  }

  it('issues a QR ticket for a confirmed booking', async () => {
    const { context, bookingId } = await confirmedBooking();

    const response = await context.agent.get(`/api/v1/me/bookings/${bookingId}/ticket`);

    expect(response.status).toBe(200);
    expect(response.body.data.ticket.token).toBeTruthy();
    expect(response.body.data.ticket.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('refuses a ticket for an unpaid booking', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);

    const response = await context.agent.get(`/api/v1/me/bookings/${booking.id}/ticket`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PAYMENT_NOT_CONFIRMED');
  });

  it('carries no customer data in the token', async () => {
    const { context, bookingId } = await confirmedBooking();
    const response = await context.agent.get(`/api/v1/me/bookings/${bookingId}/ticket`);
    const token = response.body.data.ticket.token;

    expect(token).not.toContain(context.customer.user.email);
    expect(token).not.toContain('Test User');
    // bookingId.nonce.hmac
    expect(token.split('.')).toHaveLength(3);
  });

  it('admits once at the gate and refuses a second scan', async () => {
    const { context, bookingId } = await confirmedBooking();
    const ticket = await context.agent.get(`/api/v1/me/bookings/${bookingId}/ticket`);
    const token = ticket.body.data.ticket.token;

    const first = await context.runnerAgent.post('/api/v1/tickets/validate').send({ token });
    expect(first.status).toBe(200);
    expect(first.body.data.valid).toBe(true);
    expect(first.body.data.seats).toEqual(['A1', 'B1']);

    const second = await context.runnerAgent.post('/api/v1/tickets/validate').send({ token });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('TICKET_ALREADY_USED');
  });

  it('rejects a forged token', async () => {
    const { context, bookingId } = await confirmedBooking();
    const forged = `${bookingId}.${crypto.randomBytes(12).toString('hex')}.${crypto
      .randomBytes(32)
      .toString('hex')}`;

    const response = await context.runnerAgent.post('/api/v1/tickets/validate').send({ token: forged });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TICKET_INVALID');
  });

  it('does not let a customer validate tickets', async () => {
    const { context, bookingId } = await confirmedBooking();
    const ticket = await context.agent.get(`/api/v1/me/bookings/${bookingId}/ticket`);

    const response = await context.agent
      .post('/api/v1/tickets/validate')
      .send({ token: ticket.body.data.ticket.token });

    expect(response.status).toBe(403);
  });

  it('does not let a runner admit at a venue they do not manage', async () => {
    const { context, bookingId } = await confirmedBooking();
    const ticket = await context.agent.get(`/api/v1/me/bookings/${bookingId}/ticket`);

    const otherRunner = await createShowRunner({ email: `other-${unique()}@example.com` });
    const otherAgent = await signInAs(otherRunner);

    const response = await otherAgent
      .post('/api/v1/tickets/validate')
      .send({ token: ticket.body.data.ticket.token });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_THEATER_MANAGER');
  });
});

describe('booking history', () => {
  it('lists only the signed-in customer’s bookings', async () => {
    const context = await readyToPay();
    await openBooking(context);

    const stranger = await createUser({ email: `other-${unique()}@example.com` });
    const strangerAgent = await signInAs(stranger);

    expect((await context.agent.get('/api/v1/me/bookings')).body.pagination.total).toBe(1);
    expect((await strangerAgent.get('/api/v1/me/bookings')).body.pagination.total).toBe(0);
  });

  it('separates upcoming from past', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const order = await createOrder(context, booking.id);
    await payAndVerify(context, booking.id, order);

    const upcoming = await context.agent.get('/api/v1/me/bookings?scope=upcoming');
    expect(upcoming.body.data).toHaveLength(1);

    await Booking.updateOne(
      { _id: booking.id },
      { 'snapshot.startAt': new Date(Date.now() - 86_400_000) },
    );

    expect((await context.agent.get('/api/v1/me/bookings?scope=upcoming')).body.data).toHaveLength(0);
    expect((await context.agent.get('/api/v1/me/bookings?scope=past')).body.data).toHaveLength(1);
  });

  it('refuses to show one customer another’s booking', async () => {
    const context = await readyToPay();
    const booking = await openBooking(context);
    const stranger = await createUser({ email: `peek-${unique()}@example.com` });
    const strangerAgent = await signInAs(stranger);

    expect((await strangerAgent.get(`/api/v1/me/bookings/${booking.id}`)).status).toBe(404);
  });
});
