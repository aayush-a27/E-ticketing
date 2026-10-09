import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);
// Build indexes on connect in development; in production they are created by
// `npm run ensure:indexes` so a deploy never silently blocks on an index build.
mongoose.set('autoIndex', env.NODE_ENV !== 'production');

let connectionPromise = null;

export async function connectDatabase(uri = env.MONGODB_URI) {
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 20,
    })
    .then((connection) => {
      logger.info({ db: connection.connection.name }, 'Database connected');
      return connection;
    })
    .catch((error) => {
      connectionPromise = null;
      throw error;
    });

  mongoose.connection.on('disconnected', () => {
    logger.warn('Database disconnected');
  });
  mongoose.connection.on('error', (error) => {
    logger.error({ err: error }, 'Database error');
  });

  return connectionPromise;
}

export async function disconnectDatabase() {
  connectionPromise = null;
  await mongoose.connection.close();
}

/**
 * True when the server is connected to a replica set or sharded cluster, i.e.
 * when multi-document transactions are available. Seat holds in Phase 4 depend
 * on this, so the server reports it at startup rather than failing at the first
 * booking.
 */
export async function supportsTransactions() {
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    return Boolean(info.setName || info.msg === 'isdbgrid');
  } catch {
    return false;
  }
}
