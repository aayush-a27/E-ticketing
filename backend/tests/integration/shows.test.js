import { describe, it, expect, beforeEach } from 'vitest';
import {
  api,
  createShowRunner,
  createSuperAdmin,
  signInAs,
  seedVenue,
  showPayload,
  futureDate,
  theaterPayload,
} from '../helpers.js';
import { Show } from '../../src/models/Show.js';
import { Movie } from '../../src/models/Movie.js';
import { memoryProvider } from '../../src/services/media/providers.js';
import { clearSettingsCache } from '../../src/services/settingsService.js';
import { SHOW_STATUS } from '../../src/constants/index.js';

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

beforeEach(() => {
  memoryProvider.__reset();
  clearSettingsCache();
});

async function setup() {
  const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
  const adminAgent = await signInAs(admin);
  const runner = await createShowRunner({ email: `runner-${unique()}@example.com` });
  const venue = await seedVenue(adminAgent, { managerId: runner.user._id });
  return { admin, adminAgent, runner, runnerAgent: await signInAs(runner), ...venue };
}

describe('creating a show', () => {
  it('schedules one and computes the end time from the runtime', async () => {
    const { runnerAgent, movieId, screenId } = await setup();

    const startAt = futureDate(48);
    const response = await runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId, screenId, startAt }));

    expect(response.status).toBe(201);
    const show = response.body.data.show;
    expect(show.status).toBe(SHOW_STATUS.DRAFT);
    // 120 min runtime + 15 min default cleanup.
    const minutes = (new Date(show.endAt) - new Date(show.startAt)) / 60_000;
    expect(minutes).toBe(135);
    expect(show.layoutVersion).toBe(1);
  });

  it('denormalizes the city from the theater', async () => {
    const { runnerAgent, movieId, screenId } = await setup();

    const response = await runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId, screenId }));

    expect(response.body.data.show.city).toBe('dehradun');
  });

  it('refuses a show in the past', async () => {
    const { runnerAgent, movieId, screenId } = await setup();

    const response = await runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId, screenId, startAt: futureDate(-5) }));

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('startAt');
  });

  it('refuses an unpublished movie', async () => {
    const { adminAgent, runnerAgent, movieId, screenId } = await setup();
    await adminAgent.post(`/api/v1/admin/movies/${movieId}/unpublish`).send({});

    const response = await runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId, screenId }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MOVIE_NOT_PUBLISHED');
  });

  it('refuses an inactive screen', async () => {
    const { runnerAgent, movieId, screenId } = await setup();
    await runnerAgent.patch(`/api/v1/show-runner/screens/${screenId}`).send({ isActive: false });

    const response = await runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId, screenId }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SCREEN_INACTIVE');
  });

  it('refuses a format the screen does not support', async () => {
    const { runnerAgent, movieId, screenId } = await setup();

    const response = await runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId, screenId, format: 'IMAX' }));

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].field).toBe('format');
  });

  it('refuses a screen with no seat layout', async () => {
    const { adminAgent, runnerAgent, movieId, theaterId } = await setup();
    const bare = await adminAgent
      .post(`/api/v1/admin/theaters/${theaterId}/screens`)
      .send({ name: `Bare ${unique()}`, formats: ['2D'] });

    const response = await runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId, screenId: bare.body.data.screen._id }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('LAYOUT_REQUIRED');
  });
});

