import { describe, it, expect, beforeEach } from 'vitest';
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
import { AuditLog } from '../../src/models/AuditLog.js';
import { memoryProvider } from '../../src/services/media/providers.js';
import { memoryPaymentProvider } from '../../src/services/payments/providers.js';
import { clearSettingsCache } from '../../src/services/settingsService.js';
import { AUDIT_ACTIONS, ERROR_CODES } from '../../src/constants/index.js';

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

beforeEach(() => {
  memoryProvider.__reset();
  memoryPaymentProvider.__reset();
  clearSettingsCache();
});

/** A paid, confirmed booking for a show two days out, and its ticket token. */
async function ticketFor({ seatIds = ['A1', 'B1'] } = {}) {
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
  const hold = await agent.post('/api/v1/me/seat-holds').send({ showId, seatIds });
  const booking = await agent
    .post('/api/v1/me/bookings')
    .send({ holdId: hold.body.data.hold.id });
  const bookingId = booking.body.data.booking.id;

  const order = await agent.post(`/api/v1/me/bookings/${bookingId}/payments`).send({});
  const paid = memoryPaymentProvider.__pay(order.body.data.order.orderId);
  await agent.post(`/api/v1/me/bookings/${bookingId}/payments/verify`).send(paid);

  const ticket = await agent.get(`/api/v1/me/bookings/${bookingId}/ticket`);
  return {
    adminAgent,
    runnerAgent,
    bookingId,
    token: ticket.body.data.ticket.token,
  };
}

describe('gate: the entry window', () => {
  it('refuses a ticket for another day without spending it', async () => {
    const context = await ticketFor();

    // The show is two days away.
    const early = await context.runnerAgent
      .post('/api/v1/tickets/validate')
      .send({ token: context.token });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe(ERROR_CODES.TICKET_NOT_YET_VALID);

    // Crucially, the ticket was not marked used.
    const untouched = await Booking.findById(context.bookingId);
    expect(untouched.admittedAt ?? null).toBeNull();

    // On the day, the same ticket works.
    await startShowSoon(context.bookingId, { minutesFromNow: 20 });
    const onTime = await context.runnerAgent
      .post('/api/v1/tickets/validate')
      .send({ token: context.token });
    expect(onTime.status).toBe(200);
    expect(onTime.body.data.valid).toBe(true);
  });

  it('refuses a ticket for a show that has already ended', async () => {
    const context = await ticketFor();
    await startShowSoon(context.bookingId, { minutesFromNow: -300, runMinutes: 150 });

    const response = await context.runnerAgent
      .post('/api/v1/tickets/validate')
      .send({ token: context.token });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(ERROR_CODES.TICKET_SHOW_ENDED);
  });

  it('admits a latecomer while the show is still running', async () => {
    const context = await ticketFor();
    await startShowSoon(context.bookingId, { minutesFromNow: -30, runMinutes: 150 });

    const response = await context.runnerAgent
      .post('/api/v1/tickets/validate')
      .send({ token: context.token });
    expect(response.status).toBe(200);
  });

  it('tells door staff which venue, screen and seats', async () => {
    const context = await ticketFor({ seatIds: ['A1', 'A2'] });
    await startShowSoon(context.bookingId);

    const response = await context.runnerAgent
      .post('/api/v1/tickets/validate')
      .send({ token: context.token });
    expect(response.status).toBe(200);
    expect(response.body.data.theaterName).toBeTruthy();
    expect(response.body.data.screenName).toBeTruthy();
    expect(response.body.data.seats).toEqual(['A1', 'A2']);
  });
});

describe('gate: no information leaks across venues', () => {
  it('refuses another venue’s used ticket without saying it was used', async () => {
    const context = await ticketFor();
    await startShowSoon(context.bookingId);
    await context.runnerAgent.post('/api/v1/tickets/validate').send({ token: context.token });

    const outsider = await createShowRunner({ email: `out-${unique()}@example.com` });
    const outsiderAgent = await signInAs(outsider);
    const response = await outsiderAgent
      .post('/api/v1/tickets/validate')
      .send({ token: context.token });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_THEATER_MANAGER);
    expect(JSON.stringify(response.body)).not.toContain('already used');
  });
});

