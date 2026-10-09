/**
 * Boots an in-memory MongoDB as a single-node replica set, so transactions
 * behave in tests exactly as they do against Atlas. No external service, no
 * cost — the binary is downloaded once and cached.
 */
import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replSet.getUri(), { directConnection: true });
  // Index builds must finish before the first test relies on a unique index.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}, 120_000);

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});
