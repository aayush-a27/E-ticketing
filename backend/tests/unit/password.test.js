import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, fakeVerify } from '../../src/utils/password.js';
import { ttlToMs, createResetToken, hashResetToken } from '../../src/utils/tokens.js';

describe('password hashing', () => {
  it('produces a bcrypt hash that is not the plaintext', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain('correct-horse-battery');
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    await expect(verifyPassword('correct-horse-battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password-entirely', hash)).resolves.toBe(false);
  });

  it('salts: the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-input'), hashPassword('same-input')]);
    expect(a).not.toBe(b);
  });

  it('rejects rather than throws when no hash is stored', async () => {
    await expect(verifyPassword('anything', undefined)).resolves.toBe(false);
  });

  it('fakeVerify always returns false', async () => {
    await expect(fakeVerify()).resolves.toBe(false);
  });

  /**
   * The migration copies legacy password hashes across untouched, so this pins
   * a known-good $2b$ hash of "legacy-pass" at cost 10 — the format the old
   * native-bcrypt backend wrote. If the hashing library is ever swapped for one
   * that cannot read it, every migrated account would silently stop being able
   * to log in, and this test fails instead.
   */
  it('verifies a stored $2b$ hash from the legacy database', async () => {
    const legacyHash = '$2b$10$6cmeWzAV3CGkS.EZTh0XE.N1v8owOhgFd7uObZJKIuon/CdWEcPpe';
    await expect(verifyPassword('legacy-pass', legacyHash)).resolves.toBe(true);
    await expect(verifyPassword('not-it', legacyHash)).resolves.toBe(false);
  });
});

describe('token utilities', () => {
  it('converts TTL strings to milliseconds', () => {
    expect(ttlToMs('15m')).toBe(900_000);
    expect(ttlToMs('30d')).toBe(2_592_000_000);
    expect(ttlToMs('45s')).toBe(45_000);
    expect(ttlToMs('2h')).toBe(7_200_000);
    expect(ttlToMs('90')).toBe(90_000);
  });

  it('rejects an unsupported TTL instead of guessing', () => {
    expect(() => ttlToMs('soon')).toThrow(/Unsupported TTL/);
  });

  it('stores reset tokens only as a hash', () => {
    const { token, hash } = createResetToken();
    expect(token).toHaveLength(64);
    expect(hash).not.toBe(token);
    expect(hashResetToken(token)).toBe(hash);
  });
});