describe('gate: two scanners, one ticket', () => {
  it('admits exactly once when scanned simultaneously', async () => {
    const context = await ticketFor();
    await startShowSoon(context.bookingId);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        context.runnerAgent.post('/api/v1/tickets/validate').send({ token: context.token }),
      ),
    );

    const admitted = results.filter((response) => response.status === 200);
    const refused = results.filter((response) => response.status === 409);
    expect(admitted).toHaveLength(1);
    expect(refused).toHaveLength(4);
    for (const response of refused) {
      expect(response.body.error.code).toBe(ERROR_CODES.TICKET_ALREADY_USED);
    }
  });
});

describe('settings: every change is audited before and after', () => {
  it('records a refund-policy change with both versions', async () => {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const agent = await signInAs(admin);

    const response = await agent.patch('/api/v1/admin/settings').send({
      cancellation: {
        enabled: true,
        graceWindowMinutes: 60,
        rules: [
          { label: 'A day ahead', minHoursBeforeShow: 24, refundPercentBasisPoints: 7500 },
        ],
      },
    });
    expect(response.status).toBe(200);

    const entry = await AuditLog.findOne({ action: AUDIT_ACTIONS.SETTINGS_UPDATED }).sort({
      createdAt: -1,
    });
    expect(entry).toBeTruthy();
    expect(Object.keys(entry.after)).toEqual(['cancellation']);
    expect(entry.after.cancellation.graceWindowMinutes).toBe(60);
    expect(entry.after.cancellation.rules[0].refundPercentBasisPoints).toBe(7500);
    expect(entry.before.cancellation).toBeTruthy();
    expect(entry.before.cancellation.graceWindowMinutes).not.toBe(60);
  });
});

describe('show runners: revocation and suspension', () => {
  async function runnerWithVenue() {
    const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
    const adminAgent = await signInAs(admin);
    const runner = await createShowRunner({ email: `runner-${unique()}@example.com` });
    const venue = await seedVenue(adminAgent, { managerId: runner.user._id });
    return { adminAgent, runner, venue };
  }

  it('drops every venue on revocation, so a later approval grants none', async () => {
    const { adminAgent, runner, venue } = await runnerWithVenue();

    const revoked = await adminAgent
      .patch(`/api/v1/admin/show-runners/${runner.user._id}/status`)
      .send({ status: 'revoked', reason: 'Contract ended' });
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.removedFromTheaters).toHaveLength(1);

    const theater = await adminAgent.get(`/api/v1/admin/theaters/${venue.theaterId}`);
    expect(theater.body.data.theater.managers).toEqual([]);

    // They apply again and are approved again.
    const customerAgent = await signInAs(runner);
    const { validApplicationPayload } = await import('../helpers.js');
    const applied = await customerAgent
      .post('/api/v1/me/organizer-applications')
      .send(validApplicationPayload({ contactEmail: runner.user.email }));
    expect(applied.status).toBe(201);
    await adminAgent
      .post(`/api/v1/admin/organizer-applications/${applied.body.data.application._id}/approve`)
      .send({});

    // Approval alone must not bring the old theater back.
    const list = await adminAgent.get('/api/v1/admin/show-runners');
    const again = list.body.data.find((row) => String(row.userId._id) === String(runner.user._id));
    expect(again.status).toBe('active');
    expect(again.assignedTheaters).toEqual([]);
    expect(again.needsTheaterAssignment).toBe(true);
  });

  it('keeps venues on suspension and tells the runner why', async () => {
    const { adminAgent, runner, venue } = await runnerWithVenue();

    await adminAgent
      .patch(`/api/v1/admin/show-runners/${runner.user._id}/status`)
      .send({ status: 'suspended', reason: 'Unpaid platform fees' });

    const theater = await adminAgent.get(`/api/v1/admin/theaters/${venue.theaterId}`);
    expect(theater.body.data.theater.managers.map(String)).toContain(String(runner.user._id));

    const agent = await signInAs(runner);
    const me = await agent.get('/api/v1/auth/me');
    expect(me.body.data.showRunner.status).toBe('suspended');
    expect(me.body.data.showRunner.statusReason).toBe('Unpaid platform fees');

    // And they are still refused operationally.
    expect((await agent.get('/api/v1/show-runner/theaters')).status).toBe(403);
  });
});
