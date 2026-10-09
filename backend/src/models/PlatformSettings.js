import mongoose from 'mongoose';

/**
 * A single document holding every policy that must be adjustable without a
 * deploy: fees, tax and the cancellation rules. Nothing that changes money or
 * eligibility is written into business logic.
 *
 * Tax is a list of named components rather than one GST rate, because the rate
 * that applies depends on ticket price and jurisdiction and changes over time.
 * Each component carries its own threshold.
 */
const taxComponentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    rateBasisPoints: { type: Number, required: true, min: 0, max: 10_000 },
    // Applies only when the per-ticket base price is at or above this amount.
    appliesAbovePaise: { type: Number, default: 0, min: 0 },
    appliesTo: { type: String, enum: ['ticket', 'fees', 'ticket_and_fees'], default: 'ticket' },
  },
  { _id: false },
);

/**
 * A cancellation window. The first rule whose cutoff the request falls inside
 * decides the refund, so order matters and is enforced on save.
 */
const cancellationRuleSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    // Cancel at least this long before showtime to qualify.
    minHoursBeforeShow: { type: Number, required: true, min: 0 },
    refundPercentBasisPoints: { type: Number, required: true, min: 0, max: 10_000 },
    // Convenience fees are usually not refunded; this makes that a choice.
    refundFees: { type: Boolean, default: false },
  },
  { _id: false },
);

const platformSettingsSchema = new mongoose.Schema(
  {
    // Enforces the singleton: only one document can hold this key.
    key: { type: String, required: true, unique: true, default: 'platform' },

    currency: { type: String, default: 'INR' },
    defaultTimezone: { type: String, default: 'Asia/Kolkata' },

    fees: {
      // Both are supported and applied together: percentage of the ticket
      // price, plus a flat amount per ticket.
      percentBasisPoints: { type: Number, default: 0, min: 0, max: 10_000 },
      flatPerTicketPaise: { type: Number, default: 0, min: 0 },
      capPerBookingPaise: { type: Number, default: null },
    },

    taxComponents: { type: [taxComponentSchema], default: [] },

    cancellation: {
      enabled: { type: Boolean, default: true },
      // A full refund inside this window after booking, regardless of the
      // show-time rules below.
      graceWindowMinutes: { type: Number, default: 120, min: 0 },
      rules: { type: [cancellationRuleSchema], default: [] },
    },

    seatHold: {
      ttlMinutes: { type: Number, default: 10, min: 1, max: 60 },
      maxSeatsPerBooking: { type: Number, default: 10, min: 1, max: 40 },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

/** Rules are evaluated in order, so keep the widest window first. */
platformSettingsSchema.pre('save', function sortRules(next) {
  if (this.cancellation?.rules?.length) {
    this.cancellation.rules.sort((a, b) => b.minHoursBeforeShow - a.minHoursBeforeShow);
  }
  next();
});

export const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);

/**
 * The defaults a fresh install starts with: the full-refund-within-two-hours
 * policy, an 18% GST component on tickets priced above ₹100 (the threshold
 * India applies), and a small convenience fee. All of it is editable by the
 * super admin afterwards.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  key: 'platform',
  currency: 'INR',
  defaultTimezone: 'Asia/Kolkata',
  fees: {
    percentBasisPoints: 200, // 2%
    flatPerTicketPaise: 2000, // ₹20
    capPerBookingPaise: null,
  },
  taxComponents: [
    {
      name: 'GST',
      rateBasisPoints: 1800, // 18%
      appliesAbovePaise: 10_000, // tickets above ₹100
      appliesTo: 'ticket',
    },
  ],
  cancellation: {
    enabled: true,
    graceWindowMinutes: 120,
    rules: [
      { label: 'More than 24 hours before showtime', minHoursBeforeShow: 24, refundPercentBasisPoints: 10_000, refundFees: false },
      { label: 'Between 4 and 24 hours before showtime', minHoursBeforeShow: 4, refundPercentBasisPoints: 5_000, refundFees: false },
      { label: 'Less than 4 hours before showtime', minHoursBeforeShow: 0, refundPercentBasisPoints: 0, refundFees: false },
    ],
  },
  seatHold: { ttlMinutes: 10, maxSeatsPerBooking: 10 },
});
