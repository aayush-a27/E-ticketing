import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { SMTPServer } from 'smtp-server';
import { api, createUser, signIn, VALID_PASSWORD } from '../helpers.js';
import { Notification } from '../../src/models/Notification.js';
import {
  createSmtpTransport,
  getTransport,
  noopTransport,
  registerTransport,
} from '../../src/services/notifications/transports.js';
import {
  deliverById,
  enqueueNotification,
  flushOutbox,
  MAX_DELIVERY_ATTEMPTS,
} from '../../src/services/notifications/notificationService.js';
import { NOTIFICATION_TYPES } from '../../src/constants/index.js';

/**
 * A real SMTP server on a local port. Messages travel over an actual SMTP
 * conversation with authentication — the same path as Gmail or Brevo, minus
 * the internet.
 */
let server;
let port;
const inbox = [];

beforeAll(async () => {
  server = new SMTPServer({
    secure: false,
    authOptional: false,
    disabledCommands: ['STARTTLS'],
    onAuth(auth, _session, callback) {
      if (auth.username === 'mailer' && auth.password === 'mail-secret') {
        return callback(null, { user: 'mailer' });
      }
      return callback(new Error('Invalid username or password'));
    },
    onData(stream, session, callback) {
      let raw = '';
      stream.on('data', (chunk) => {
        raw += chunk.toString('utf8');
      });
      stream.on('end', () => {
        inbox.push({ to: session.envelope.rcptTo.map((r) => r.address), raw });
        callback();
      });
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.server.address().port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

afterEach(() => {
  inbox.length = 0;
  // Tests swap the active transport; always put the test default back.
  registerTransport(noopTransport);
});

function useLocalSmtp(overrides = {}) {
  // The test environment's transport is 'noop'; standing the SMTP sender in
  // under that name sends everything through the local server.
  registerTransport(
    createSmtpTransport({
      name: 'noop',
      host: '127.0.0.1',
      port,
      secure: false,
      user: 'mailer',
      pass: 'mail-secret',
      from: 'CineReserve <tickets@cinereserve.test>',
      tls: { rejectUnauthorized: false },
      ...overrides,
    }),
  );
}

/** Undoes quoted-printable soft line breaks and escapes, so links read whole. */
function decode(raw) {
  return raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

describe('email over SMTP', () => {
  it('delivers a queued email to the mail server', async () => {
    useLocalSmtp();
    const queued = await enqueueNotification({
      type: NOTIFICATION_TYPES.WELCOME,
      to: 'reader@example.com',
      data: { name: 'Reader' },
    });

    const sent = await deliverById(queued._id);
    expect(sent.status).toBe('sent');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].to).toEqual(['reader@example.com']);
    const mail = decode(inbox[0].raw);
    expect(mail).toContain('Subject: Welcome to CineReserve');
    expect(mail).toContain('From: CineReserve <tickets@cinereserve.test>');
  });

  it('runs the whole forgot-password journey through real email', async () => {
    useLocalSmtp();
    const { user } = await createUser({ email: 'forgetful@example.com', name: 'Forgetful' });

    const requested = await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'forgetful@example.com' });
    expect(requested.status).toBe(200);

    await flushOutbox();
    expect(inbox).toHaveLength(1);
    const mail = decode(inbox[0].raw);
    const link = mail.match(/https?:\/\/\S+\/reset-password\?token=([A-Za-z0-9_-]+)/);
    expect(link).toBeTruthy();
    const token = link[1];

    const reset = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'a-brand-new-passphrase' });
    expect(reset.status).toBe(200);

    // The new password works, the old one does not, and the link is spent.
    await signIn({ email: user.email, password: 'a-brand-new-passphrase' });
    const old = await api()
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: VALID_PASSWORD });
    expect(old.status).toBe(401);
    const reused = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'yet-another-passphrase' });
    expect(reused.status).toBe(400);
  });

  it('sends nothing, and says the same thing, for an unknown address', async () => {
    useLocalSmtp();
    const response = await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody-here@example.com' });
    expect(response.status).toBe(200);
    expect(response.body.data.message).toMatch(/if that email is registered/i);

    await flushOutbox();
    expect(inbox).toHaveLength(0);
  });

  it('keeps a rejected email pending and retries it later', async () => {
    // Wrong password: the server refuses to accept mail from this sender.
    useLocalSmtp({ pass: 'wrong' });
    const queued = await enqueueNotification({
      type: NOTIFICATION_TYPES.WELCOME,
      to: 'retry@example.com',
      data: { name: 'Retry' },
    });

    const first = await deliverById(queued._id);
    expect(first.status).toBe('pending');
    expect(first.attempts).toBe(1);
    expect(first.lastError).toBeTruthy();
    expect(first.lockedUntil.getTime()).toBeGreaterThan(Date.now());

    // Held back during its backoff: the sweep leaves it alone.
    expect(await deliverById(queued._id)).toBeNull();

    // The credentials are fixed and the backoff has passed.
    useLocalSmtp();
    await Notification.updateOne({ _id: queued._id }, { lockedUntil: new Date(Date.now() - 1000) });
    await flushOutbox();
    const after = await Notification.findById(queued._id);
    expect(after.status).toBe('sent');
    expect(after.attempts).toBe(2);
    expect(inbox).toHaveLength(1);
  });

  it('gives up after the last attempt', async () => {
    useLocalSmtp({ pass: 'wrong' });
    const queued = await enqueueNotification({
      type: NOTIFICATION_TYPES.WELCOME,
      to: 'hopeless@example.com',
      data: { name: 'Hopeless' },
    });

    for (let attempt = 0; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      await Notification.updateOne({ _id: queued._id }, { lockedUntil: null });
      await deliverById(queued._id);
    }
    const final = await Notification.findById(queued._id);
    expect(final.status).toBe('failed');
    expect(final.attempts).toBe(MAX_DELIVERY_ATTEMPTS);
  });

  it('sends an email once even when two senders reach it together', async () => {
    let sends = 0;
    registerTransport({
      name: 'noop',
      async send() {
        sends += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
    });
    const queued = await enqueueNotification({
      type: NOTIFICATION_TYPES.WELCOME,
      to: 'once@example.com',
      data: { name: 'Once' },
    });

    await Promise.all([deliverById(queued._id), deliverById(queued._id), flushOutbox()]);
    expect(sends).toBe(1);
    expect(getTransport('noop')).toBeTruthy();
  });
});