describe('pricing must cover the layout', () => {
  it('refuses a show that leaves a seat category unpriced', async () => {
    const { runnerAgent, movieId, screenId } = await setup();

    const response = await runnerAgent.post('/api/v1/show-runner/shows').send(
      showPayload({
        movieId,
        screenId,
        pricing: [{ category: 'Silver', basePaise: 15_000 }], // Gold missing
      }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PRICING_INCOMPLETE');
    expect(response.body.error.details[0].message).toContain('Gold');
  });

  it('refuses a price for a category the screen does not have', async () => {
    const { runnerAgent, movieId, screenId } = await setup();

    const response = await runnerAgent.post('/api/v1/show-runner/shows').send(
      showPayload({
        movieId,
        screenId,
        pricing: [
          { category: 'Silver', basePaise: 15_000 },
          { category: 'Gold', basePaise: 25_000 },
          { category: 'Platinum', basePaise: 90_000 },
        ],
      }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].message).toContain('Platinum');
  });

  it('refuses the same category priced twice', async () => {
    const { runnerAgent, movieId, screenId } = await setup();

    const response = await runnerAgent.post('/api/v1/show-runner/shows').send(
      showPayload({
        movieId,
        screenId,
        pricing: [
          { category: 'Silver', basePaise: 15_000 },
          { category: 'Silver', basePaise: 19_000 },
          { category: 'Gold', basePaise: 25_000 },
        ],
      }),
    );

    expect(response.status).toBe(400);
  });

  it('refuses a negative or fractional price', async () => {
    const { runnerAgent, movieId, screenId } = await setup();

    const negative = await runnerAgent.post('/api/v1/show-runner/shows').send(
      showPayload({
        movieId,
        screenId,
        pricing: [
          { category: 'Silver', basePaise: -1 },
          { category: 'Gold', basePaise: 25_000 },
        ],
      }),
    );
    expect(negative.status).toBe(400);

    const fractional = await runnerAgent.post('/api/v1/show-runner/shows').send(
      showPayload({
        movieId,
        screenId,
        pricing: [
          { category: 'Silver', basePaise: 150.5 },
          { category: 'Gold', basePaise: 25_000 },
        ],
      }),
    );
    expect(fractional.status).toBe(400);
  });
});

/**
 * The scheduling rule that keeps a screen from being double-booked. The
 * occupied window is the film plus its cleanup gap.
 */
describe('overlap prevention', () => {
  async function scheduleAt(agent, { movieId, screenId }, hoursFromNow) {
    return agent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId, screenId, startAt: futureDate(hoursFromNow) }));
  }

  it('refuses a show starting inside another show', async () => {
    const context = await setup();
    expect((await scheduleAt(context.runnerAgent, context, 48)).status).toBe(201);

    // One hour in: the first film is still running.
    const clash = await scheduleAt(context.runnerAgent, context, 49);

    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('SHOW_OVERLAP');
  });

  it('refuses a show that would start during the cleanup gap', async () => {
    const context = await setup();
    await scheduleAt(context.runnerAgent, context, 48);

    // 2h05m later: film ended at 2h00m, but cleanup runs to 2h15m.
    const response = await context.runnerAgent.post('/api/v1/show-runner/shows').send(
      showPayload({
        movieId: context.movieId,
        screenId: context.screenId,
        startAt: new Date(Date.now() + 48 * 3_600_000 + 125 * 60_000).toISOString(),
      }),
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SHOW_OVERLAP');
  });

  it('allows a show that starts after the gap ends', async () => {
    const context = await setup();
    await scheduleAt(context.runnerAgent, context, 48);

    // 2h20m later, clear of the 2h15m window.
    const response = await context.runnerAgent.post('/api/v1/show-runner/shows').send(
      showPayload({
        movieId: context.movieId,
        screenId: context.screenId,
        startAt: new Date(Date.now() + 48 * 3_600_000 + 140 * 60_000).toISOString(),
      }),
    );

    expect(response.status).toBe(201);
    expect(await Show.countDocuments({ screenId: context.screenId })).toBe(2);
  });

  it('refuses a show that fully contains an existing one', async () => {
    const context = await setup();
    await scheduleAt(context.runnerAgent, context, 50);

    // Starts earlier and runs long enough to swallow the existing show.
    const response = await context.runnerAgent.post('/api/v1/show-runner/shows').send(
      showPayload({
        movieId: context.movieId,
        screenId: context.screenId,
        startAt: futureDate(49),
        cleanupMinutes: 120,
      }),
    );

    expect(response.status).toBe(409);
  });

  it('allows the same time on a different screen', async () => {
    const context = await setup();
    const second = await context.adminAgent
      .post(`/api/v1/admin/theaters/${context.theaterId}/screens`)
      .send({ name: `Screen ${unique()}`, formats: ['2D'] });
    const secondScreenId = second.body.data.screen._id;
    await context.adminAgent
      .post(`/api/v1/admin/screens/${secondScreenId}/layouts`)
      .send((await import('../helpers.js')).layoutPayload());

    const startAt = futureDate(48);
    const first = await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: context.screenId, startAt }));
    const parallel = await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: secondScreenId, startAt }));

    expect(first.status).toBe(201);
    expect(parallel.status).toBe(201);
  });

  it('frees the slot when the clashing show is cancelled', async () => {
    const context = await setup();
    const first = await scheduleAt(context.runnerAgent, context, 48);

    await context.runnerAgent
      .post(`/api/v1/show-runner/shows/${first.body.data.show._id}/cancel`)
      .send({ reason: 'Projector failure' });

    const response = await scheduleAt(context.runnerAgent, context, 48);
    expect(response.status).toBe(201);
  });

  it('ignores the show itself when rescheduling it', async () => {
    const context = await setup();
    const created = await scheduleAt(context.runnerAgent, context, 48);

    const response = await context.runnerAgent
      .patch(`/api/v1/show-runner/shows/${created.body.data.show._id}`)
      .send({ startAt: futureDate(49) });

    expect(response.status).toBe(200);
  });
});

