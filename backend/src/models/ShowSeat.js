import mongoose from 'mongoose';
import { SEAT_STATE, SEAT_STATE_VALUES } from '../constants/index.js';

/**
 * The authority on whether a seat is free. One document per seat per show.
 *
 * Nothing is derived from the booking list at read time: a seat is available
 * only if its own document says so. The unique index on (showId, seatId) is
 * what makes a second inventory row for the same seat impossible, and the
 * conditional updates in seatHolds.service.js are what make two simultaneous
 * claims resolve into exactly one winner.
 */
const showSeatSchema = new mongoose.Schema(
  {
    showId: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true },
    seatId: { type: String, required: true },

    // Copied from the layout at generation time so the seat map and the price
    // of a held seat do not depend on re-reading the layout.
    label: { type: String, required: true },
    category: { type: String, required: true },
    row: { type: String, required: true },
    number: { type: Number, required: true },
    pricePaise: { type: Number, required: true, min: 0 },

    state: {
      type: String,
      enum: SEAT_STATE_VALUES,
      default: SEAT_STATE.AVAILABLE,
      required: true,
    },

    holdId: { type: mongoose.Schema.Types.ObjectId, ref: 'SeatHold', default: null },
    holdExpiresAt: { type: Date, default: null },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },

    blockedReason: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

/** The constraint the whole design rests on. */
showSeatSchema.index({ showId: 1, seatId: 1 }, { unique: true });

// Drawing a seat map, and counting what is left.
showSeatSchema.index({ showId: 1, state: 1 });
// Releasing every seat belonging to one hold.
showSeatSchema.index({ holdId: 1 });
// Finding seats whose hold has lapsed. Deliberately a plain index and not a
// TTL index: TTL deletes documents, and inventory must survive.
showSeatSchema.index({ holdExpiresAt: 1 });

export const ShowSeat = mongoose.model('ShowSeat', showSeatSchema);
