/**
 * Starts a throwaway single-node MongoDB replica set and keeps it running.
 *
 *   npm run dev:db
 *
 * Seat holds and bookings need transactions, which only exist on a replica
 * set. This gives you one without installing or configuring MongoDB — the same
 * mechanism the test suite uses. Data lives in memory and is gone when the
 * process stops, so it is for local development only, never for anything you
 * want to keep.
 *
 * It prints the connection string to copy into your .env.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const PORT = Number(process.env.DEV_DB_PORT ?? 27030);
const DB_NAME = process.env.DEV_DB_NAME ?? 'cinereserve_dev';

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: PORT }],
});

const uri = replSet.getUri(DB_NAME);

console.log('\nIn-memory replica set is running.\n');
console.log('  MONGODB_URI=%s', uri);
console.log('\nData is lost when you stop this process. Ctrl+C to stop.\n');

const shutdown = async () => {
  await replSet.stop();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Keep the process alive.
setInterval(() => {}, 1 << 30);
