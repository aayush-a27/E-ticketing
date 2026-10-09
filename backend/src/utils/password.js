import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * bcryptjs is used instead of the native bcrypt binding so the project builds
 * without a C++ toolchain. It reads and writes the same $2a$/$2b$ hashes, so
 * password hashes migrated from the legacy database keep working unchanged.
 */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * Burns roughly the same time as a real comparison so that a login against a
 * non-existent email cannot be distinguished by response time.
 */
export async function fakeVerify() {
  await bcrypt.compare(
    'timing-equalizer',
    '$2b$12$C6UzMDM.H6dfI/f/IKcEe.ZxMnPTbFTGpzZLJGkWOj2XvFNVbcVHS',
  );
  return false;
}
