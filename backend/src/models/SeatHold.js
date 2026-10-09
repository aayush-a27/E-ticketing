import mongoose from 'mongoose';
import { HOLD_STATUS, HOLD_STATUS_VALUES } from '../constants/index.js';

/**
 * A temporary claim on a group of seats by one customer.
 *
 * The hold is the unit of work: every seat it covers moves together, or none
 * does. Its id is written onto each ShowSeat, which is what lets a release
 * target exactly the seats this hold owns and no others.
 */
const seatHoldSchema = new mongoose.Schema(
  {
    showId: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    seatIds: { type: [String], required: true },

    status: {
      type: String,
      enum: HOLD_STATUS_VALUES,
      default: HOLD_STATUS.ACTIVE,
      required: true,
    },
    expiresAt: { type: Date, required: true },
    releasedAt: { type: Date },
    convertedAt: { type: Date },

    /**
     * The price as it stood when the seats were taken. Carried onto the
     * booking so a fee or tax change mid-checkout cannot alter what the
     * customer was quoted.
     */
    pricingSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },

    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: true },
);

seatHoldSchema.index({ userId: 1, status: 1 });
// The expiry job's query.
seatHoldSchema.index({ status: 1, expiresAt: 1 });
seatHoldSchema.index({ showId: 1, status: 1 });

seatHoldSchema.virtual('isLive').get(function isLive() {
  return this.status === HOLD_STATUS.ACTIVE && this.expiresAt > new Date();
});

seatHoldSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    showId: String(this.showId),
    seatIds: this.seatIds,
    status: this.status,
    expiresAt: this.expiresAt,
    secondsRemaining: Math.max(0, Math.round((this.expiresAt - Date.now()) / 1000)),
    pricing: this.pricingSnapshot,
  };
};

export const SeatHold = mongoose.model('SeatHold', seatHoldSchema);
