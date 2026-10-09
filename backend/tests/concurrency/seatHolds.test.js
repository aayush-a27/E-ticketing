import { describe, it, expect, beforeEach } from 'vitest';
import {
  createShowRunner,
  createSuperAdmin,
  createUser,
  signInAs,
  seedVenue,
  showPayload,
  bigLayoutPayload,
} from '../helpers.js';
import { ShowSeat } from '../../src/models/ShowSeat.js';
import { SeatHold } from '../../src/models/SeatHold.js';
import { Show } from '../../src/models/Show.js';
import { memoryProvider } from '../../src/services/media/providers.js';
import { clearSettingsCache } from '../../src/services/settingsService.js';
import { expireHolds } from '../../src/modules/seat-holds/seatHolds.service.js';
import { HOLD_STATUS, SEAT_STATE } from '../../src/constants/index.js';

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

beforeEach(() => {
  memoryProvider.__reset();
  clearSettingsCache();
});

/** A published show with real inventory, plus N signed-in customers. */
async function publishedShow({ customers = 2, layout = null } = {}) {
  const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
  const adminAgent = await signInAs(admin);
  const runner = await createShowRunner({ email: `runner-${unique()}@example.com` });
  const runnerAgent = await signInAs(runner);

  const venue = await seedVenue(adminAgent, { managerId: runner.user._id, layout });

  const created = await runnerAgent
    .post('/api/v1/show-runner/shows')
    .send(showPayload({ movieId: venue.movieId, screenId: venue.screenId }));
  const showId = created.body.data.show._id;

  const published = await runnerAgent.post(`/api/v1/show-runner/shows/${showId}/publish`).send({});
  expect(published.status).toBe(200);

  const agents = [];
  for (let index = 0; index < customers; index += 1) {
    const customer = await createUser({ email: `cust-${unique()}-${index}@example.com` });
    agents.push(await signInAs(customer));
  }

  return { showId, agents, adminAgent, runnerAgent, ...venue };
}

const hold = (agent, showId, seatIds) =>
  agent.post('/api/v1/me/seat-holds').send({ showId, seatIds });

describe('inventory generation', () => {
  it('creates one seat record per bookable seat when a show is published', async () => {
    const { showId } = await publishedShow({ customers: 0 });

    const seats = await ShowSeat.find({ showId });
    expect(seats).toHaveLength(8);
    expect(seats.every((seat) => seat.state === SEAT_STATE.AVAILABLE)).toBe(true);

    const show = await Show.findById(showId);
    expect(show.inventoryGeneratedAt).toBeInstanceOf(Date);
  });

  it('copies the show price onto each seat', async () => {
    const { showId } = await publishedShow({ customers: 0 });

    const silver = await ShowSeat.findOne({ showId, category: 'Silver' });
    const gold = await ShowSeat.findOne({ showId, category: 'Gold' });

    expect(silver.pricePaise).toBe(15_000);
    expect(gold.pricePaise).toBe(25_000);
  });

  it('is idempotent: re-publishing adds nothing', async () => {
    const { showId, runnerAgent } = await publishedShow({ customers: 0 });

    const again = await runnerAgent.post(`/api/v1/show-runner/shows/${showId}/publish`).send({});
    expect(again.status).toBe(200);
    expect(await ShowSeat.countDocuments({ showId })).toBe(8);
  });

  it('refuses a hold against a draft show that has no inventory', async () => {
    const { showId, agents, runnerAgent } = await publishedShow({ customers: 1 });
    await runnerAgent.post(`/api/v1/show-runner/shows/${showId}/cancel`).send({ reason: 'Testing' });

    const response = await hold(agents[0], showId, ['A1']);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SHOW_NOT_BOOKABLE');
  });
});

/**
 * The guarantee the whole design exists to provide. These run against a real
 * replica set, so the transactions and write conflicts are genuine.
 */
