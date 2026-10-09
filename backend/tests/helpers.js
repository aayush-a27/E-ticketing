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