describe('show ownership', () => {
  it('refuses to schedule on another runner’s screen', async () => {
    const first = await setup();
    const otherRunner = await createShowRunner({ email: `other-${unique()}@example.com` });
    const otherAgent = await signInAs(otherRunner);

    const response = await otherAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: first.movieId, screenId: first.screenId }));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('NOT_THEATER_MANAGER');
    expect(await Show.countDocuments({})).toBe(0);
  });

  it('refuses to edit or cancel another runner’s show', async () => {
    const first = await setup();
    const created = await first.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: first.movieId, screenId: first.screenId }));
    const showId = created.body.data.show._id;

    const second = await setup();

    expect(
      (await second.runnerAgent.patch(`/api/v1/show-runner/shows/${showId}`).send({ language: 'Tamil' }))
        .status,
    ).toBe(403);
    expect(
      (await second.runnerAgent.post(`/api/v1/show-runner/shows/${showId}/cancel`).send({ reason: 'Nope, mine now' }))
        .status,
    ).toBe(403);
  });

  it('scopes a runner’s show list to their own venues', async () => {
    const first = await setup();
    await first.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: first.movieId, screenId: first.screenId }));

    const second = await setup();
    await second.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: second.movieId, screenId: second.screenId }));

    const response = await first.runnerAgent.get('/api/v1/show-runner/shows');

    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination.total).toBe(1);
  });

  it('shows the super admin every show', async () => {
    const first = await setup();
    await first.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: first.movieId, screenId: first.screenId }));
    const second = await setup();
    await second.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: second.movieId, screenId: second.screenId }));

    const response = await first.adminAgent.get('/api/v1/admin/shows');
    expect(response.body.pagination.total).toBe(2);
  });
});