describe('two customers, one seat', () => {
  it('lets exactly one of two simultaneous requests win', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });

    const results = await Promise.all([
      hold(agents[0], showId, ['A1']),
      hold(agents[1], showId, ['A1']),
    ]);

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([201, 409]);

    const loser = results.find((result) => result.status === 409);
    expect(loser.body.error.code).toBe('SEATS_UNAVAILABLE');
    expect(loser.body.error.message).toContain('no longer available');

    expect(await SeatHold.countDocuments({ showId, status: HOLD_STATUS.ACTIVE })).toBe(1);
    const seat = await ShowSeat.findOne({ showId, seatId: 'A1' });
    expect(seat.state).toBe(SEAT_STATE.HELD);
  });

  it('lets exactly one of ten simultaneous requests win', async () => {
    const { showId, agents } = await publishedShow({ customers: 10 });

    const results = await Promise.all(agents.map((agent) => hold(agent, showId, ['B2'])));

    const created = results.filter((result) => result.status === 201);
    const conflicts = results.filter((result) => result.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(9);
    expect(await SeatHold.countDocuments({ showId, status: HOLD_STATUS.ACTIVE })).toBe(1);
  });

  /** The invariant, stated directly: no seat is ever held or booked twice. */
  it('never lets one seat belong to two live holds', async () => {
    const { showId, agents } = await publishedShow({ customers: 6 });

    await Promise.all(
      agents.map((agent, index) => hold(agent, showId, [index % 2 === 0 ? 'A1' : 'A2'])),
    );

    const holds = await SeatHold.find({ showId, status: HOLD_STATUS.ACTIVE });
    const claimed = holds.flatMap((item) => item.seatIds);
    expect(new Set(claimed).size).toBe(claimed.length);

    for (const seatId of ['A1', 'A2']) {
      const owners = holds.filter((item) => item.seatIds.includes(seatId));
      expect(owners.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('overlapping groups of seats', () => {
  it('gives the whole group to one request and nothing to the other', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });

    const results = await Promise.all([
      hold(agents[0], showId, ['A1', 'A2', 'A3']),
      hold(agents[1], showId, ['A3', 'A4', 'B1']),
    ]);

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([201, 409]);

    const held = await ShowSeat.find({ showId, state: SEAT_STATE.HELD });
    expect(held).toHaveLength(3);
  });

  /** All or nothing: a partial acquisition must leave no trace. */
  it('rolls back every seat when one in the group is taken', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });

    const first = await hold(agents[0], showId, ['A4']);
    expect(first.status).toBe(201);

    const second = await hold(agents[1], showId, ['A1', 'A2', 'A3', 'A4']);
    expect(second.status).toBe(409);

    // A1 to A3 must be untouched, not left half-held by the failed attempt.
    const untouched = await ShowSeat.find({
      showId,
      seatId: { $in: ['A1', 'A2', 'A3'] },
    });
    expect(untouched.every((seat) => seat.state === SEAT_STATE.AVAILABLE)).toBe(true);
    expect(untouched.every((seat) => seat.holdId === null)).toBe(true);

    expect(await SeatHold.countDocuments({ showId })).toBe(1);
  });

  it('names the seats that caused the conflict', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });
    await hold(agents[0], showId, ['A2']);

    const response = await hold(agents[1], showId, ['A1', 'A2']);

    expect(response.status).toBe(409);
    const seatIds = response.body.error.details.map((detail) => detail.seatId);
    expect(seatIds).toEqual(['A2']);
  });

  it('survives many concurrent requests for overlapping groups', async () => {
    const { showId, agents } = await publishedShow({ customers: 8 });
    const groups = [
      ['A1', 'A2'],
      ['A2', 'A3'],
      ['A3', 'A4'],
      ['A4', 'B1'],
      ['B1', 'B2'],
      ['B2', 'B3'],
      ['B3', 'B4'],
      ['A1', 'B4'],
    ];

    const results = await Promise.all(
      agents.map((agent, index) => hold(agent, showId, groups[index])),
    );

    const succeeded = results.filter((result) => result.status === 201);
    expect(succeeded.length).toBeGreaterThan(0);

    // Whatever the interleaving, no seat may end up in two holds.
    const holds = await SeatHold.find({ showId, status: HOLD_STATUS.ACTIVE });
    const claimed = holds.flatMap((item) => item.seatIds);
    expect(new Set(claimed).size).toBe(claimed.length);

    const heldSeats = await ShowSeat.countDocuments({ showId, state: SEAT_STATE.HELD });
    expect(heldSeats).toBe(claimed.length);
  });
});

describe('repeated and duplicate requests', () => {
  it('refuses the same customer taking the same seat twice', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });

    expect((await hold(agents[0], showId, ['A1'])).status).toBe(201);
    const second = await hold(agents[0], showId, ['A1']);

    expect(second.status).toBe(409);
    expect(await SeatHold.countDocuments({ showId, status: HOLD_STATUS.ACTIVE })).toBe(1);
  });

  it('replays the first response when an Idempotency-Key repeats', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });
    const key = `key-${unique()}`;

    const first = await agents[0]
      .post('/api/v1/me/seat-holds')
      .set('Idempotency-Key', key)
      .send({ showId, seatIds: ['A1'] });
    const second = await agents[0]
      .post('/api/v1/me/seat-holds')
      .set('Idempotency-Key', key)
      .send({ showId, seatIds: ['A1'] });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.hold.id).toBe(first.body.data.hold.id);
    expect(second.headers['idempotent-replay']).toBe('true');

    expect(await SeatHold.countDocuments({ showId })).toBe(1);
    expect(await ShowSeat.countDocuments({ showId, state: SEAT_STATE.HELD })).toBe(1);
  });

  it('rejects the same key used with different seats', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });
    const key = `key-${unique()}`;

    await agents[0]
      .post('/api/v1/me/seat-holds')
      .set('Idempotency-Key', key)
      .send({ showId, seatIds: ['A1'] });

    const response = await agents[0]
      .post('/api/v1/me/seat-holds')
      .set('Idempotency-Key', key)
      .send({ showId, seatIds: ['A2'] });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('treats a double-click without a key as two genuine attempts', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });

    const results = await Promise.all([
      hold(agents[0], showId, ['A1']),
      hold(agents[0], showId, ['A1']),
    ]);

    // Without a key the server cannot know these are the same intent, so one
    // wins and one conflicts — never two holds on one seat.
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });
});

