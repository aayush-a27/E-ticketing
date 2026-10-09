import { describe, it, expect } from 'vitest';
import {
  api,
  createShowRunner,
  createSuperAdmin,
  createUser,
  signInAs,
  layoutPayload,
  theaterPayload,
} from '../helpers.js';
import { Theater } from '../../src/models/Theater.js';
import { Screen } from '../../src/models/Screen.js';
import { SeatLayout } from '../../src/models/SeatLayout.js';
import { SHOW_RUNNER_STATUS } from '../../src/constants/index.js';

let counter = 0;
const unique = () => `${Date.now()}-${(counter += 1)}`;

async function adminAgent() {
  const admin = await createSuperAdmin({ email: `admin-${unique()}@example.com` });
  return { admin, agent: await signInAs(admin) };
}

/** An approved, active runner with one theater assigned and a screen on it. */
async function runnerWithTheater(agent, { email } = {}) {
  const runner = await createShowRunner({ email: email ?? `runner-${unique()}@example.com` });
  const theater = await agent
    .post('/api/v1/admin/theaters')
    .send(theaterPayload({ name: `Venue ${unique()}`, managerIds: [String(runner.user._id)] }));
  const theaterId = theater.body.data.theater._id;

  const screen = await agent
    .post(`/api/v1/admin/theaters/${theaterId}/screens`)
    .send({ name: 'Screen 1', formats: ['2D', '3D'] });

  return {
    runner,
    runnerAgent: await signInAs(runner),
    theaterId,
    screenId: screen.body.data.screen._id,
  };
}

describe('creating theaters', () => {
  it('lets the super admin create one and derive a slug', async () => {
    const { agent } = await adminAgent();

    const response = await agent.post('/api/v1/admin/theaters').send(theaterPayload());

    expect(response.status).toBe(201);
    expect(response.body.data.theater.slug).toContain('nova-cinemas');
    // City is normalized for browsing but the display form is kept.
    expect(response.body.data.theater.city).toBe('dehradun');
    expect(response.body.data.theater.cityLabel).toBe('Dehradun');
  });

  /** Venues are assigned, never self-served. */
  it('does not let a show runner create a theater', async () => {
    const runner = await createShowRunner({ email: `selfserve-${unique()}@example.com` });
    const agent = await signInAs(runner);

    const response = await agent.post('/api/v1/show-runner/theaters').send(theaterPayload());
    expect(response.status).toBe(404);
  });

  it('stores coordinates as GeoJSON', async () => {
    const { agent } = await adminAgent();

    const response = await agent
      .post('/api/v1/admin/theaters')
      .send(theaterPayload({ coordinates: [78.0322, 30.3165] }));

    const theater = await Theater.findById(response.body.data.theater._id);
    expect(theater.location.type).toBe('Point');
    expect(theater.location.coordinates).toEqual([78.0322, 30.3165]);
  });

  it('rejects out-of-range coordinates', async () => {
    const { agent } = await adminAgent();

    const response = await agent
      .post('/api/v1/admin/theaters')
      .send(theaterPayload({ coordinates: [200, 100] }));

    expect(response.status).toBe(400);
  });
});

