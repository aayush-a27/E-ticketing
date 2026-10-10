import { describe, it, expect } from 'vitest';
import {
  api,
  createShowRunner,
  createSuperAdmin,
  createUser,
  signIn,
  signInAs,
  validApplicationPayload,
} from '../helpers.js';
import { User } from '../../src/models/User.js';
import { OrganizerApplication } from '../../src/models/OrganizerApplication.js';
import { ShowRunnerProfile } from '../../src/models/ShowRunnerProfile.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import {
  APPLICATION_STATUS,
  AUDIT_ACTIONS,
  ROLES,
  SHOW_RUNNER_STATUS,
} from '../../src/constants/index.js';

async function submitApplication(agent, overrides) {
  return agent.post('/api/v1/me/organizer-applications').send(validApplicationPayload(overrides));
}

describe('submitting an application', () => {
  it('accepts a valid application from a customer', async () => {
    const customer = await createUser({ email: 'applicant@example.com' });
    const agent = await signInAs(customer);

    const response = await submitApplication(agent);

    expect(response.status).toBe(201);
    expect(response.body.data.application.status).toBe(APPLICATION_STATUS.PENDING);
  });

  it('does not change the applicant role or create a profile', async () => {
    const customer = await createUser({ email: 'stillcustomer@example.com' });
    const agent = await signInAs(customer);
    await submitApplication(agent);

    const user = await User.findById(customer.user._id);
    expect(user.role).toBe(ROLES.CUSTOMER);
    expect(await ShowRunnerProfile.findOne({ userId: user._id })).toBeNull();
  });

  it('refuses an anonymous submission', async () => {
    const response = await api()
      .post('/api/v1/me/organizer-applications')
      .send(validApplicationPayload());
    expect(response.status).toBe(401);
  });

  it('rejects a second pending application', async () => {
    const customer = await createUser({ email: 'duplicate@example.com' });
    const agent = await signInAs(customer);

    expect((await submitApplication(agent)).status).toBe(201);
    const second = await submitApplication(agent);

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DUPLICATE_APPLICATION');
    expect(await OrganizerApplication.countDocuments({})).toBe(1);
  });

  /**
   * The partial unique index, not a read-then-write check, is what makes this
   * safe. Both requests are in flight before either has committed.
   */
  it('lets only one of two simultaneous submissions through', async () => {
    const customer = await createUser({ email: 'racer@example.com' });
    const agent = await signInAs(customer);

    const results = await Promise.all([submitApplication(agent), submitApplication(agent)]);
    const statuses = results.map((result) => result.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect(await OrganizerApplication.countDocuments({})).toBe(1);
  });

  it('allows a new application after the previous one was rejected', async () => {
    const customer = await createUser({ email: 'retry@example.com' });
    const admin = await createSuperAdmin({ email: 'admin-retry@example.com' });
    const agent = await signInAs(customer);
    const adminAgent = await signInAs(admin);

    const first = await submitApplication(agent);
    await adminAgent
      .post(`/api/v1/admin/organizer-applications/${first.body.data.application._id}/reject`)
      .send({ rejectionReason: 'Incomplete ownership documents' });

    expect((await submitApplication(agent)).status).toBe(201);
  });

  it('validates the payload', async () => {
    const customer = await createUser({ email: 'invalid@example.com' });
    const agent = await signInAs(customer);

    const response = await agent
      .post('/api/v1/me/organizer-applications')
      .send(validApplicationPayload({ cities: [], businessType: 'not-a-type' }));

    expect(response.status).toBe(400);
    const fields = response.body.error.details.map((detail) => detail.field);
    expect(fields).toContain('cities');
    expect(fields).toContain('businessType');
  });

  it('lets an applicant withdraw a pending application', async () => {
    const customer = await createUser({ email: 'withdrawer@example.com' });
    const agent = await signInAs(customer);
    const created = await submitApplication(agent);

    const response = await agent.post(
      `/api/v1/me/organizer-applications/${created.body.data.application._id}/withdraw`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.application.status).toBe(APPLICATION_STATUS.WITHDRAWN);
  });

  it('does not let one applicant read another applicant’s application', async () => {
    const owner = await createUser({ email: 'owner@example.com' });
    const stranger = await createUser({ email: 'stranger@example.com' });
    const ownerAgent = await signInAs(owner);
    const strangerAgent = await signInAs(stranger);

    const created = await submitApplication(ownerAgent);
    const id = created.body.data.application._id;

    expect((await strangerAgent.get(`/api/v1/me/organizer-applications/${id}`)).status).toBe(404);
  });
});

describe('reviewing applications', () => {
  async function pendingApplication(email = 'pending@example.com') {
    const customer = await createUser({ email });
    const agent = await signInAs(customer);
    const created = await submitApplication(agent);
    return { customer, agent, id: created.body.data.application._id };
  }

  it('shows the applicant the rejection reason but never the internal notes', async () => {
    const { id, agent } = await pendingApplication('notes@example.com');
    const admin = await createSuperAdmin({ email: 'notes-admin@example.com' });
    const adminAgent = await signInAs(admin);

    const rejected = await adminAgent
      .post(`/api/v1/admin/organizer-applications/${id}/reject`)
      .send({
        rejectionReason: 'We could not verify the venue address.',
        reviewNotes: 'Internal: address looked fabricated',
      });
    expect(rejected.status).toBe(200);

    const one = await agent.get(`/api/v1/me/organizer-applications/${id}`);
    const list = await agent.get('/api/v1/me/organizer-applications');
    expect(one.status).toBe(200);
    expect(list.status).toBe(200);

    for (const application of [one.body.data.application, list.body.data.applications[0]]) {
      expect(application.rejectionReason).toBe('We could not verify the venue address.');
      expect(application).not.toHaveProperty('reviewNotes');
      expect(application).not.toHaveProperty('reviewedBy');
    }
    expect(JSON.stringify(one.body)).not.toContain('fabricated');

    // The administrator still sees them.
    const adminView = await adminAgent.get(`/api/v1/admin/organizer-applications/${id}`);
    expect(adminView.body.data.application.reviewNotes).toBe('Internal: address looked fabricated');
  });

  it('refuses review endpoints to a customer', async () => {
    const { id, agent } = await pendingApplication();

    expect((await agent.get('/api/v1/admin/organizer-applications')).status).toBe(403);
    expect(
      (await agent.post(`/api/v1/admin/organizer-applications/${id}/approve`).send({})).status,
    ).toBe(403);
  });

  it('refuses review endpoints to a show runner', async () => {
    const { id } = await pendingApplication();
    const runner = await createShowRunner({ email: 'runner-review@example.com' });
    const runnerAgent = await signInAs(runner);

    expect(
      (await runnerAgent.post(`/api/v1/admin/organizer-applications/${id}/approve`).send({}))
        .status,
    ).toBe(403);
  });

  it('refuses a self-approval', async () => {
    const { id, agent } = await pendingApplication('selfapprover@example.com');
    const response = await agent
      .post(`/api/v1/admin/organizer-applications/${id}/approve`)
      .send({});
    expect(response.status).toBe(403);
  });

  it('approves: sets the role, creates an active profile, writes the audit trail', async () => {
    const { id, customer } = await pendingApplication('approved@example.com');
    const admin = await createSuperAdmin({ email: 'approver@example.com' });
    const adminAgent = await signInAs(admin);

    const response = await adminAgent
      .post(`/api/v1/admin/organizer-applications/${id}/approve`)
      .send({ reviewNotes: 'Ownership verified' });

    expect(response.status).toBe(200);
    expect(response.body.data.application.status).toBe(APPLICATION_STATUS.APPROVED);

    const user = await User.findById(customer.user._id);
    expect(user.role).toBe(ROLES.SHOW_RUNNER);

    const profile = await ShowRunnerProfile.findOne({ userId: user._id });
    expect(profile.status).toBe(SHOW_RUNNER_STATUS.ACTIVE);
    expect(String(profile.approvedBy)).toBe(String(admin.user._id));

    const audit = await AuditLog.find({ action: AUDIT_ACTIONS.APPLICATION_APPROVED });
    expect(audit).toHaveLength(1);
    expect(String(audit[0].actorId)).toBe(String(admin.user._id));
  });

  it('rejects: records the reason and leaves the applicant a customer', async () => {
    const { id, customer } = await pendingApplication('rejected@example.com');
    const admin = await createSuperAdmin({ email: 'rejecter@example.com' });
    const adminAgent = await signInAs(admin);

    const response = await adminAgent
      .post(`/api/v1/admin/organizer-applications/${id}/reject`)
      .send({ rejectionReason: 'Could not verify the business registration' });

    expect(response.status).toBe(200);
    expect(response.body.data.application.rejectionReason).toBe(
      'Could not verify the business registration',
    );

    const user = await User.findById(customer.user._id);
    expect(user.role).toBe(ROLES.CUSTOMER);
    expect(await ShowRunnerProfile.findOne({ userId: user._id })).toBeNull();
  });

  it('requires a reason when rejecting', async () => {
    const { id } = await pendingApplication('noreason@example.com');
    const admin = await createSuperAdmin({ email: 'noreason-admin@example.com' });
    const adminAgent = await signInAs(admin);

    const response = await adminAgent
      .post(`/api/v1/admin/organizer-applications/${id}/reject`)
      .send({});
    expect(response.status).toBe(400);
  });

  it('refuses to decide an application twice', async () => {
    const { id } = await pendingApplication('twice@example.com');
    const admin = await createSuperAdmin({ email: 'twice-admin@example.com' });
    const adminAgent = await signInAs(admin);

    expect(
      (await adminAgent.post(`/api/v1/admin/organizer-applications/${id}/approve`).send({}))
        .status,
    ).toBe(200);

    const again = await adminAgent
      .post(`/api/v1/admin/organizer-applications/${id}/reject`)
      .send({ rejectionReason: 'Changed my mind after approving' });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('APPLICATION_NOT_PENDING');
  });

  /**
   * Two reviewers acting at the same moment. The status is matched inside the
   * update filter and the whole decision runs in a transaction, so the second
   * one changes nothing.
   */
  it('lets only one of two concurrent approvals win', async () => {
    const { id, customer } = await pendingApplication('concurrent@example.com');
    const adminA = await createSuperAdmin({ email: 'admin-a@example.com' });
    const adminB = await createSuperAdmin({ email: 'admin-b@example.com' });
    const agentA = await signInAs(adminA);
    const agentB = await signInAs(adminB);

    const results = await Promise.all([
      agentA.post(`/api/v1/admin/organizer-applications/${id}/approve`).send({}),
      agentB.post(`/api/v1/admin/organizer-applications/${id}/approve`).send({}),
    ]);

    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([200, 409]);

    expect(await ShowRunnerProfile.countDocuments({ userId: customer.user._id })).toBe(1);
    expect(await AuditLog.countDocuments({ action: AUDIT_ACTIONS.APPLICATION_APPROVED })).toBe(1);
  });

  it('filters the application list by status', async () => {
    await pendingApplication('list-one@example.com');
    const { id } = await pendingApplication('list-two@example.com');
    const admin = await createSuperAdmin({ email: 'lister@example.com' });
    const adminAgent = await signInAs(admin);

    await adminAgent.post(`/api/v1/admin/organizer-applications/${id}/approve`).send({});

    const pending = await adminAgent.get('/api/v1/admin/organizer-applications?status=pending');
    expect(pending.status).toBe(200);
    expect(pending.body.data).toHaveLength(1);
    expect(pending.body.pagination.total).toBe(1);

    const approved = await adminAgent.get('/api/v1/admin/organizer-applications?status=approved');
    expect(approved.body.data).toHaveLength(1);
  });
});

describe('after approval', () => {
  async function approvedRunner(email = 'newrunner@example.com') {
    const customer = await createUser({ email });
    const customerAgent = await signInAs(customer);
    const created = await submitApplication(customerAgent);

    const admin = await createSuperAdmin({ email: `admin-${email}` });
    const adminAgent = await signInAs(admin);
    await adminAgent
      .post(`/api/v1/admin/organizer-applications/${created.body.data.application._id}/approve`)
      .send({});

    return { customer, admin, adminAgent };
  }

  /** Approval bumps the token version, so the old session must be re-established. */
  it('invalidates the sessions the applicant held before approval', async () => {
    const customer = await createUser({ email: 'sessioncheck@example.com' });
    const staleAgent = await signInAs(customer);
    const created = await submitApplication(staleAgent);

    const admin = await createSuperAdmin({ email: 'session-admin@example.com' });
    const adminAgent = await signInAs(admin);
    await adminAgent
      .post(`/api/v1/admin/organizer-applications/${created.body.data.application._id}/approve`)
      .send({});

    expect((await staleAgent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('reports the show runner profile on /auth/me after signing in again', async () => {
    const { customer } = await approvedRunner('profilecheck@example.com');
    const agent = await signIn({ email: customer.user.email });

    const response = await agent.get('/api/v1/auth/me');
    expect(response.body.data.user.role).toBe(ROLES.SHOW_RUNNER);
    expect(response.body.data.showRunner).toMatchObject({
      status: SHOW_RUNNER_STATUS.ACTIVE,
      canOperate: true,
    });
  });

  it('opens the show runner namespace, still with no venue assigned', async () => {
    const { customer } = await approvedRunner('venuecheck@example.com');
    const agent = await signIn({ email: customer.user.email });

    const response = await agent.get('/api/v1/show-runner/profile');
    expect(response.status).toBe(200);
    expect(response.body.data.assignedTheaters).toEqual([]);
    expect(response.body.data.onboarding.needsTheaterAssignment).toBe(true);
  });
});
