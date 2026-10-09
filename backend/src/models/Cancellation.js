import mongoose from 'mongoose';
import { CANCELLATION_STATUS, CANCELLATION_STATUS_VALUES } from '../constants/index.js';

/**
 * A request to cancel, and what was decided.
 *
 * Deliberately separate from Refund. Cancelling releases seats and settles
 * entitlement; refunding moves money through the gateway. One can succeed while
 * the other is still in flight, and conflating them loses that distinction.
 */
const cancellationSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Empty means the whole booking; otherwise a partial cancellation.
    seatIds: { type: [String], default: [] },
    isPartial: { type: Boolean, default: false },

    status: {
      type: String,
      enum: CANCELLATION_STATUS_VALUES,
      default: CANCELLATION_STATUS.REQUESTED,
      required: true,
    },

    /** The rule that applied, recorded so a decision can be explained later. */
    policyApplied: {
      label: { type: String },
      minHoursBeforeShow: { type: Number },
      refundPercentBasisPoints: { type: Number },
      refundFees: { type: Boolean },
      withinGraceWindow: { type: Boolean },
      hoursBeforeShow: { type: Number },
    },

    cancelledSeatsValuePaise: { type: Number, default: 0 },
    refundablePaise: { type: Number, default: 0 },
    refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Refund' },

    reason: { type: String, trim: true, maxlength: 1000 },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);

cancellationSchema.index({ bookingId: 1, status: 1 });
cancellationSchema.index({ requestedBy: 1, createdAt: -1 });

export const Cancellation = mongoose.model('Cancellation', cancellationSchema);
