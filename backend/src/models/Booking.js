import mongoose from 'mongoose';
import { BOOKING_STATUS, BOOKING_STATUS_VALUES, PAYMENT_STATUS, PAYMENT_STATUS_VALUES } from '../constants/index.js';

/**
 * A seat as it was sold. Copied rather than referenced, so a ticket still
 * reads correctly after the screen is relaid out or the show is repriced.
 */
const bookedSeatSchema = new mongoose.Schema(
  {
    seatId: { type: String, required: true },
    label: { type: String, required: true },
    row: { type: String, required: true },
    number: { type: Number, required: true },
    category: { type: String, required: true },
    pricePaise: { type: Number, required: true, min: 0 },
    // Set when only part of a multi-seat booking is cancelled.
    cancelledAt: { type: Date, default: null },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    // Human-quotable, non-guessable. What a customer reads out at the counter.
    reference: { type: String, required: true, unique: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    showId: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true },
    holdId: { type: mongoose.Schema.Types.ObjectId, ref: 'SeatHold' },

    // Denormalized so a ticket survives a venue rename or a catalog change.
    snapshot: {
      movieTitle: { type: String, required: true },
      movieSlug: { type: String },
      posterUrl: { type: String },
      certification: { type: String },
      theaterName: { type: String, required: true },
      theaterAddress: { type: String },
      city: { type: String, required: true },
      screenName: { type: String, required: true },
      language: { type: String },
      format: { type: String },
      startAt: { type: Date, required: true },
      endAt: { type: Date },
      timezone: { type: String },
    },

    seats: { type: [bookedSeatSchema], required: true },
    layoutVersion: { type: Number, required: true },

    /**
     * The quote as it stood when the seats were held. Stored verbatim: a later
     * fee or tax change must never alter what an existing booking says it cost.
     */
    pricing: { type: mongoose.Schema.Types.Mixed, required: true },
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: BOOKING_STATUS_VALUES,
      default: BOOKING_STATUS.PENDING_PAYMENT,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: PAYMENT_STATUS.PENDING,
      required: true,
    },

    /** Opaque, signed, single-purpose. Never contains customer data. */
    ticketToken: { type: String, unique: true, sparse: true },
    admittedAt: { type: Date },
    admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    confirmedAt: { type: Date },
    expiredAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true, maxlength: 1000 },

    /**
     * Payment captured but the seats could not be given — the hold lapsed and
     * someone else took them. Money is owed back; the reconciliation job picks
     * these up.
     */
    unfulfillableReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ showId: 1, status: 1 });
bookingSchema.index({ status: 1, createdAt: 1 });
bookingSchema.index({ 'snapshot.startAt': -1 });

bookingSchema.virtual('activeSeats').get(function activeSeats() {
  return this.seats.filter((seat) => !seat.cancelledAt);
});

bookingSchema.virtual('isConfirmed').get(function isConfirmed() {
  return this.status === BOOKING_STATUS.CONFIRMED;
});

/**
 * What the customer sees. The ticket token is deliberately absent — it is
 * handed over only by the ticket endpoint, for a confirmed booking.
 */
bookingSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    reference: this.reference,
    showId: String(this.showId),
    status: this.status,
    paymentStatus: this.paymentStatus,
    movie: {
      title: this.snapshot.movieTitle,
      slug: this.snapshot.movieSlug ?? null,
      posterUrl: this.snapshot.posterUrl ?? null,
      certification: this.snapshot.certification ?? null,
    },
    theater: {
      name: this.snapshot.theaterName,
      address: this.snapshot.theaterAddress ?? null,
      city: this.snapshot.city,
      screen: this.snapshot.screenName,
    },
    showtime: {
      startAt: this.snapshot.startAt,
      endAt: this.snapshot.endAt ?? null,
      timezone: this.snapshot.timezone ?? null,
      language: this.snapshot.language ?? null,
      format: this.snapshot.format ?? null,
    },
    seats: this.seats.map((seat) => ({
      seatId: seat.seatId,
      label: seat.label,
      category: seat.category,
      pricePaise: seat.pricePaise,
      cancelled: Boolean(seat.cancelledAt),
    })),
    pricing: this.pricing,
    amountPaise: this.amountPaise,
    currency: this.currency,
    confirmedAt: this.confirmedAt ?? null,
    cancelledAt: this.cancelledAt ?? null,
    admittedAt: this.admittedAt ?? null,
    createdAt: this.createdAt,
  };
};

export const Booking = mongoose.model('Booking', bookingSchema);