describe('publishing and editing', () => {
  async function publishedShow(context) {
    const created = await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: context.screenId }));
    const id = created.body.data.show._id;
    await context.runnerAgent.post(`/api/v1/show-runner/shows/${id}/publish`).send({});
    return id;
  }

  it('publishes a draft show', async () => {
    const context = await setup();
    const created = await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: context.screenId }));

    const response = await context.runnerAgent
      .post(`/api/v1/show-runner/shows/${created.body.data.show._id}/publish`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.show.status).toBe(SHOW_STATUS.PUBLISHED);
  });

  it('refuses to publish when the movie has been unpublished', async () => {
    const context = await setup();
    const created = await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: context.screenId }));
    await context.adminAgent.post(`/api/v1/admin/movies/${context.movieId}/unpublish`).send({});

    const response = await context.runnerAgent
      .post(`/api/v1/show-runner/shows/${created.body.data.show._id}/publish`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MOVIE_NOT_PUBLISHED');
  });

  /** Once a ticket exists, the facts it was sold on are frozen. */
  it('locks time and price once seats are sold', async () => {
    const context = await setup();
    const showId = await publishedShow(context);
    await Show.updateOne({ _id: showId }, { bookedSeatCount: 2 });

    const reprice = await context.runnerAgent
      .patch(`/api/v1/show-runner/shows/${showId}`)
      .send({ pricing: [{ category: 'Silver', basePaise: 99_000 }, { category: 'Gold', basePaise: 99_000 }] });

    expect(reprice.status).toBe(409);
    expect(reprice.body.error.code).toBe('SHOW_NOT_EDITABLE');

    const reschedule = await context.runnerAgent
      .patch(`/api/v1/show-runner/shows/${showId}`)
      .send({ startAt: futureDate(72) });
    expect(reschedule.status).toBe(409);
  });

  it('still allows the booking window to change after sales', async () => {
    const context = await setup();
    const showId = await publishedShow(context);
    await Show.updateOne({ _id: showId }, { bookedSeatCount: 2 });

    const response = await context.runnerAgent
      .patch(`/api/v1/show-runner/shows/${showId}`)
      .send({ bookingClosesAt: futureDate(47) });

    expect(response.status).toBe(200);
  });

  it('cancels a show and reports how many seats need refunding', async () => {
    const context = await setup();
    const showId = await publishedShow(context);
    await Show.updateOne({ _id: showId }, { bookedSeatCount: 3 });

    const response = await context.runnerAgent
      .post(`/api/v1/show-runner/shows/${showId}/cancel`)
      .send({ reason: 'Print not delivered' });

    expect(response.status).toBe(200);
    expect(response.body.data.show.status).toBe(SHOW_STATUS.CANCELLED);
    expect(response.body.data.seatsToRefund).toBe(3);
  });

  it('refuses to publish a cancelled show', async () => {
    const context = await setup();
    const showId = await publishedShow(context);
    await context.runnerAgent
      .post(`/api/v1/show-runner/shows/${showId}/cancel`)
      .send({ reason: 'Weather' });

    const response = await context.runnerAgent
      .post(`/api/v1/show-runner/shows/${showId}/publish`)
      .send({});

    expect(response.status).toBe(409);
  });

  it('refuses to archive a movie that still has upcoming published shows', async () => {
    const context = await setup();
    await publishedShow(context);

    const response = await context.adminAgent
      .post(`/api/v1/admin/movies/${context.movieId}/archive`)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('upcoming published show');
  });

  it('refuses to deactivate a screen with upcoming published shows', async () => {
    const context = await setup();
    await publishedShow(context);

    const response = await context.runnerAgent
      .patch(`/api/v1/show-runner/screens/${context.screenId}`)
      .send({ isActive: false });

    expect(response.status).toBe(409);
  });

  it('refuses to switch the active layout while shows use the current one', async () => {
    const context = await setup();
    await publishedShow(context);
    const { layoutPayload } = await import('../helpers.js');
    await context.runnerAgent
      .post(`/api/v1/show-runner/screens/${context.screenId}/layouts`)
      .send(layoutPayload({ activate: false }));

    const response = await context.runnerAgent
      .post(`/api/v1/show-runner/screens/${context.screenId}/layouts/2/activate`)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LAYOUT_IN_USE');
  });
});

