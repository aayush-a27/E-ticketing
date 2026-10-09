import mongoose from 'mongoose';
import { REFUND_STATUS, REFUND_STATUS_VALUES } from '../constants/index.js';

/**
 * Money going back, tracked against the payment that brought it in.
 *
 * `providerRefundId` is uniquely indexed so a retried request or a repeated
 * webhook cannot produce two refunds for one cancellation.
 */
const refundSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
    cancellationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cancellation' },

    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    provider: { type: String, default: 'razorpay' },
    providerRefundId: { type: String },

    status: {
      type: String,
      enum: REFUND_STATUS_VALUES,
      default: REFUND_STATUS.PENDING,
      required: true,
    },

    /**
     * `cancellation` — the customer cancelled.
     * `show_cancelled` — the venue cancelled the show.
     * `unfulfillable` — payment landed after the seats were gone.
     */
    reason: {
      type: String,
      enum: ['cancellation', 'show_cancelled', 'unfulfillable', 'manual'],
      required: true,
    },
    notes: { type: String, trim: true, maxlength: 1000 },

    processedAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String, trim: true, maxlength: 500 },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

refundSchema.index({ providerRefundId: 1 }, { unique: true, sparse: true });
refundSchema.index({ bookingId: 1 });
refundSchema.index({ status: 1, createdAt: 1 });

export const Refund = mongoose.model('Refund', refundSchema);
