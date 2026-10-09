import { describe, it, expect } from 'vitest';
import { api, createUser, signIn, VALID_PASSWORD } from '../helpers.js';
import { User } from '../../src/models/User.js';
import { Notification } from '../../src/models/Notification.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { ACCOUNT_STATUS, AUDIT_ACTIONS, ROLES } from '../../src/constants/index.js';

const registration = {
  name: 'Ria Kapoor',
  email: 'ria@example.com',
  password: VALID_PASSWORD,
};

describe('POST /api/v1/auth/register', () => {
  it('creates an active customer and starts a session', async () => {
    const response = await api().post('/api/v1/auth/register').send(registration);

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      email: 'ria@example.com',
      role: ROLES.CUSTOMER,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
    });

    const cookies = response.headers['set-cookie'].join(';');
    expect(cookies).toContain('cr_at=');
    expect(cookies).toContain('cr_rt=');
    expect(cookies).toContain('HttpOnly');
  });

  it('never returns the password hash', async () => {
    const response = await api().post('/api/v1/auth/register').send(registration);
    expect(JSON.stringify(response.body)).not.toContain('$2');
    expect(response.body.data.user.passwordHash).toBeUndefined();
  });

  /** The central privilege-escalation guard. */
  it('ignores a role sent in the registration payload', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ ...registration, role: ROLES.SUPER_ADMIN, accountStatus: 'active' });

    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe(ROLES.CUSTOMER);

    const stored = await User.findOne({ email: registration.email });
    expect(stored.role).toBe(ROLES.CUSTOMER);
  });

  it('ignores an injected tokenVersion', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ ...registration, tokenVersion: 99 });
    const stored = await User.findOne({ email: registration.email });
    expect(stored.tokenVersion).toBe(0);
  });

  it('rejects a duplicate email with a stable code', async () => {
    await api().post('/api/v1/auth/register').send(registration);
    const response = await api().post('/api/v1/auth/register').send(registration);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('normalizes the email to lowercase', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ ...registration, email: 'RIA@Example.COM' });
    expect(await User.findOne({ email: 'ria@example.com' })).not.toBeNull();
  });

  it('rejects a short password and a malformed email', async () => {
    const short = await api()
      .post('/api/v1/auth/register')
      .send({ ...registration, password: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe('VALIDATION_FAILED');
    expect(short.body.error.details[0].field).toBe('password');

    const bad = await api()
      .post('/api/v1/auth/register')
      .send({ ...registration, email: 'not-an-email' });
    expect(bad.status).toBe(400);
  });

  it('queues a welcome notification and writes an audit entry', async () => {
    await api().post('/api/v1/auth/register').send(registration);

    const notification = await Notification.findOne({ to: registration.email });
    expect(notification?.type).toBe('welcome');

    const audit = await AuditLog.findOne({ action: AUDIT_ACTIONS.USER_REGISTERED });
    expect(audit).not.toBeNull();
  });
});

describe('POST /api/v1/auth/login', () => {
  it('signs in with the right password', async () => {
    const { user } = await createUser({ email: 'login@example.com' });
    const response = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: VALID_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('login@example.com');
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await createUser({ email: 'real@example.com' });

    const wrongPassword = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'real@example.com', password: 'definitely-not-right' });
    const unknownUser = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@example.com', password: 'definitely-not-right' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses a suspended account', async () => {
    const { user } = await createUser({
      email: 'suspended@example.com',
      accountStatus: ACCOUNT_STATUS.SUSPENDED,
    });

    const response = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: VALID_PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('session lifecycle', () => {
  it('GET /auth/me needs a session', async () => {
    const response = await api().get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /auth/me returns the signed-in user', async () => {
    const { user } = await createUser({ email: 'me@example.com' });
    const agent = await signIn({ email: user.email });

    const response = await agent.get('/api/v1/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('me@example.com');
    expect(response.body.data.showRunner).toBeNull();
  });

  it('refuses a session whose token version is stale', async () => {
    const { user } = await createUser({ email: 'stale@example.com' });
    const agent = await signIn({ email: user.email });

    // Simulates a suspension, password change or logout-all elsewhere.
    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });

    const response = await agent.get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_INVALID');
  });

  it('stops an existing session the moment the account is suspended', async () => {
    const { user } = await createUser({ email: 'tosuspend@example.com' });
    const agent = await signIn({ email: user.email });
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);

    await User.updateOne(
      { _id: user._id },
      { accountStatus: ACCOUNT_STATUS.SUSPENDED },
    );

    const response = await agent.get('/api/v1/auth/me');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('refreshes a session and clears cookies on logout', async () => {
    const { user } = await createUser({ email: 'refresh@example.com' });
    const agent = await signIn({ email: user.email });

    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(200);

    const loggedOut = await agent.post('/api/v1/auth/logout');
    expect(loggedOut.status).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('rejects a forged token', async () => {
    const response = await api()
      .get('/api/v1/auth/me')
      .set('Cookie', ['cr_at=not.a.real.token']);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('password management', () => {
  it('changes a password and invalidates other sessions', async () => {
    const { user } = await createUser({ email: 'changer@example.com' });
    const firstDevice = await signIn({ email: user.email });
    const secondDevice = await signIn({ email: user.email });

    const response = await firstDevice
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: VALID_PASSWORD, newPassword: 'a-brand-new-password' });
    expect(response.status).toBe(200);

    // The device that made the change keeps working; the other is signed out.
    expect((await firstDevice.get('/api/v1/auth/me')).status).toBe(200);
    expect((await secondDevice.get('/api/v1/auth/me')).status).toBe(401);

    const relogin = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'a-brand-new-password' });
    expect(relogin.status).toBe(200);
  });

  it('refuses a password change when the current password is wrong', async () => {
    const { user } = await createUser({ email: 'wrongcurrent@example.com' });
    const agent = await signIn({ email: user.email });

    const response = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'not-the-password', newPassword: 'a-brand-new-password' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('does not reveal whether an address is registered', async () => {
    await createUser({ email: 'known@example.com' });

    const known = await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'known@example.com' });
    const unknown = await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it('resets a password with a valid token and refuses to reuse it', async () => {
    const { user } = await createUser({ email: 'reset@example.com' });
    await api().post('/api/v1/auth/forgot-password').send({ email: user.email });

    const notification = await Notification.findOne({
      to: user.email,
      type: 'password_reset',
    });
    const token = notification.payload.token;

    const first = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'another-good-password' });
    expect(first.status).toBe(200);

    const second = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'yet-another-password' });
    expect(second.status).toBe(400);

    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'another-good-password' });
    expect(login.status).toBe(200);
  });
});

describe('profile updates', () => {
  it('updates only the fields it is allowed to', async () => {
    const { user } = await createUser({ email: 'profile@example.com' });
    const agent = await signIn({ email: user.email });

    const response = await agent
      .patch('/api/v1/auth/me')
      .send({ name: 'New Name', preferredCity: 'Mumbai', role: ROLES.SUPER_ADMIN });

    expect(response.status).toBe(200);
    expect(response.body.data.user.name).toBe('New Name');
    expect(response.body.data.user.role).toBe(ROLES.CUSTOMER);

    const stored = await User.findById(user._id);
    expect(stored.role).toBe(ROLES.CUSTOMER);
    expect(stored.preferredCity).toBe('Mumbai');
  });
});
