import mongoose from 'mongoose';

/**
 * Replay protection for unsafe POSTs — seat holds now, payment initiation in
 * Phase 5.
 *
 * The record is inserted *before* the work runs, so a duplicate request loses
 * the race on the unique index and returns the first request's stored response
 * instead of doing the work twice. This is what makes a double-click, or a
 * mobile client retrying a request it never saw the answer to, harmless.
 */
const idempotencyKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    route: { type: String, required: true },

    /**
     * A hash of the request body. The same key sent with different parameters
     * is a client bug, and is reported rather than silently answered with the
     * earlier result.
     */
    requestHash: { type: String, required: true },

    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    statusCode: { type: Number },
    responseSnapshot: { type: mongoose.Schema.Types.Mixed },

    // Keys are only useful for as long as a client might retry.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

idempotencyKeySchema.index({ key: 1, userId: 1, route: 1 }, { unique: true });
// Housekeeping only: these records carry no inventory meaning, so letting
// MongoDB delete them on expiry is safe here.
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
