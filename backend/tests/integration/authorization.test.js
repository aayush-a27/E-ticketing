import { describe, it, expect } from 'vitest';
import {
  api,
  createShowRunner,
  createSuperAdmin,
  createUser,
  signIn,
  signInAs,
} from '../helpers.js';
import { User } from '../../src/models/User.js';
import { ShowRunnerProfile } from '../../src/models/ShowRunnerProfile.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { ACCOUNT_STATUS, ROLES, SHOW_RUNNER_STATUS } from '../../src/constants/index.js';

describe('role gates on the admin namespace', () => {
  const adminRoutes = [
    ['get', '/api/v1/admin/organizer-applications'],
    ['get', '/api/v1/admin/users'],
    ['get', '/api/v1/admin/show-runners'],
    ['get', '/api/v1/admin/audit-logs'],
  ];

  it('refuses anonymous callers with 401', async () => {
    for (const [method, path] of adminRoutes) {
      const response = await api()[method](path);
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('refuses customers with 403', async () => {
    const customer = await createUser({ email: 'nosy-customer@example.com' });
    const agent = await signInAs(customer);

    for (const [method, path] of adminRoutes) {
      const response = await agent[method](path);
      expect(response.status, `${method} ${path}`).toBe(403);
    }
  });

  it('refuses show runners with 403', async () => {
    const runner = await createShowRunner({ email: 'nosy-runner@example.com' });
    const agent = await signInAs(runner);

    for (const [method, path] of adminRoutes) {
      const response = await agent[method](path);
      expect(response.status, `${method} ${path}`).toBe(403);
    }
  });

  it('admits the super admin', async () => {
    const admin = await createSuperAdmin({ email: 'rightful-admin@example.com' });
    const agent = await signInAs(admin);

    for (const [method, path] of adminRoutes) {
      const response = await agent[method](path);
      expect(response.status, `${method} ${path}`).toBe(200);
    }
  });
});

describe('show runner gates', () => {
  it('refuses a plain customer', async () => {
    const customer = await createUser({ email: 'plain@example.com' });
    const agent = await signInAs(customer);

    const response = await agent.get('/api/v1/show-runner/profile');
    expect(response.status).toBe(403);
  });

  /** Gate 3: holding the role is not enough, the profile must be active. */
  it('refuses a suspended show runner even though the role is intact', async () => {
    const runner = await createShowRunner({
      email: 'suspended-runner@example.com',
      status: SHOW_RUNNER_STATUS.SUSPENDED,
    });
    const agent = await signInAs(runner);

    const response = await agent.get('/api/v1/show-runner/profile');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SHOW_RUNNER_NOT_ACTIVE');
  });

  it('refuses a user who holds the role but has no profile at all', async () => {
    const { user } = await createUser({
      email: 'roleonly@example.com',
      role: ROLES.SHOW_RUNNER,
    });
    const agent = await signIn({ email: user.email });

    const response = await agent.get('/api/v1/show-runner/profile');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('SHOW_RUNNER_NOT_ACTIVE');
  });

  it('admits an active show runner', async () => {
    const runner = await createShowRunner({ email: 'active-runner@example.com' });
    const agent = await signInAs(runner);

    expect((await agent.get('/api/v1/show-runner/profile')).status).toBe(200);
  });
});

describe('admin user and show runner management', () => {
  it('suspends an account and kills its live session immediately', async () => {
    const customer = await createUser({ email: 'target@example.com' });
    const admin = await createSuperAdmin({ email: 'suspender@example.com' });
    const customerAgent = await signInAs(customer);
    const adminAgent = await signInAs(admin);

    expect((await customerAgent.get('/api/v1/auth/me')).status).toBe(200);

    const response = await adminAgent
      .patch(`/api/v1/admin/users/${customer.user._id}/status`)
      .send({ accountStatus: ACCOUNT_STATUS.SUSPENDED, reason: 'Chargeback fraud' });

    expect(response.status).toBe(200);
    const blocked = await customerAgent.get('/api/v1/auth/me');
    expect([401, 403]).toContain(blocked.status);
  });

  it('requires a reason for a status change and records it', async () => {
    const customer = await createUser({ email: 'reasoned@example.com' });
    const admin = await createSuperAdmin({ email: 'reason-admin@example.com' });
    const adminAgent = await signInAs(admin);

    const missing = await adminAgent
      .patch(`/api/v1/admin/users/${customer.user._id}/status`)
      .send({ accountStatus: ACCOUNT_STATUS.SUSPENDED });
    expect(missing.status).toBe(400);

    await adminAgent
      .patch(`/api/v1/admin/users/${customer.user._id}/status`)
      .send({ accountStatus: ACCOUNT_STATUS.SUSPENDED, reason: 'Policy violation 4.2' });

    const audit = await AuditLog.findOne({ action: 'user.status_changed' });
    expect(audit.reason).toBe('Policy violation 4.2');
    expect(audit.before.accountStatus).toBe(ACCOUNT_STATUS.ACTIVE);
    expect(audit.after.accountStatus).toBe(ACCOUNT_STATUS.SUSPENDED);
  });

  it('refuses to let an admin change their own status', async () => {
    const admin = await createSuperAdmin({ email: 'selfharm@example.com' });
    const agent = await signInAs(admin);

    const response = await agent
      .patch(`/api/v1/admin/users/${admin.user._id}/status`)
      .send({ accountStatus: ACCOUNT_STATUS.SUSPENDED, reason: 'Testing the guard' });

    expect(response.status).toBe(400);
  });

  it('refuses to suspend another super admin through the API', async () => {
    const adminA = await createSuperAdmin({ email: 'admin-one@example.com' });
    const adminB = await createSuperAdmin({ email: 'admin-two@example.com' });
    const agent = await signInAs(adminA);

    const response = await agent
      .patch(`/api/v1/admin/users/${adminB.user._id}/status`)
      .send({ accountStatus: ACCOUNT_STATUS.SUSPENDED, reason: 'Internal dispute' });

    expect(response.status).toBe(403);
  });

  it('suspends show runner access without touching the customer account', async () => {
    const runner = await createShowRunner({ email: 'tosuspend-runner@example.com' });
    const admin = await createSuperAdmin({ email: 'runner-admin@example.com' });
    const adminAgent = await signInAs(admin);

    const response = await adminAgent
      .patch(`/api/v1/admin/show-runners/${runner.user._id}/status`)
      .send({ status: SHOW_RUNNER_STATUS.SUSPENDED, reason: 'Repeated no-show screenings' });
    expect(response.status).toBe(200);

    const user = await User.findById(runner.user._id);
    expect(user.accountStatus).toBe(ACCOUNT_STATUS.ACTIVE);
    expect(user.role).toBe(ROLES.SHOW_RUNNER);

    // Can still sign in and browse, but cannot operate.
    const agent = await signIn({ email: runner.user.email });
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await agent.get('/api/v1/show-runner/profile')).status).toBe(403);
  });

  it('revoking drops the role back to customer', async () => {
    const runner = await createShowRunner({ email: 'torevoke@example.com' });
    const admin = await createSuperAdmin({ email: 'revoker@example.com' });
    const adminAgent = await signInAs(admin);

    await adminAgent
      .patch(`/api/v1/admin/show-runners/${runner.user._id}/status`)
      .send({ status: SHOW_RUNNER_STATUS.REVOKED, reason: 'Venue permanently closed' });

    const user = await User.findById(runner.user._id);
    expect(user.role).toBe(ROLES.CUSTOMER);

    const profile = await ShowRunnerProfile.findOne({ userId: runner.user._id });
    expect(profile.status).toBe(SHOW_RUNNER_STATUS.REVOKED);
    expect(profile.revokedAt).toBeInstanceOf(Date);
  });

  it('reinstates a suspended runner', async () => {
    const runner = await createShowRunner({
      email: 'reinstate@example.com',
      status: SHOW_RUNNER_STATUS.SUSPENDED,
    });
    const admin = await createSuperAdmin({ email: 'reinstater@example.com' });
    const adminAgent = await signInAs(admin);

    await adminAgent
      .patch(`/api/v1/admin/show-runners/${runner.user._id}/status`)
      .send({ status: SHOW_RUNNER_STATUS.ACTIVE, reason: 'Appeal upheld' });

    const agent = await signIn({ email: runner.user.email });
    expect((await agent.get('/api/v1/show-runner/profile')).status).toBe(200);
  });
});

describe('input handling', () => {
  it('rejects a malformed object id rather than crashing', async () => {
    const admin = await createSuperAdmin({ email: 'casting@example.com' });
    const agent = await signInAs(admin);

    const response = await agent.get('/api/v1/admin/users/not-an-id');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  /** Query values are parsed by zod, so operator objects never reach Mongo. */
  it('ignores an injected query operator', async () => {
    const admin = await createSuperAdmin({ email: 'injection@example.com' });
    await createUser({ email: 'victim@example.com' });
    const agent = await signInAs(admin);

    const response = await agent.get('/api/v1/admin/users?role[$ne]=nonsense');
    expect(response.status).toBe(400);
  });

  it('returns a structured 404 for an unknown route', async () => {
    const response = await api().get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('reports database health', async () => {
    const response = await api().get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.database).toBe('connected');
  });
});
