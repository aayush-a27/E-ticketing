import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { ShowRunnerProfile } from '../src/models/ShowRunnerProfile.js';
import { hashPassword } from '../src/utils/password.js';
import { ACCOUNT_STATUS, ROLES, SHOW_RUNNER_STATUS } from '../src/constants/index.js';

export const app = createApp();
export const api = () => request(app);

export const VALID_PASSWORD = 'correct-horse-battery';

/** Creates a user directly, bypassing HTTP — for arranging test state. */
export async function createUser({
  name = 'Test User',
  email = `user-${Math.random().toString(36).slice(2, 10)}@example.com`,
  password = VALID_PASSWORD,
  role = ROLES.CUSTOMER,
  accountStatus = ACCOUNT_STATUS.ACTIVE,
} = {}) {
  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    role,
    accountStatus,
  });
  return { user, password };
}

export async function createShowRunner({
  status = SHOW_RUNNER_STATUS.ACTIVE,
  businessName = 'Test Cinemas',
  ...userOptions
} = {}) {
  const { user, password } = await createUser({ ...userOptions, role: ROLES.SHOW_RUNNER });
  const profile = await ShowRunnerProfile.create({
    userId: user._id,
    businessName,
    status,
    approvedAt: new Date(),
  });
  return { user, profile, password };
}

export async function createSuperAdmin(options = {}) {
  return createUser({ ...options, role: ROLES.SUPER_ADMIN });
}

/**
 * Logs in over HTTP and returns an agent that carries the session cookies, so
 * tests exercise the same cookie path a browser does.
 */
export async function signIn({ email, password = VALID_PASSWORD }) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Sign-in failed (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return agent;
}

export async function signInAs(userFactoryResult) {
  return signIn({ email: userFactoryResult.user.email, password: userFactoryResult.password });
}

/** A small layout: 2 rows x 4 seats, two categories, with one aisle column. */
export function layoutPayload(overrides = {}) {
  const seats = [];
  for (const [rowIndex, row] of ['A', 'B'].entries()) {
    for (let number = 1; number <= 4; number += 1) {
      seats.push({
        seatId: `${row}${number}`,
        row,
        number,
        label: `${row}${number}`,
        category: row === 'A' ? 'Silver' : 'Gold',
        x: number <= 2 ? number : number + 1, // gap at x=3
        y: rowIndex,
      });
    }
  }
  return {
    categories: [
      { name: 'Silver', displayOrder: 1 },
      { name: 'Gold', displayOrder: 2 },
    ],
    seats,
    activate: true,
    ...overrides,
  };
}

/** 4 rows x 6 seats, for tests that need more than the 8-seat default. */
export function bigLayoutPayload(overrides = {}) {
  const seats = [];
  for (const [rowIndex, row] of ['A', 'B', 'C', 'D'].entries()) {
    for (let number = 1; number <= 6; number += 1) {
      seats.push({
        seatId: `${row}${number}`,
        row,
        number,
        label: `${row}${number}`,
        category: rowIndex < 2 ? 'Silver' : 'Gold',
        x: number,
        y: rowIndex,
      });
    }
  }
  return {
    categories: [
      { name: 'Silver', displayOrder: 1 },
      { name: 'Gold', displayOrder: 2 },
    ],
    seats,
    activate: true,
    ...overrides,
  };
}

export function moviePayload(overrides = {}) {
  return {
    title: 'The Long Afternoon',
    synopsis: 'A quiet film about a city, a train and the people who miss it every morning.',
    languages: ['Hindi', 'English'],
    releaseDate: '2026-09-01',
    runtimeMinutes: 120,
    certification: 'UA',
    genres: ['Drama'],
    ...overrides,
  };
}

export function theaterPayload(overrides = {}) {
  return {
    name: 'Nova Cinemas Rajpur Road',
    addressLine1: '12 Rajpur Road',
    city: 'Dehradun',
    state: 'Uttarakhand',
    pincode: '248001',
    amenities: ['Parking', 'Cafe'],
    ...overrides,
  };
}

/** A start time safely in the future, to avoid "must start in the future". */
export function futureDate(hoursFromNow = 48) {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

export function showPayload({ movieId, screenId, ...overrides } = {}) {
  return {
    movieId,
    screenId,
    startAt: futureDate(48),
    language: 'Hindi',
    format: '2D',
    pricing: [
      { category: 'Silver', basePaise: 15_000 },
      { category: 'Gold', basePaise: 25_000 },
    ],
    ...overrides,
  };
}

/**
 * Builds a published movie, a theater managed by `managerId`, a screen with an
 * active layout, and returns the ids — the starting point for most show tests.
 */
export async function seedVenue(
  adminAgent,
  { managerId = null, city = 'Dehradun', layout = null } = {},
) {
  const movieResponse = await adminAgent.post('/api/v1/admin/movies').send(moviePayload());
  const movieId = movieResponse.body.data.movie._id;

  const { memoryProvider } = await import('../src/services/media/providers.js');
  const asset = memoryProvider.__seed(`poster-${movieId}`);
  await adminAgent
    .post(`/api/v1/admin/movies/${movieId}/media`)
    .send({ kind: 'poster', publicId: asset.publicId });
  await adminAgent.post(`/api/v1/admin/movies/${movieId}/publish`).send({});

  const theaterResponse = await adminAgent
    .post('/api/v1/admin/theaters')
    .send(theaterPayload({ city, managerIds: managerId ? [String(managerId)] : [] }));
  const theaterId = theaterResponse.body.data.theater._id;

  const screenResponse = await adminAgent
    .post(`/api/v1/admin/theaters/${theaterId}/screens`)
    .send({ name: 'Screen 1', formats: ['2D', '3D'] });
  const screenId = screenResponse.body.data.screen._id;

  await adminAgent
    .post(`/api/v1/admin/screens/${screenId}/layouts`)
    .send(layout ?? layoutPayload());

  return { movieId, theaterId, screenId };
}

export function validApplicationPayload(overrides = {}) {
  return {
    contactName: 'Asha Menon',
    contactEmail: 'asha@novacinemas.example',
    contactPhone: '+91 98765 43210',
    businessName: 'Nova Cinemas',
    businessType: 'multiplex',
    cities: ['Dehradun'],
    proposedTheater: {
      name: 'Nova Cinemas Rajpur Road',
      addressLine1: '12 Rajpur Road',
      city: 'Dehradun',
      state: 'Uttarakhand',
      pincode: '248001',
      screenCount: 4,
    },
    ...overrides,
  };
}

/**
 * Moves a booking's showtime so it starts `minutesFromNow` from now, which puts
 * it inside the gate's entry window. Tests that scan tickets need this: shows
 * are scheduled days ahead, and the gate rightly refuses a ticket for another
 * day.
 */
export async function startShowSoon(bookingId, { minutesFromNow = 30, runMinutes = 150 } = {}) {
  const { Booking } = await import('../src/models/Booking.js');
  const startAt = new Date(Date.now() + minutesFromNow * 60_000);
  const endAt = new Date(startAt.getTime() + runMinutes * 60_000);
  await Booking.updateOne(
    { _id: bookingId },
    { $set: { 'snapshot.startAt': startAt, 'snapshot.endAt': endAt } },
  );
  return { startAt, endAt };
}
