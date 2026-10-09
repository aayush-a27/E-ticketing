import mongoose from 'mongoose';
import { SHOW_RUNNER_STATUS, SHOW_RUNNER_STATUS_VALUES } from '../constants/index.js';

/**
 * Separate from the user's role on purpose. A runner can be stripped of
 * operating rights here while remaining an ordinary customer, and holding the
 * role is not enough to act: this profile must also be active.
 */
const showRunnerProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrganizerApplication' },

    businessName: { type: String, required: true, trim: true, maxlength: 160 },
    businessType: { type: String, trim: true },
    contactEmail: { type: String, lowercase: true, trim: true },
    contactPhone: { type: String, trim: true },
    operatingCities: { type: [String], default: [] },

    status: {
      type: String,
      enum: SHOW_RUNNER_STATUS_VALUES,
      default: SHOW_RUNNER_STATUS.ACTIVE,
      index: true,
    },
    statusReason: { type: String, trim: true, maxlength: 1000 },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    suspendedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

showRunnerProfileSchema.virtual('canOperate').get(function canOperate() {
  return this.status === SHOW_RUNNER_STATUS.ACTIVE;
});

export const ShowRunnerProfile = mongoose.model('ShowRunnerProfile', showRunnerProfileSchema);
