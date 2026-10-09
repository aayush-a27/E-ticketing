import mongoose from 'mongoose';
import { NOTIFICATION_STATUS } from '../constants/index.js';

/**
 * The outbox. A notification is written in the same transaction as the change
 * that caused it and delivered afterwards, so a delivery failure can never roll
 * back an approval or a booking.
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    channel: { type: String, enum: ['email', 'sms'], default: 'email' },
    type: { type: String, required: true },
    to: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },

    status: {
      type: String,
      enum: Object.values(NOTIFICATION_STATUS),
      default: NOTIFICATION_STATUS.PENDING,
      index: true,
    },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    sentAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

notificationSchema.index({ status: 1, createdAt: 1 });

export const Notification = mongoose.model('Notification', notificationSchema);
