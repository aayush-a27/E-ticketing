import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    // One in-memory replica set is shared by the whole run; tests clean up
    // their own collections instead of restarting Mongo per file.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Test-only configuration. The real connection string is irrelevant here:
    // tests/setup.js connects to the in-memory replica set instead.
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/cinereserve-test',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-to-pass-validation',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-to-pass-validation',
      BCRYPT_ROUNDS: '10',
      LOG_LEVEL: 'silent',
      NOTIFICATION_TRANSPORT: 'noop',
      TICKET_TOKEN_SECRET: 'test-ticket-secret-that-is-long-enough-to-pass',
      PAYMENT_PROVIDER: 'memory',
      MEDIA_PROVIDER: 'memory',
      CORS_ORIGINS: 'http://localhost:5173',
    },
  },
});