describe('public show browsing', () => {
  async function publishedShow(context, overrides = {}) {
    const created = await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: context.screenId, ...overrides }));
    const id = created.body.data.show._id;
    await context.runnerAgent.post(`/api/v1/show-runner/shows/${id}/publish`).send({});
    return id;
  }

  it('lists published shows and hides drafts', async () => {
    const context = await setup();
    await publishedShow(context);
    await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: context.screenId, startAt: futureDate(60) }));

    const response = await api().get('/api/v1/shows');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('filters by city', async () => {
    const context = await setup();
    await publishedShow(context);

    expect((await api().get('/api/v1/shows?city=dehradun')).body.data).toHaveLength(1);
    expect((await api().get('/api/v1/shows?city=mumbai')).body.data).toHaveLength(0);
  });

  it('filters by movie', async () => {
    const context = await setup();
    await publishedShow(context);

    const match = await api().get(`/api/v1/shows?movieId=${context.movieId}`);
    expect(match.body.data).toHaveLength(1);
  });

  it('404s on a draft show fetched directly', async () => {
    const context = await setup();
    const draft = await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: context.screenId }));

    const response = await api().get(`/api/v1/shows/${draft.body.data.show._id}`);
    expect(response.status).toBe(404);
  });

  /**
   * The public endpoints must not hand out who created a show, its draft
   * status, or how many seats it has sold.
   */
  it('hides internal fields from the public list and detail', async () => {
    const context = await setup();
    const showId = await publishedShow(context);
    await Show.updateOne({ _id: showId }, { bookedSeatCount: 7 });

    const list = await api().get('/api/v1/shows');
    const detail = await api().get(`/api/v1/shows/${showId}`);

    for (const payload of [list.body.data[0], detail.body.data.show]) {
      expect(payload.bookedSeatCount).toBeUndefined();
      expect(payload.createdBy).toBeUndefined();
      expect(payload.updatedBy).toBeUndefined();
      expect(payload.status).toBeUndefined();
      expect(payload.inventoryGeneratedAt).toBeUndefined();
    }
    expect(JSON.stringify(list.body)).not.toContain('bookedSeatCount');
  });

  it('exposes what a listing card needs, including a starting price', async () => {
    const context = await setup();
    await publishedShow(context);

    const response = await api().get('/api/v1/shows');
    const show = response.body.data[0];

    expect(show.movie.title).toBe('The Long Afternoon');
    expect(show.theater.city).toBe('Dehradun');
    expect(show.screen.name).toBe('Screen 1');
    // Cheapest category of the two priced on this show.
    expect(show.startingPricePaise).toBe(15_000);
    expect(show.isBookable).toBe(true);
  });

  it('still gives managers the full document', async () => {
    const context = await setup();
    const showId = await publishedShow(context);
    await Show.updateOne({ _id: showId }, { bookedSeatCount: 7 });

    const runnerView = await context.runnerAgent.get(`/api/v1/show-runner/shows/${showId}`);
    expect(runnerView.body.data.show.bookedSeatCount).toBe(7);
    expect(runnerView.body.data.show.status).toBe(SHOW_STATUS.PUBLISHED);
  });

  it('returns a seat map with per-category prices', async () => {
    const context = await setup();
    const showId = await publishedShow(context);

    const response = await api().get(`/api/v1/shows/${showId}/seats`);

    expect(response.status).toBe(200);
    expect(response.body.data.layoutVersion).toBe(1);
    expect(response.body.data.seats).toHaveLength(8);

    const silver = response.body.data.seats.find((seat) => seat.category === 'Silver');
    const gold = response.body.data.seats.find((seat) => seat.category === 'Gold');
    expect(silver.pricePaise).toBe(15_000);
    expect(gold.pricePaise).toBe(25_000);
  });
});

