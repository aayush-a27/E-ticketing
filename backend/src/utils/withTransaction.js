import mongoose from 'mongoose';
import { logger } from './logger.js';
import { supportsTransactions } from '../config/database.js';

let transactionSupport = null;
let warned = false;

export async function transactionsAvailable() {
  if (transactionSupport === null) transactionSupport = await supportsTransactions();
  return transactionSupport;
}

/** Test helper: forget the cached probe result. */
export function resetTransactionSupportCache() {
  transactionSupport = null;
  warned = false;
}

/**
 * Runs `fn(session)` inside a transaction. session.withTransaction retries
 * automatically on TransientTransactionError, which is how concurrent writes to
 * the same document resolve into one winner and one clean retry.
 *
 * On a standalone mongod (no replica set) transactions do not exist. Rather
 * than refuse to start, the work runs without a session and a warning is
 * logged once — fine for trying the app locally, not fine for production. Seat
 * holds in Phase 4 require `required: true` and fail loudly instead, because
 * there the atomicity is the feature.
 */
export async function withTransaction(fn, { required = false } = {}) {
  const available = await transactionsAvailable();

  if (!available) {
    if (required) {
      throw new Error(
        'This operation requires MongoDB transactions. Connect to a replica set ' +
          '(Atlas, or locally: mongod --replSet rs0 then rs.initiate()).',
      );
    }
    if (!warned) {
      warned = true;
      logger.warn(
        'MongoDB is not running as a replica set: multi-document writes are NOT atomic. ' +
          'Use a replica set before relying on this server.',
      );
    }
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Spreads `{ session }` into a query only when there is one. */
export function withSession(session) {
  return session ? { session } : {};
}