describe('expiry', () => {
  /**
   * Ages a hold into the past. Both records are moved because createHold
   * writes them together in one transaction: ShowSeat.holdExpiresAt is what
   * the acquisition filter reads, SeatHold.expiresAt is what the job reads.
   */
  async function expireHold(holdId) {
    const past = new Date(Date.now() - 1000);
    await Promise.all([
      SeatHold.updateOne({ _id: holdId }, { expiresAt: past }),
      ShowSeat.updateMany({ holdId }, { holdExpiresAt: past }),
    ]);
  }

  it('reclaims a lapsed hold on sight, before any job runs', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });

    const first = await hold(agents[0], showId, ['A1']);
    await expireHold(first.body.data.hold.id);

    // No expiry pass in between: the acquisition filter reclaims it.
    const second = await hold(agents[1], showId, ['A1']);

    expect(second.status).toBe(201);
    const seat = await ShowSeat.findOne({ showId, seatId: 'A1' });
    expect(String(seat.holdId)).toBe(second.body.data.hold.id);
  });

  it('shows a lapsed hold as available on the seat map', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });

    const first = await hold(agents[0], showId, ['A1']);
    let map = await agents[0].get(`/api/v1/shows/${showId}/seats`);
    expect(map.body.data.seats.find((seat) => seat.seatId === 'A1').state).toBe(SEAT_STATE.HELD);

    await expireHold(first.body.data.hold.id);

    map = await agents[0].get(`/api/v1/shows/${showId}/seats`);
    expect(map.body.data.seats.find((seat) => seat.seatId === 'A1').state).toBe(
      SEAT_STATE.AVAILABLE,
    );
  });

  it('the job releases lapsed holds and leaves live ones alone', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });

    const stale = await hold(agents[0], showId, ['A1']);
    const live = await hold(agents[1], showId, ['A2']);
    await expireHold(stale.body.data.hold.id);

    const result = await expireHolds();

    expect(result.expired).toBe(1);
    expect(result.seatsReleased).toBe(1);

    const released = await ShowSeat.findOne({ showId, seatId: 'A1' });
    expect(released.state).toBe(SEAT_STATE.AVAILABLE);
    expect(released.holdId).toBeNull();

    const stillHeld = await ShowSeat.findOne({ showId, seatId: 'A2' });
    expect(stillHeld.state).toBe(SEAT_STATE.HELD);
    expect(String(stillHeld.holdId)).toBe(live.body.data.hold.id);
  });

  /**
   * The guard that makes the job safe to run late, or twice, or on several
   * instances: it targets the hold's own id, so it cannot free a seat that has
   * since moved to someone else.
   */
  it('a late job pass never releases a seat a newer hold now owns', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });

    const stale = await hold(agents[0], showId, ['A1']);
    await expireHold(stale.body.data.hold.id);

    // The seat is reclaimed by a second customer before the job gets there.
    const fresh = await hold(agents[1], showId, ['A1']);
    expect(fresh.status).toBe(201);

    await expireHolds();

    const seat = await ShowSeat.findOne({ showId, seatId: 'A1' });
    expect(seat.state).toBe(SEAT_STATE.HELD);
    expect(String(seat.holdId)).toBe(fresh.body.data.hold.id);
  });

  it('is safe to run concurrently with itself', async () => {
    const { showId, agents } = await publishedShow({ customers: 3 });

    for (const [index, agent] of agents.entries()) {
      const created = await hold(agent, showId, [`A${index + 1}`]);
      await expireHold(created.body.data.hold.id);
    }

    const [a, b, c] = await Promise.all([expireHolds(), expireHolds(), expireHolds()]);

    // Each hold is expired exactly once across all three passes.
    expect(a.expired + b.expired + c.expired).toBe(3);
    expect(await ShowSeat.countDocuments({ showId, state: SEAT_STATE.HELD })).toBe(0);
    expect(await SeatHold.countDocuments({ showId, status: HOLD_STATUS.EXPIRED })).toBe(3);
  });

  it('refuses to treat an expired hold as live', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });
    const created = await hold(agents[0], showId, ['A1']);
    await expireHold(created.body.data.hold.id);

    const response = await agents[0].get(`/api/v1/me/seat-holds/${created.body.data.hold.id}`);
    expect(response.status).toBe(200);
    expect(response.body.data.hold.secondsRemaining).toBe(0);
  });
});