/** The server computes the money; the client only names seats. */
describe('price quotes', () => {
  async function publishedShow(context) {
    const created = await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: context.screenId }));
    const id = created.body.data.show._id;
    await context.runnerAgent.post(`/api/v1/show-runner/shows/${id}/publish`).send({});
    return id;
  }

  it('quotes from the show price table, not from the client', async () => {
    const context = await setup();
    const showId = await publishedShow(context);

    const response = await api()
      .post(`/api/v1/shows/${showId}/price-quote`)
      .send({ seatIds: ['A1', 'B1'], totalPaise: 1 });

    expect(response.status).toBe(200);
    const quote = response.body.data.quote;
    // Silver 15000 + Gold 25000.
    expect(quote.subtotalPaise).toBe(40_000);
    expect(quote.totalPaise).toBeGreaterThan(40_000);
    expect(quote.totalPaise).toBe(
      quote.subtotalPaise - quote.discountPaise + quote.convenienceFeePaise + quote.taxTotalPaise,
    );
  });

  it('refuses a seat that is not in this show’s layout', async () => {
    const context = await setup();
    const showId = await publishedShow(context);

    const response = await api()
      .post(`/api/v1/shows/${showId}/price-quote`)
      .send({ seatIds: ['Z99'] });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].message).toContain('Unknown seat');
  });

  it('refuses the same seat listed twice', async () => {
    const context = await setup();
    const showId = await publishedShow(context);

    const response = await api()
      .post(`/api/v1/shows/${showId}/price-quote`)
      .send({ seatIds: ['A1', 'A1'] });

    expect(response.status).toBe(400);
  });

  it('refuses a quote for an unpublished show', async () => {
    const context = await setup();
    const draft = await context.runnerAgent
      .post('/api/v1/show-runner/shows')
      .send(showPayload({ movieId: context.movieId, screenId: context.screenId }));

    const response = await api()
      .post(`/api/v1/shows/${draft.body.data.show._id}/price-quote`)
      .send({ seatIds: ['A1'] });

    expect(response.status).toBe(404);
  });

  it('reflects a settings change in the next quote', async () => {
    const context = await setup();
    const showId = await publishedShow(context);

    const before = await api().post(`/api/v1/shows/${showId}/price-quote`).send({ seatIds: ['A1'] });

    await context.adminAgent
      .patch('/api/v1/admin/settings')
      .send({ fees: { percentBasisPoints: 0, flatPerTicketPaise: 0, capPerBookingPaise: null } });
    clearSettingsCache();

    const after = await api().post(`/api/v1/shows/${showId}/price-quote`).send({ seatIds: ['A1'] });

    expect(before.body.data.quote.convenienceFeePaise).toBeGreaterThan(0);
    expect(after.body.data.quote.convenienceFeePaise).toBe(0);
  });
});

describe('settings', () => {
  it('is readable and editable only by the super admin', async () => {
    const context = await setup();

    expect((await context.adminAgent.get('/api/v1/admin/settings')).status).toBe(200);
    expect((await context.runnerAgent.get('/api/v1/admin/settings')).status).toBe(403);
    expect((await api().get('/api/v1/admin/settings')).status).toBe(401);
  });

  it('validates a tax rate above 100%', async () => {
    const context = await setup();

    const response = await context.adminAgent
      .patch('/api/v1/admin/settings')
      .send({ taxComponents: [{ name: 'Absurd', rateBasisPoints: 20_000 }] });

    expect(response.status).toBe(400);
  });

  it('keeps cancellation rules ordered widest-window first', async () => {
    const context = await setup();

    const response = await context.adminAgent.patch('/api/v1/admin/settings').send({
      cancellation: {
        enabled: true,
        graceWindowMinutes: 120,
        rules: [
          { label: 'Late', minHoursBeforeShow: 2, refundPercentBasisPoints: 0 },
          { label: 'Early', minHoursBeforeShow: 48, refundPercentBasisPoints: 10_000 },
        ],
      },
    });

    expect(response.status).toBe(200);
    const rules = response.body.data.settings.cancellation.rules;
    expect(rules[0].minHoursBeforeShow).toBe(48);
  });
});

describe('movie model sanity', () => {
  it('keeps runtime on the movie, which drives the show end time', async () => {
    const context = await setup();
    const movie = await Movie.findById(context.movieId);
    expect(movie.runtimeMinutes).toBe(120);
    expect(theaterPayload().city).toBe('Dehradun');
  });
});
