import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanish = z
  .string()
  .transform((value) => value.toLowerCase() === 'true')
  .pipe(z.boolean());

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  LEGACY_MONGODB_URI: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: booleanish.default('false'),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),

  CORS_ORIGINS: csv.default('http://localhost:5173'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_PUBLIC_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_SENSITIVE_MAX: z.coerce.number().int().positive().default(30),
  // Gate scanning is a burst by nature: a venue admits its whole audience in
  // the half hour before a show. The sensitive limit would lock door staff out
  // after thirty tickets. Tokens are HMAC-signed, so a high limit gives a
  // guesser nothing to work with.
  RATE_LIMIT_GATE_MAX: z.coerce.number().int().positive().default(600),

  // How early before the show a ticket may be admitted. Outside the window
  // the scan is refused and the ticket is NOT marked used, so a ticket for
  // another day cannot be burned by scanning it today.
  GATE_OPENS_MINUTES_BEFORE: z.coerce.number().int().min(0).max(1440).default(90),

  // `console` prints emails to the server log, which is enough for local
  // development. `smtp` sends them for real through any SMTP account — Gmail
  // with an app password and Brevo's free tier both work, at no cost.
  NOTIFICATION_TRANSPORT: z.enum(['console', 'noop', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // true for port 465 (TLS from the start); false for 587 (STARTTLS).
  SMTP_SECURE: booleanish.default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // The From address, e.g. "CineReserve <you@gmail.com>". Most providers
  // require it to be an address the account is allowed to send as.
  SMTP_FROM: z.string().optional(),
  // Send each email the moment it is queued, rather than waiting for the next
  // outbox sweep. The sweep still retries anything that fails.
  NOTIFICATION_DELIVER_IMMEDIATELY: booleanish.default('true'),
  APP_PUBLIC_URL: z.string().default('http://localhost:5173'),

  // Image storage. `memory` keeps the project runnable with no account and no
  // cost; `cloudinary` needs all three credentials below.
  MEDIA_PROVIDER: z.enum(['cloudinary', 'memory']).default('memory'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // How often lapsed seat holds are swept up. Shorter makes the seat map
  // fresher; correctness does not depend on it, because an expired hold is
  // reclaimed on sight by the next customer who wants the seat.
  SEAT_HOLD_SWEEP_INTERVAL_MS: z.coerce.number().int().min(5_000).max(300_000).default(30_000),
  RECONCILE_INTERVAL_MS: z.coerce.number().int().min(10_000).max(900_000).default(60_000),

  // Payments. `memory` simulates the gateway locally and in tests, so the
  // project runs with no Razorpay account; `razorpay` needs the three below.
  PAYMENT_PROVIDER: z.enum(['razorpay', 'memory']).default('memory'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Signs QR ticket tokens. Separate from the auth secrets so a ticket token
  // can never be mistaken for a session.
  TICKET_TOKEN_SECRET: z.string().min(32, 'TICKET_TOKEN_SECRET must be at least 32 characters'),

  // Read only by scripts/bootstrapSuperAdmin.js, which prompts when they are
  // absent. Never referenced by the running server.
  SUPER_ADMIN_EMAIL: z.string().optional(),
  SUPER_ADMIN_PASSWORD: z.string().optional(),
  SUPER_ADMIN_NAME: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

/**
 * A provider switched on without its credentials fails at start-up with a
 * message naming what is missing, rather than at the first payment or upload.
 */
const configured = schema.superRefine((value, ctx) => {
  const need = (condition, keys) => {
    if (!condition) return;
    for (const key of keys) {
      if (!value[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required` });
      }
    }
  };
  need(value.PAYMENT_PROVIDER === 'razorpay', ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']);
  need(value.MEDIA_PROVIDER === 'cloudinary', [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ]);
  need(value.NOTIFICATION_TRANSPORT === 'smtp', ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']);
  if (value.RAZORPAY_KEY_ID && !/^rzp_(test|live)_/.test(value.RAZORPAY_KEY_ID)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RAZORPAY_KEY_ID'],
      message: 'A Razorpay key id starts with rzp_test_ or rzp_live_',
    });
  }
});

const parsed = configured.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // Fail loudly and early: a half-configured server is worse than no server.
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * Cookie options shared by every auth cookie. SameSite=none requires Secure,
 * which is exactly the configuration needed when the frontends live on a
 * different origin than the API.
 */
export function cookieOptions(maxAgeMs) {
  const options = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/',
  };
  if (env.COOKIE_DOMAIN) options.domain = env.COOKIE_DOMAIN;
  if (maxAgeMs) options.maxAge = maxAgeMs;
  return options;
}
