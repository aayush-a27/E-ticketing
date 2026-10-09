import mongoose from 'mongoose';
import { PAYMENT_ATTEMPT_STATUS, PAYMENT_ATTEMPT_STATUS_VALUES } from '../constants/index.js';

/**
 * One attempt to pay for one booking. A booking may have several — a failed
 * card, then a successful one — and every attempt is kept, because financial
 * history is never rewritten.
 */
const paymentSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    provider: { type: String, default: 'razorpay' },
    orderId: { type: String, required: true },
    // Only exists once the gateway has actually taken money.
    providerPaymentId: { type: String },

    /** Computed server-side from the show's price table. Never client-supplied. */
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: PAYMENT_ATTEMPT_STATUS_VALUES,
      default: PAYMENT_ATTEMPT_STATUS.CREATED,
      required: true,
    },

    /**
     * True only after the server has checked the gateway's signature. A
     * booking is never confirmed on a browser callback alone.
     */
    signatureVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    capturedAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String, trim: true, maxlength: 500 },

    /** Which path proved the payment: the browser callback or the webhook. */
    confirmedVia: { type: String, enum: ['verify', 'webhook'], default: null },

    method: { type: String },
    refundedPaise: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

paymentSchema.index({ orderId: 1 }, { unique: true });
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });
paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: 1 });

paymentSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    orderId: this.orderId,
    amountPaise: this.amountPaise,
    currency: this.currency,
    status: this.status,
    method: this.method ?? null,
    refundedPaise: this.refundedPaise,
    createdAt: this.createdAt,
  };
};

export const Payment = mongoose.model('Payment', paymentSchema);