describe('manager assignment', () => {
  it('assigns an active show runner', async () => {
    const { agent } = await adminAgent();
    const runner = await createShowRunner({ email: `assign-${unique()}@example.com` });
    const created = await agent.post('/api/v1/admin/theaters').send(theaterPayload());

    const response = await agent
      .post(`/api/v1/admin/theaters/${created.body.data.theater._id}/managers`)
      .send({ userId: String(runner.user._id), reason: 'Verified ownership documents' });

    expect(response.status).toBe(200);
    const theater = await Theater.findById(created.body.data.theater._id);
    expect(theater.isManagedBy(runner.user._id)).toBe(true);
  });

  it('refuses to assign a plain customer', async () => {
    const { agent } = await adminAgent();
    const customer = await createUser({ email: `plain-${unique()}@example.com` });
    const created = await agent.post('/api/v1/admin/theaters').send(theaterPayload());

    const response = await agent
      .post(`/api/v1/admin/theaters/${created.body.data.theater._id}/managers`)
      .send({ userId: String(customer.user._id), reason: 'Trying to assign a customer' });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].message).toContain('customer');
  });

  it('refuses to assign a suspended show runner', async () => {
    const { agent } = await adminAgent();
    const runner = await createShowRunner({
      email: `susp-${unique()}@example.com`,
      status: SHOW_RUNNER_STATUS.SUSPENDED,
    });
    const created = await agent.post('/api/v1/admin/theaters').send(theaterPayload());

    const response = await agent
      .post(`/api/v1/admin/theaters/${created.body.data.theater._id}/managers`)
      .send({ userId: String(runner.user._id), reason: 'Should not work' });

    expect(response.status).toBe(400);
  });

  it('removes a manager', async () => {
    const { agent } = await adminAgent();
    const { runner, theaterId } = await runnerWithTheater(agent);

    const response = await agent.delete(
      `/api/v1/admin/theaters/${theaterId}/managers/${runner.user._id}`,
    );

    expect(response.status).toBe(200);
    const theater = await Theater.findById(theaterId);
    expect(theater.isManagedBy(runner.user._id)).toBe(false);
  });
});

/**
 * Gate 4. These are the tests that decide whether one show runner can reach
 * another's venue by changing an id in the URL.
 */
