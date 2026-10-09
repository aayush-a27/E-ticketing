import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { transactionsAvailable, withTransaction } from '../../src/utils/withTransaction.js';
import { User } from '../../src/models/User.js';

/**
 * The approval workflow, and every seat hold from Phase 4 onward, depends on
 * real multi-document transactions. withTransaction falls back to running
 * without a session on a standalone mongod — useful locally, useless as a test
 * of atomicity. This file fails the suite if that fallback is ever what the
 * concurrency tests are actually exercising.
 */
describe('transaction support in the test environment', () => {
  it('is connected to a replica set', async () => {
    await expect(transactionsAvailable()).resolves.toBe(true);
  });

  it('rolls every write back when the transaction throws', async () => {
    const before = await User.countDocuments({});

    await expect(
      withTransaction(async (session) => {
        expect(session).not.toBeNull();
        await User.create(
          [{ name: 'Rolled Back', email: 'rollback@example.com', passwordHash: 'x' }],
          { session },
        );
        // The write is visible inside the transaction...
        await expect(
          User.countDocuments({ email: 'rollback@example.com' }).session(session),
        ).resolves.toBe(1);
        throw new Error('deliberate failure');
      }),
    ).rejects.toThrow('deliberate failure');

    // ...and gone once it aborts.
    await expect(User.countDocuments({})).resolves.toBe(before);
    await expect(User.countDocuments({ email: 'rollback@example.com' })).resolves.toBe(0);
  });

  it('commits every write when the transaction succeeds', async () => {
    await withTransaction(async (session) => {
      await User.create(
        [{ name: 'Committed', email: 'committed@example.com', passwordHash: 'x' }],
        { session },
      );
    });

    await expect(User.countDocuments({ email: 'committed@example.com' })).resolves.toBe(1);
  });

  it('reports a replica set through the driver', async () => {
    const info = await mongoose.connection.db.admin().command({ hello: 1 });
    expect(info.setName).toBeTruthy();
  });
});
