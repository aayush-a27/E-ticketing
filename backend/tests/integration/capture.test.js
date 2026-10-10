import { describe, it, expect, beforeEach } from 'vitest';
import {
  api,
  createShowRunner,
  createSuperAdmin,
  createUser,
  futureDate,
  seedVenue,
  showPayload,
  signInAs,
} from '../helpers.js';
import { Payment } from '../../src/models/Payment.js';
import { WebhookEvent } from '../../src/models/WebhookEvent.js';
import { memoryProvider } from '../../src/services/media/providers.js';
import { memoryPaymentProvider } from '../../src/services/payments/providers.js';
import { clearSettingsCache } from '../../src/services/settingsService.js';
import { BOOKING_STATUS } from '../../src/constants/index.js';

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

beforeEach(() => {
  memoryProvider.__reset();
  memoryPaymentProvider.__reset();
  clearSettingsCache();
});

async function openOrder() {
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

  const customer = await createUser({ email: `cust-${unique()}@example.com` });
  const agent = await signInAs(customer);
  const hold = await agent.post('/api/v1/me/seat-holds').send({ showId, seatIds: ['A1'] });
  const booking = await agent.post('/api/v1/me/bookings').send({ holdId: hold.body.data.hold.id });
  const bookingId = booking.body.data.booking.id;
  const order = await agent.post(`/api/v1/me/bookings/${bookingId}/payments`).send({});
  return {
    agent,
    bookingId,
    amountPaise: booking.body.data.booking.amountPaise,
    orderId: order.body.data.order.orderId,
  };
}

function webhook(body, eventId) {
  const raw = JSON.stringify(body);
  const request = api()
    .post('/api/v1/webhooks/razorpay')
    .set('x-razorpay-signature', memoryPaymentProvider.__signWebhook(raw))
    .set('content-type', 'application/json');
  if (eventId) request.set('x-razorpay-event-id', eventId);
  return request.send(raw);
}

function paymentEvent(event, { orderId, paymentId, amount }) {
  return {
    entity: 'event',
    event,
    payload: {
      payment: {
        entity: { id: paymentId, order_id: orderId, amount, method: 'upi', status: event.split('.')[1] },
      },
    },
  };
}

describe('capturing payments', () => {
  it('captures a payment the gateway reports as only authorized, before issuing the ticket', async () => {
    const context = await openOrder();
    // Accounts with manual capture leave the payment authorized after checkout.
    const paid = memoryPaymentProvider.__pay(context.orderId, { status: 'authorized' });

    const verified = await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/payments/verify`)
      .send(paid);

    expect(verified.body.data.booking.status).toBe(BOOKING_STATUS.CONFIRMED);
    expect(memoryPaymentProvider.captures).toEqual([paid.paymentId]);
    const stored = await Payment.findOne({ orderId: context.orderId });
    expect(stored.status).toBe('captured');
  });

  it('does not capture a payment the gateway already captured', async () => {
    const context = await openOrder();
    const paid = memoryPaymentProvider.__pay(context.orderId, { status: 'captured' });

    await context.agent
      .post(`/api/v1/me/bookings/${context.bookingId}/payments/verify`)
      .send(paid);

    expect(memoryPaymentProvider.captures).toEqual([]);
  });
});

describe('Razorpay webhook event ids', () => {
  it('processes the authorized and captured events for one payment separately', async () => {
    const context = await openOrder();
    const paid = memoryPaymentProvider.__pay(context.orderId, { status: 'authorized' });
    const details = { orderId: context.orderId, paymentId: paid.paymentId, amount: context.amountPaise };

    const authorized = await webhook(paymentEvent('payment.authorized', details), 'evt_auth_1');
    const captured = await webhook(paymentEvent('payment.captured', details), 'evt_capt_1');

    expect(authorized.status).toBe(200);
    expect(captured.status).toBe(200);
    // Before the fix the second was keyed by the payment id and dropped.
    expect(captured.body.data.outcome).not.toBe('duplicate');
    expect(await WebhookEvent.countDocuments({})).toBe(2);
  });

  it('ignores a genuine redelivery of the same event', async () => {
    const context = await openOrder();
    const paid = memoryPaymentProvider.__pay(context.orderId);
    const body = paymentEvent('payment.captured', {
      orderId: context.orderId,
      paymentId: paid.paymentId,
      amount: context.amountPaise,
    });

    await webhook(body, 'evt_same');
    const again = await webhook(body, 'evt_same');

    expect(again.status).toBe(200);
    expect(again.body.data.outcome).toBe('duplicate');
  });
});