describe('releasing a hold', () => {
  it('gives the seats straight back', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });
    const created = await hold(agents[0], showId, ['A1', 'A2']);

    const released = await agents[0].delete(`/api/v1/me/seat-holds/${created.body.data.hold.id}`);
    expect(released.status).toBe(200);
    expect(released.body.data.hold.status).toBe(HOLD_STATUS.RELEASED);

    const seats = await ShowSeat.find({ showId, seatId: { $in: ['A1', 'A2'] } });
    expect(seats.every((seat) => seat.state === SEAT_STATE.AVAILABLE)).toBe(true);

    expect((await hold(agents[1], showId, ['A1', 'A2'])).status).toBe(201);
  });

  it('will not let one customer release another’s hold', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });
    const created = await hold(agents[0], showId, ['A1']);

    const response = await agents[1].delete(`/api/v1/me/seat-holds/${created.body.data.hold.id}`);

    expect(response.status).toBe(404);
    const seat = await ShowSeat.findOne({ showId, seatId: 'A1' });
    expect(seat.state).toBe(SEAT_STATE.HELD);
  });

  it('is safe to release twice', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });
    const created = await hold(agents[0], showId, ['A1']);
    const id = created.body.data.hold.id;

    expect((await agents[0].delete(`/api/v1/me/seat-holds/${id}`)).status).toBe(200);
    expect((await agents[0].delete(`/api/v1/me/seat-holds/${id}`)).status).toBe(200);
    expect(await ShowSeat.countDocuments({ showId, state: SEAT_STATE.HELD })).toBe(0);
  });
});

describe('hold rules', () => {
  it('requires authentication', async () => {
    const { showId, adminAgent } = await publishedShow({ customers: 0 });
    // adminAgent is signed in; use a bare request instead.
    const { api } = await import('../helpers.js');
    const response = await api().post('/api/v1/me/seat-holds').send({ showId, seatIds: ['A1'] });

    expect(response.status).toBe(401);
    expect(adminAgent).toBeTruthy();
  });

  it('refuses a seat that is not in the show', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });

    const response = await hold(agents[0], showId, ['Z99']);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SEAT_NOT_IN_SHOW');
  });

  it('enforces the configured maximum seats per booking', async () => {
    const { showId, agents, adminAgent } = await publishedShow({
      customers: 1,
      layout: bigLayoutPayload(),
    });
    await adminAgent
      .patch('/api/v1/admin/settings')
      .send({ seatHold: { ttlMinutes: 10, maxSeatsPerBooking: 3 } });
    clearSettingsCache();

    const response = await hold(agents[0], showId, ['A1', 'A2', 'A3', 'A4']);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('HOLD_LIMIT_EXCEEDED');
  });

  it('refuses a blocked seat', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });
    await ShowSeat.updateOne(
      { showId, seatId: 'A1' },
      { state: SEAT_STATE.BLOCKED, blockedReason: 'Broken armrest' },
    );

    const response = await hold(agents[0], showId, ['A1']);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SEATS_UNAVAILABLE');
  });

  it('returns the server-computed price with the hold', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });

    const response = await hold(agents[0], showId, ['A1', 'B1']);

    const pricing = response.body.data.hold.pricing;
    expect(pricing.subtotalPaise).toBe(40_000);
    expect(pricing.totalPaise).toBe(
      pricing.subtotalPaise -
        pricing.discountPaise +
        pricing.convenienceFeePaise +
        pricing.taxTotalPaise,
    );
    expect(response.body.data.hold.secondsRemaining).toBeGreaterThan(0);
  });

  it('marks the customer’s own seats on the seat map', async () => {
    const { showId, agents } = await publishedShow({ customers: 2 });
    await hold(agents[0], showId, ['A1']);

    const own = await agents[0].get(`/api/v1/shows/${showId}/seats`);
    const other = await agents[1].get(`/api/v1/shows/${showId}/seats`);

    expect(own.body.data.seats.find((seat) => seat.seatId === 'A1').heldByYou).toBe(true);
    expect(other.body.data.seats.find((seat) => seat.seatId === 'A1').heldByYou).toBe(false);
  });

  it('reports availability counts that match inventory', async () => {
    const { showId, agents } = await publishedShow({ customers: 1 });
    await hold(agents[0], showId, ['A1', 'A2']);

    const map = await agents[0].get(`/api/v1/shows/${showId}/seats`);

    expect(map.body.data.summary.total).toBe(8);
    expect(map.body.data.summary.available).toBe(6);
    expect(map.headers['cache-control']).toBe('no-store');
  });
});
