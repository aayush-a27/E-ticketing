import mongoose from 'mongoose';
import { SHOW_STATUS, SHOW_STATUS_VALUES, SCREEN_FORMATS } from '../constants/index.js';

/**
 * Price per seat category, in paise. Integers only — rupees as floats produce
 * totals that are a paisa off, and money that does not reconcile is worse than
 * money that is awkward to read.
 */
const categoryPriceSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true, maxlength: 40 },
    basePaise: { type: Number, required: true, min: 0, max: 10_000_00 },
  },
  { _id: false },
);

const showSchema = new mongoose.Schema(
  {
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true, index: true },
    theaterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater', required: true, index: true },
    screenId: { type: mongoose.Schema.Types.ObjectId, ref: 'Screen', required: true, index: true },

    // Denormalized so city browsing reads one collection.
    city: { type: String, required: true, lowercase: true, trim: true, index: true },

    // Always UTC. The timezone is kept for display and for working out which
    // local day a show belongs to.
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, default: 'Asia/Kolkata' },

    language: { type: String, required: true, trim: true, maxlength: 40 },
    format: { type: String, required: true, enum: SCREEN_FORMATS },

    /** Pinned at scheduling time; relaying the screen cannot alter sold seats. */
    layoutVersion: { type: Number, required: true },

    pricing: {
      type: [categoryPriceSchema],
      required: true,
      validate: [(value) => value.length > 0, 'Price every seat category'],
    },

    bookingOpensAt: { type: Date },
    bookingClosesAt: { type: Date },

    status: {
      type: String,
      enum: SHOW_STATUS_VALUES,
      default: SHOW_STATUS.DRAFT,
      index: true,
    },
    publishedAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true, maxlength: 1000 },

    /**
     * Set the first time inventory is generated. Guards the "no unsafe edits
     * once tickets exist" rule without counting bookings on every write.
     */
    inventoryGeneratedAt: { type: Date },
    bookedSeatCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// Overlap detection and the show-runner's own schedule view.
showSchema.index({ screenId: 1, startAt: 1, endAt: 1 });
// Customer browsing: what is on in this city, on this day.
showSchema.index({ city: 1, status: 1, startAt: 1 });
showSchema.index({ movieId: 1, city: 1, status: 1, startAt: 1 });
showSchema.index({ theaterId: 1, status: 1, startAt: 1 });

showSchema.virtual('isBookable').get(function isBookable() {
  if (this.status !== SHOW_STATUS.PUBLISHED) return false;
  const now = new Date();
  if (this.bookingOpensAt && now < this.bookingOpensAt) return false;
  if (this.bookingClosesAt && now > this.bookingClosesAt) return false;
  return now < this.startAt;
});

showSchema.methods.priceFor = function priceFor(category) {
  const entry = this.pricing.find((item) => item.category === category);
  return entry ? entry.basePaise : null;
};

showSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    movieId: String(this.movieId),
    theaterId: String(this.theaterId),
    screenId: String(this.screenId),
    startAt: this.startAt,
    endAt: this.endAt,
    timezone: this.timezone,
    language: this.language,
    format: this.format,
    pricing: this.pricing.map((item) => ({
      category: item.category,
      basePaise: item.basePaise,
    })),
    isBookable: this.isBookable,
  };
};

export const Show = mongoose.model('Show', showSchema);
