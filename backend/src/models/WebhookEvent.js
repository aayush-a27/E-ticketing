import mongoose from 'mongoose';

/**
 * Every provider event received, stored before it is acted on.
 *
 * The unique index on (provider, eventId) is what makes processing idempotent:
 * a gateway that delivers the same event three times loses the race twice, so
 * a duplicate can never confirm a booking or issue a refund a second time.
 */
const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, default: 'razorpay' },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },

    // So a replay with altered content is visible rather than silent.
    payloadHash: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },

    status: {
      type: String,
      enum: ['received', 'processed', 'ignored', 'failed'],
      default: 'received',
    },
    processedAt: { type: Date },
    error: { type: String, trim: true, maxlength: 1000 },

    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  },
  { timestamps: true },
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ status: 1, createdAt: 1 });

export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