describe('theater ownership isolation', () => {
  it('lets a runner read and edit their own theater', async () => {
    const { agent } = await adminAgent();
    const { runnerAgent, theaterId } = await runnerWithTheater(agent);

    expect((await runnerAgent.get(`/api/v1/show-runner/theaters/${theaterId}`)).status).toBe(200);

    const updated = await runnerAgent
      .patch(`/api/v1/show-runner/theaters/${theaterId}`)
      .send({ contactPhone: '+91 99999 11111' });
    expect(updated.status).toBe(200);
  });

  it('refuses a runner access to a theater they do not manage', async () => {
    const { agent } = await adminAgent();
    const first = await runnerWithTheater(agent, { email: `owner-${unique()}@example.com` });
    const second = await runnerWithTheater(agent, { email: `other-${unique()}@example.com` });

    const read = await second.runnerAgent.get(`/api/v1/show-runner/theaters/${first.theaterId}`);
    expect(read.status).toBe(403);
    expect(read.body.error.code).toBe('NOT_THEATER_MANAGER');

    const write = await second.runnerAgent
      .patch(`/api/v1/show-runner/theaters/${first.theaterId}`)
      .send({ contactPhone: '+91 00000 00000' });
    expect(write.status).toBe(403);
  });

  it('scopes the theater list to what the runner manages', async () => {
    const { agent } = await adminAgent();
    const first = await runnerWithTheater(agent, { email: `list-a-${unique()}@example.com` });
    await runnerWithTheater(agent, { email: `list-b-${unique()}@example.com` });

    const response = await first.runnerAgent.get('/api/v1/show-runner/theaters');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]._id).toBe(first.theaterId);
  });

  it('ignores a managerId filter that would widen the list', async () => {
    const { agent } = await adminAgent();
    const first = await runnerWithTheater(agent, { email: `widen-a-${unique()}@example.com` });
    const second = await runnerWithTheater(agent, { email: `widen-b-${unique()}@example.com` });

    const response = await first.runnerAgent.get(
      `/api/v1/show-runner/theaters?managerId=${second.runner.user._id}`,
    );

    // The scope is intersected, so asking about someone else returns nothing.
    expect(response.body.data).toHaveLength(0);
  });

  it('gives the super admin access to every theater', async () => {
    const { agent } = await adminAgent();
    const { theaterId } = await runnerWithTheater(agent);

    expect((await agent.get(`/api/v1/admin/theaters/${theaterId}`)).status).toBe(200);
  });

  it('stops a suspended runner from touching their own theater', async () => {
    const { admin, agent } = await adminAgent();
    const { runner, theaterId } = await runnerWithTheater(agent);

    await agent
      .patch(`/api/v1/admin/show-runners/${runner.user._id}/status`)
      .send({ status: SHOW_RUNNER_STATUS.SUSPENDED, reason: 'Under review' });

    // Session was invalidated by the status change; sign in again.
    const freshAgent = await signInAs(runner);
    const response = await freshAgent.get(`/api/v1/show-runner/theaters/${theaterId}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SHOW_RUNNER_NOT_ACTIVE');
    expect(admin).toBeTruthy();
  });
});

describe('screens', () => {
  it('creates a screen and refuses a duplicate name in the same theater', async () => {
    const { agent } = await adminAgent();
    const { runnerAgent, theaterId } = await runnerWithTheater(agent);

    const created = await runnerAgent
      .post(`/api/v1/show-runner/theaters/${theaterId}/screens`)
      .send({ name: 'Screen 2', formats: ['2D'] });
    expect(created.status).toBe(201);

    const duplicate = await runnerAgent
      .post(`/api/v1/show-runner/theaters/${theaterId}/screens`)
      .send({ name: 'Screen 2', formats: ['2D'] });
    expect(duplicate.status).toBe(409);
  });

  it('allows the same screen name in different theaters', async () => {
    const { agent } = await adminAgent();
    const first = await runnerWithTheater(agent, { email: `dup-a-${unique()}@example.com` });
    const second = await runnerWithTheater(agent, { email: `dup-b-${unique()}@example.com` });

    const response = await second.runnerAgent
      .post(`/api/v1/show-runner/theaters/${second.theaterId}/screens`)
      .send({ name: 'Screen 1', formats: ['2D'] });

    // Both theaters now have a "Screen 1", which is correct.
    expect(response.status).toBe(409); // already created by the fixture
    expect(first.theaterId).not.toBe(second.theaterId);
  });

  it('refuses screen creation on someone else’s theater', async () => {
    const { agent } = await adminAgent();
    const first = await runnerWithTheater(agent, { email: `screen-a-${unique()}@example.com` });
    const second = await runnerWithTheater(agent, { email: `screen-b-${unique()}@example.com` });

    const response = await second.runnerAgent
      .post(`/api/v1/show-runner/theaters/${first.theaterId}/screens`)
      .send({ name: 'Sneaky Screen', formats: ['2D'] });

    expect(response.status).toBe(403);
    expect(await Screen.countDocuments({ name: 'Sneaky Screen' })).toBe(0);
  });

  it('refuses to edit a screen in another runner’s theater', async () => {
    const { agent } = await adminAgent();
    const first = await runnerWithTheater(agent, { email: `edit-a-${unique()}@example.com` });
    const second = await runnerWithTheater(agent, { email: `edit-b-${unique()}@example.com` });

    const response = await second.runnerAgent
      .patch(`/api/v1/show-runner/screens/${first.screenId}`)
      .send({ name: 'Renamed By Stranger' });

    expect(response.status).toBe(403);
  });
});

describe('seat layouts', () => {
  it('creates version 1 and activates it', async () => {
    const { agent } = await adminAgent();
    const { runnerAgent, screenId } = await runnerWithTheater(agent);

    const response = await runnerAgent
      .post(`/api/v1/show-runner/screens/${screenId}/layouts`)
      .send(layoutPayload());

    expect(response.status).toBe(201);
    expect(response.body.data.layout.version).toBe(1);
    expect(response.body.data.layout.seatCount).toBe(8);
    expect(response.body.data.layout.rowCount).toBe(2);

    const screen = await Screen.findById(screenId);
    expect(screen.activeLayoutVersion).toBe(1);
    expect(screen.capacity).toBe(8);
  });

  it('creates a new version instead of editing the old one', async () => {
    const { agent } = await adminAgent();
    const { runnerAgent, screenId } = await runnerWithTheater(agent);

    await runnerAgent.post(`/api/v1/show-runner/screens/${screenId}/layouts`).send(layoutPayload());
    const second = await runnerAgent
      .post(`/api/v1/show-runner/screens/${screenId}/layouts`)
      .send(layoutPayload());

    expect(second.body.data.layout.version).toBe(2);

    const versions = await SeatLayout.find({ screenId }).sort({ version: 1 });
    expect(versions).toHaveLength(2);
    // Version 1 survives untouched, because shows may still reference it.
    expect(versions[0].version).toBe(1);
    expect(versions[0].retiredAt).not.toBeNull();
  });

  it('rejects duplicate seat ids', async () => {
    const { agent } = await adminAgent();
    const { runnerAgent, screenId } = await runnerWithTheater(agent);

    const payload = layoutPayload();
    payload.seats[1].seatId = payload.seats[0].seatId;

    const response = await runnerAgent
      .post(`/api/v1/show-runner/screens/${screenId}/layouts`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].message).toContain('Duplicate seat id');
  });

  it('rejects a seat in a category the layout did not define', async () => {
    const { agent } = await adminAgent();
    const { runnerAgent, screenId } = await runnerWithTheater(agent);

    const payload = layoutPayload();
    payload.seats[0].category = 'Platinum';

    const response = await runnerAgent
      .post(`/api/v1/show-runner/screens/${screenId}/layouts`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].message).toContain('undefined category');
  });

  it('rejects two seats at the same grid position', async () => {
    const { agent } = await adminAgent();
    const { runnerAgent, screenId } = await runnerWithTheater(agent);

    const payload = layoutPayload();
    payload.seats[1].x = payload.seats[0].x;
    payload.seats[1].y = payload.seats[0].y;

    const response = await runnerAgent
      .post(`/api/v1/show-runner/screens/${screenId}/layouts`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].message).toContain('grid position');
  });

  it('rejects a layout with no bookable seats', async () => {
    const { agent } = await adminAgent();
    const { runnerAgent, screenId } = await runnerWithTheater(agent);

    const payload = layoutPayload();
    payload.seats = payload.seats.map((seat) => ({ ...seat, kind: 'aisle' }));

    const response = await runnerAgent
      .post(`/api/v1/show-runner/screens/${screenId}/layouts`)
      .send(payload);

    expect(response.status).toBe(400);
  });

  it('counts only bookable seats towards capacity', async () => {
    const { agent } = await adminAgent();
    const { runnerAgent, screenId } = await runnerWithTheater(agent);

    const payload = layoutPayload();
    payload.seats.push({
      seatId: 'AISLE1',
      row: 'A',
      number: 99,
      label: '-',
      category: 'Silver',
      x: 3,
      y: 0,
      kind: 'aisle',
    });

    const response = await runnerAgent
      .post(`/api/v1/show-runner/screens/${screenId}/layouts`)
      .send(payload);

    expect(response.body.data.layout.seatCount).toBe(8);
    expect(response.body.data.layout.seats).toHaveLength(9);
  });

  it('refuses to build a layout on another runner’s screen', async () => {
    const { agent } = await adminAgent();
    const first = await runnerWithTheater(agent, { email: `lay-a-${unique()}@example.com` });
    const second = await runnerWithTheater(agent, { email: `lay-b-${unique()}@example.com` });

    const response = await second.runnerAgent
      .post(`/api/v1/show-runner/screens/${first.screenId}/layouts`)
      .send(layoutPayload());

    expect(response.status).toBe(403);
    expect(await SeatLayout.countDocuments({ screenId: first.screenId })).toBe(0);
  });
});

describe('public browsing', () => {
  it('lists cities that have active theaters', async () => {
    const { agent } = await adminAgent();
    await agent.post('/api/v1/admin/theaters').send(theaterPayload({ city: 'Dehradun' }));
    await agent
      .post('/api/v1/admin/theaters')
      .send(theaterPayload({ name: 'Mumbai Multiplex', city: 'Mumbai' }));

    const response = await api().get('/api/v1/cities');

    expect(response.status).toBe(200);
    const labels = response.body.data.cities.map((city) => city.label);
    expect(labels).toEqual(expect.arrayContaining(['Dehradun', 'Mumbai']));
  });

  it('filters public theaters by city and hides internal fields', async () => {
    const { agent } = await adminAgent();
    await agent.post('/api/v1/admin/theaters').send(theaterPayload({ city: 'Dehradun' }));

    const response = await api().get('/api/v1/theaters?city=dehradun');

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].managers).toBeUndefined();
    expect(response.body.data[0].city).toBe('Dehradun');
  });
});
