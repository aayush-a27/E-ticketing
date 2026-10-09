import mongoose from 'mongoose';
import { SEAT_KINDS, SEAT_KIND_VALUES } from '../constants/index.js';

/**
 * One seat in a layout. `seatId` is the stable identifier that ShowSeat,
 * SeatHold and Booking all reference — it must never be reused for a different
 * physical position, which is why a changed layout becomes a new version
 * rather than an edit.
 */
const seatSchema = new mongoose.Schema(
  {
    seatId: { type: String, required: true, trim: true, maxlength: 20 },
    row: { type: String, required: true, trim: true, maxlength: 4 },
    number: { type: Number, required: true, min: 1, max: 100 },
    label: { type: String, required: true, trim: true, maxlength: 12 },
    category: { type: String, required: true, trim: true, maxlength: 40 },

    // Grid position, so the customer seat map can draw aisles and gaps.
    x: { type: Number, required: true, min: 0 },
    y: { type: Number, required: true, min: 0 },

    kind: { type: String, enum: SEAT_KIND_VALUES, default: SEAT_KINDS.SEAT },
    isActive: { type: Boolean, default: true },
  },
  { _id: false },
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    displayOrder: { type: Number, default: 0 },
    color: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false },
);

/**
 * Immutable once created. A layout is referenced by every show scheduled
 * against it, so changing one would silently rewrite the meaning of seats on
 * tickets that are already sold.
 */
const seatLayoutSchema = new mongoose.Schema(
  {
    screenId: { type: mongoose.Schema.Types.ObjectId, ref: 'Screen', required: true, index: true },
    theaterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater', required: true },
    version: { type: Number, required: true, min: 1 },

    categories: {
      type: [categorySchema],
      required: true,
      validate: [(value) => value.length > 0, 'Define at least one seat category'],
    },
    seats: {
      type: [seatSchema],
      required: true,
      validate: [(value) => value.length > 0, 'A layout needs at least one seat'],
    },

    seatCount: { type: Number, required: true },
    rowCount: { type: Number, required: true },

    retiredAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

seatLayoutSchema.index({ screenId: 1, version: 1 }, { unique: true });

/** Bookable seats only — aisles and spaces are positions, not inventory. */
seatLayoutSchema.methods.bookableSeats = function bookableSeats() {
  return this.seats.filter((seat) => seat.kind === SEAT_KINDS.SEAT && seat.isActive);
};

export const SeatLayout = mongoose.model('SeatLayout', seatLayoutSchema);
