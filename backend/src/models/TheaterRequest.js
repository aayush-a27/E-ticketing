import mongoose from 'mongoose';
import { REQUEST_STATUS, REQUEST_STATUS_VALUES } from '../constants/index.js';

/**
 * An approved show runner asking to manage a venue. Approval of an organizer
 * application grants the role; this grants access to one specific theater.
 */
const theaterRequestSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Either a claim on a listed theater, or a proposal for a new one.
    theaterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater' },
    proposedTheater: {
      name: { type: String, trim: true, maxlength: 160 },
      addressLine1: { type: String, trim: true, maxlength: 240 },
      city: { type: String, trim: true, maxlength: 80 },
      state: { type: String, trim: true, maxlength: 80 },
      pincode: { type: String, trim: true, maxlength: 12 },
    },

    justification: { type: String, required: true, trim: true, maxlength: 2000 },

    status: {
      type: String,
      enum: REQUEST_STATUS_VALUES,
      default: REQUEST_STATUS.PENDING,
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    decisionNotes: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

theaterRequestSchema.index({ requesterId: 1, status: 1 });
theaterRequestSchema.index({ status: 1, createdAt: -1 });

/** One open request per runner per theater. */
theaterRequestSchema.index(
  { requesterId: 1, theaterId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: REQUEST_STATUS.PENDING,
      theaterId: { $type: 'objectId' },
    },
    name: 'one_pending_request_per_theater',
  },
);

export const TheaterRequest = mongoose.model('TheaterRequest', theaterRequestSchema);
