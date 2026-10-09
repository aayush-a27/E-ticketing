import mongoose from 'mongoose';
import { APPLICATION_STATUS, APPLICATION_STATUS_VALUES } from '../constants/index.js';

const proposedTheaterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    addressLine1: { type: String, required: true, trim: true, maxlength: 240 },
    addressLine2: { type: String, trim: true, maxlength: 240 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: { type: String, required: true, trim: true, maxlength: 12 },
    screenCount: { type: Number, min: 1, max: 50 },
  },
  { _id: false },
);

/**
 * A verification document. Only the storage key is kept; the file itself is
 * served through a short-lived signed URL issued to the super admin, never
 * through a public link.
 */
const documentSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    storageKey: { type: String, required: true },
    contentType: { type: String, trim: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const organizerApplicationSchema = new mongoose.Schema(
  {
    applicantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    contactName: { type: String, required: true, trim: true, maxlength: 120 },
    contactEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    contactPhone: { type: String, required: true, trim: true, maxlength: 20 },

    businessName: { type: String, required: true, trim: true, maxlength: 160 },
    businessType: {
      type: String,
      required: true,
      enum: ['single_screen', 'multiplex', 'chain', 'other'],
    },
    cities: {
      type: [String],
      required: true,
      validate: [(value) => value.length > 0 && value.length <= 10, 'Between 1 and 10 cities'],
    },
    proposedTheater: { type: proposedTheaterSchema, required: true },
    website: { type: String, trim: true, maxlength: 240 },
    documents: { type: [documentSchema], default: [] },
    notes: { type: String, trim: true, maxlength: 2000 },

    status: {
      type: String,
      enum: APPLICATION_STATUS_VALUES,
      default: APPLICATION_STATUS.PENDING,
      index: true,
    },
    submittedAt: { type: Date, default: Date.now },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, trim: true, maxlength: 2000 },
    rejectionReason: { type: String, trim: true, maxlength: 2000 },
    withdrawnAt: { type: Date },
  },
  { timestamps: true },
);

organizerApplicationSchema.index({ applicantId: 1, status: 1 });
organizerApplicationSchema.index({ status: 1, submittedAt: -1 });

/**
 * One pending application per applicant, enforced by the database rather than
 * by a read-then-write check that two concurrent submissions could both pass.
 */
organizerApplicationSchema.index(
  { applicantId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: APPLICATION_STATUS.PENDING },
    name: 'one_pending_application_per_applicant',
  },
);

export const OrganizerApplication = mongoose.model(
  'OrganizerApplication',
  organizerApplicationSchema,
);
