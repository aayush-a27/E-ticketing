/**
 * The operations console's read model: bookings, dashboard counters and
 * financial totals, for venue staff and platform administrators.
 *
 * Two rules shape everything here.
 *
 * First, scoping is applied in the database query, never after the fact. A
 * show runner's filter always carries `theaterId: { $in: theirs }`, and a
 * narrowing filter the client supplies is intersected with that set rather
 * than replacing it. There is no code path where a request parameter can widen
 * what a caller sees.
 *
 * Second, this module only reads. Money state is decided by the payment
 * verification and refund pipelines; nothing here can confirm a booking, mark
 * a payment paid or move a rupee.
 */
import mongoose from 'mongoose';
import { Booking } from '../../models/Booking.js';
import { Payment } from '../../models/Payment.js';
import { Refund } from '../../models/Refund.js';
import { Cancellation } from '../../models/Cancellation.js';
import { Show } from '../../models/Show.js';
import { Movie } from '../../models/Movie.js';
import { Theater } from '../../models/Theater.js';
import { OrganizerApplication } from '../../models/OrganizerApplication.js';
import { TheaterRequest } from '../../models/TheaterRequest.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  APPLICATION_STATUS,
  BOOKING_STATUS,
  ERROR_CODES,
  MOVIE_STATUS,
  PAYMENT_ATTEMPT_STATUS,
  REFUND_STATUS,
  REQUEST_STATUS,
  SHOW_STATUS,
  THEATER_STATUS,
} from '../../constants/index.js';
import { managedTheaterIds } from '../../middleware/requireTheaterAccess.js';
import { paginated, resolvePagination } from '../../utils/pagination.js';
import { getSettings } from '../../services/settingsService.js';

/** Trend window for the dashboard chart. */
const TREND_DAYS = 14;

/**
 * The theaters this caller may see, or `null` for unrestricted.
 *
 * An approved show runner with no assignment yet resolves to `[]`, which makes
 * every query return nothing. That is the correct answer: approval and venue
 * assignment are separate grants, and holding only the first shows you no
 * operational data.
 */
async function resolveTheaterScope(actor, { scoped }) {
  if (!scoped) return null;
  return managedTheaterIds(actor);
}

/**
 * Applies a caller-supplied theater filter on top of the scope.
 *
 * For an unrestricted caller it simply narrows. For a scoped caller it is
 * checked against the managed set first, so asking for someone else's venue is
 * refused instead of silently returning that venue's rows.
 */
function applyTheaterFilter(filter, theaterIds, requestedTheaterId) {
  if (theaterIds !== null) {
    const managed = theaterIds.map(String);
    if (requestedTheaterId && !managed.includes(requestedTheaterId)) {
      throw ApiError.forbidden('You do not manage this theater', ERROR_CODES.NOT_THEATER_MANAGER);
    }
    filter.theaterId = requestedTheaterId
      ? new mongoose.Types.ObjectId(requestedTheaterId)
      : { $in: theaterIds };
    return;
  }

  if (requestedTheaterId) filter.theaterId = new mongoose.Types.ObjectId(requestedTheaterId);
}

/**
 * Hides most of a customer's email from venue staff.
 *
 * Someone working a counter needs to recognise the person in front of them,
 * not collect a contact list, so the first character and the domain are kept
 * and the rest is covered. A platform administrator sees the address in full.
 */
export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const head = local.slice(0, 1);
  const covered = '•'.repeat(Math.min(Math.max(local.length - 1, 1), 8));
  return `${head}${covered}@${domain}`;
}

function customerJSON(user, { canSeeContact }) {
  if (!user) return null;
  // A lean/populated document or a hydrated one — both reach here.
  const id = user._id ?? user.id;
  return {
    id: id ? String(id) : null,
    name: user.name ?? null,
    email: canSeeContact ? (user.email ?? null) : maskEmail(user.email),
    emailMasked: !canSeeContact,
    phone: canSeeContact ? (user.phone ?? null) : null,
  };
}

/** A booking as the console's list view needs it. */
function bookingRowJSON(booking, { canSeeContact }) {
  const activeSeats = booking.seats.filter((seat) => !seat.cancelledAt);
  return {
    id: String(booking._id),
    reference: booking.reference,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    customer: customerJSON(booking.userId, { canSeeContact }),
    movie: {
      title: booking.snapshot.movieTitle,
      slug: booking.snapshot.movieSlug ?? null,
      posterUrl: booking.snapshot.posterUrl ?? null,
    },
    theater: {
      id: booking.theaterId ? String(booking.theaterId) : null,
      name: booking.snapshot.theaterName,
      city: booking.snapshot.city,
      screen: booking.snapshot.screenName,
    },
    showtime: {
      startAt: booking.snapshot.startAt,
      language: booking.snapshot.language ?? null,
      format: booking.snapshot.format ?? null,
    },
    showId: String(booking.showId),
    seatCount: activeSeats.length,
    cancelledSeatCount: booking.seats.length - activeSeats.length,
    seatLabels: activeSeats.map((seat) => seat.label),
    amountPaise: booking.amountPaise,
    currency: booking.currency,
    admittedAt: booking.admittedAt ?? null,
    confirmedAt: booking.confirmedAt ?? null,
    cancelledAt: booking.cancelledAt ?? null,
    createdAt: booking.createdAt,
  };
}

const SORTS = Object.freeze({
  '-createdAt': { createdAt: -1 },
  createdAt: { createdAt: 1 },
  '-startAt': { 'snapshot.startAt': -1 },
  startAt: { 'snapshot.startAt': 1 },
  '-amount': { amountPaise: -1 },
  amount: { amountPaise: 1 },
});

/**
 * Bookings for an operator.
 *
 * `scoped` restricts to the caller's assigned theaters; `canSeeCustomerContact`
 * decides whether customer email and phone are returned in full.
 */
export async function listBookings(actor, query, { scoped, canSeeCustomerContact }) {
  const { page, limit, skip } = resolvePagination(query);
  const theaterIds = await resolveTheaterScope(actor, { scoped });

  const filter = {};
  applyTheaterFilter(filter, theaterIds, query.theaterId);

  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.reference) filter.reference = query.reference;
  if (query.movieId) filter.movieId = query.movieId;
  if (query.showId) filter.showId = query.showId;
  if (query.userId) filter.userId = query.userId;
  if (query.city) filter['snapshot.city'] = query.city;
  if (query.admitted === 'true') filter.admittedAt = { $ne: null };
  if (query.admitted === 'false') filter.admittedAt = null;

  if (query.customerEmail) {
    if (!canSeeCustomerContact) {
      throw ApiError.forbidden(
        'Searching by customer email is restricted to platform administrators',
      );
    }
    const { User } = await import('../../models/User.js');
    const customer = await User.findOne({ email: query.customerEmail }).select('_id');
    // No such customer is an empty result, not an error — and it must never
    // fall through to an unfiltered query.
    filter.userId = customer?._id ?? new mongoose.Types.ObjectId();
  }

  if (query.from || query.to) {
    const field = query.dateField === 'showtime' ? 'snapshot.startAt' : 'createdAt';
    filter[field] = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort(SORTS[query.sort ?? '-createdAt'])
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email phone'),
    Booking.countDocuments(filter),
  ]);

  return paginated(
    items.map((booking) => bookingRowJSON(booking, { canSeeContact: canSeeCustomerContact })),
    { page, limit, total },
  );
}

/**
 * One booking, with its payment attempts, refunds and cancellations.
 *
 * A booking outside the caller's scope is reported as not found rather than
 * forbidden. Unlike a theater, whose existence is public, confirming that a
 * particular reference exists at another operator's venue would leak something
 * about another venue's trade.
 */
export async function getBooking(actor, bookingId, { scoped, canSeeCustomerContact }) {
  const theaterIds = await resolveTheaterScope(actor, { scoped });

  const filter = { _id: bookingId };
  if (theaterIds !== null) filter.theaterId = { $in: theaterIds };

  const booking = await Booking.findOne(filter).populate('userId', 'name email phone createdAt');
  if (!booking) throw ApiError.notFound('Booking not found', ERROR_CODES.BOOKING_NOT_FOUND);

  const [payments, refunds, cancellations] = await Promise.all([
    Payment.find({ bookingId: booking._id }).sort({ createdAt: 1 }),
    Refund.find({ bookingId: booking._id }).sort({ createdAt: 1 }),
    Cancellation.find({ bookingId: booking._id }).sort({ createdAt: 1 }),
  ]);

  return {
    booking: {
      ...bookingRowJSON(booking, { canSeeContact: canSeeCustomerContact }),
      seats: booking.seats.map((seat) => ({
        seatId: seat.seatId,
        label: seat.label,
        row: seat.row,
        number: seat.number,
        category: seat.category,
        pricePaise: seat.pricePaise,
        cancelledAt: seat.cancelledAt ?? null,
      })),
      // Stored verbatim when the seats were held, so it still reads correctly
      // after a fee or tax change.
      pricing: booking.pricing,
      layoutVersion: booking.layoutVersion,
      unfulfillableReason: booking.unfulfillableReason ?? null,
      cancellationReason: booking.cancellationReason ?? null,
      // Deliberately absent: ticketToken. It is a bearer credential for the
      // gate and no console view has a reason to display it.
    },
    payments: payments.map((payment) => ({
      id: String(payment._id),
      provider: payment.provider,
      orderId: payment.orderId,
      providerPaymentId: payment.providerPaymentId ?? null,
      amountPaise: payment.amountPaise,
      currency: payment.currency,
      status: payment.status,
      signatureVerified: payment.signatureVerified,
      confirmedVia: payment.confirmedVia ?? null,
      method: payment.method ?? null,
      refundedPaise: payment.refundedPaise,
      failureReason: payment.failureReason ?? null,
      verifiedAt: payment.verifiedAt ?? null,
      capturedAt: payment.capturedAt ?? null,
      failedAt: payment.failedAt ?? null,
      createdAt: payment.createdAt,
    })),
    refunds: refunds.map(refundJSON),
    cancellations: cancellations.map((cancellation) => ({
      id: String(cancellation._id),
      status: cancellation.status,
      seatIds: cancellation.seatIds,
      isPartial: cancellation.isPartial,
      policyApplied: cancellation.policyApplied,
      cancelledSeatsValuePaise: cancellation.cancelledSeatsValuePaise,
      refundablePaise: cancellation.refundablePaise,
      reason: cancellation.reason ?? null,
      createdAt: cancellation.createdAt,
      decidedAt: cancellation.decidedAt ?? null,
    })),
  };
}

function refundJSON(refund) {
  return {
    id: String(refund._id),
    bookingId: String(refund.bookingId),
    amountPaise: refund.amountPaise,
    currency: refund.currency,
    status: refund.status,
    reason: refund.reason,
    provider: refund.provider,
    providerRefundId: refund.providerRefundId ?? null,
    notes: refund.notes ?? null,
    attempts: refund.attempts,
    failureReason: refund.failureReason ?? null,
    processedAt: refund.processedAt ?? null,
    failedAt: refund.failedAt ?? null,
    createdAt: refund.createdAt,
  };
}

// --- Finance ----------------------------------------------------------------

/**
 * Joins a payment or refund to its booking so the row can be scoped by venue.
 *
 * Bookings carry `theaterId`, so this is one hop. Omitted entirely for an
 * unrestricted caller, which keeps the platform-wide pipeline cheap.
 */
function scopeByBookingStages(theaterIds) {
  if (theaterIds === null) return [];
  return [
    {
      $lookup: {
        from: 'bookings',
        localField: 'bookingId',
        foreignField: '_id',
        as: 'bookingRef',
      },
    },
    { $unwind: '$bookingRef' },
    { $match: { 'bookingRef.theaterId': { $in: theaterIds } } },
  ];
}

/**
 * Dates each record by the moment that matters for money, not by when it was
 * first written. A payment started at 23:55 and captured at 00:02 belongs to
 * the day it was captured; a refund requested on Monday and completed on
 * Wednesday went out on Wednesday. Filtering on createdAt put both in the
 * wrong period at every boundary.
 *
 * Returns stages that add `effectiveAt` and keep only records inside the
 * window, or nothing when no window was asked for.
 */
function effectiveWindowStages(cases, fallback, window) {
  if (!window.from && !window.to) return [];
  return [
    {
      $addFields: {
        effectiveAt: {
          $switch: {
            branches: cases.map(([status, field]) => ({
              case: { $eq: ['$status', status] },
              then: { $ifNull: [`$${field}`, `$${fallback}`] },
            })),
            default: `$${fallback}`,
          },
        },
      },
    },
    { $match: dateRangeMatch('effectiveAt', window) },
  ];
}

const PAYMENT_SETTLED_AT = [
  [PAYMENT_ATTEMPT_STATUS.CAPTURED, 'capturedAt'],
  [PAYMENT_ATTEMPT_STATUS.FAILED, 'failedAt'],
];
const REFUND_SETTLED_AT = [
  [REFUND_STATUS.COMPLETED, 'processedAt'],
  [REFUND_STATUS.FAILED, 'failedAt'],
];
const BOOKING_SETTLED_AT = [
  [BOOKING_STATUS.CONFIRMED, 'confirmedAt'],
  [BOOKING_STATUS.CANCELLED, 'cancelledAt'],
];

function dateRangeMatch(field, { from, to }) {
  if (!from && !to) return {};
  return {
    [field]: {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    },
  };
}

function emptyTotal() {
  return { count: 0, amountPaise: 0 };
}

/**
 * What was actually collected, what went back, and what is still owed.
 *
 * Collected money is read from captured payment attempts, which is the only
 * record written after a signature has been verified. Attempts that merely
 * reached the gateway are reported separately and never counted as revenue.
 *
 * Refunds are read from the Refund collection alone. `Payment.refundedPaise`
 * tracks the same money for reconciliation, and adding both would double it.
 * A repeated gateway webhook cannot inflate either figure: `providerPaymentId`
 * and `providerRefundId` are both uniquely indexed, so one real transaction
 * can only ever produce one row.
 */
export async function getFinanceSummary(actor, query, { scoped }) {
  const theaterIds = await resolveTheaterScope(actor, { scoped });

  // A scoped caller narrowing to one of their own venues, or an admin to any.
  const theaterFilter = {};
  applyTheaterFilter(theaterFilter, theaterIds, query.theaterId);
  const scopeIds =
    theaterFilter.theaterId === undefined
      ? null
      : Array.isArray(theaterFilter.theaterId?.$in)
        ? theaterFilter.theaterId.$in
        : [theaterFilter.theaterId];

  const window = { from: query.from, to: query.to };

  const [paymentRows, refundRows, bookingRows, taxRows] = await Promise.all([
    Payment.aggregate([
      ...effectiveWindowStages(PAYMENT_SETTLED_AT, 'createdAt', window),
      ...scopeByBookingStages(scopeIds),
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amountPaise: { $sum: '$amountPaise' },
        },
      },
    ]),
    Refund.aggregate([
      ...effectiveWindowStages(REFUND_SETTLED_AT, 'createdAt', window),
      ...scopeByBookingStages(scopeIds),
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amountPaise: { $sum: '$amountPaise' },
        },
      },
    ]),
    // Booked value and what is still unpaid, straight from the bookings.
    Booking.aggregate([
      { $match: scopeIds ? { theaterId: { $in: scopeIds } } : {} },
      ...effectiveWindowStages(BOOKING_SETTLED_AT, 'createdAt', window),
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amountPaise: { $sum: '$amountPaise' },
          subtotalPaise: { $sum: '$pricing.subtotalPaise' },
          feePaise: { $sum: '$pricing.convenienceFeePaise' },
          taxPaise: { $sum: '$pricing.taxTotalPaise' },
        },
      },
    ]),
    // Tax collected per component, named as the settings named it.
    Booking.aggregate([
      {
        $match: {
          ...(scopeIds ? { theaterId: { $in: scopeIds } } : {}),
          status: BOOKING_STATUS.CONFIRMED,
          // Tax is collected when the booking is confirmed.
          ...dateRangeMatch('confirmedAt', window),
        },
      },
      { $unwind: '$pricing.taxes' },
      {
        $group: {
          _id: '$pricing.taxes.name',
          rateBasisPoints: { $first: '$pricing.taxes.rateBasisPoints' },
          amountPaise: { $sum: '$pricing.taxes.amountPaise' },
        },
      },
      { $sort: { amountPaise: -1 } },
    ]),
  ]);

  const byStatus = (rows) =>
    Object.fromEntries(
      rows.map((row) => [row._id, { count: row.count, amountPaise: row.amountPaise }]),
    );

  const payments = byStatus(paymentRows);
  const refunds = byStatus(refundRows);

  const collected = payments[PAYMENT_ATTEMPT_STATUS.CAPTURED] ?? emptyTotal();
  const refunded = refunds[REFUND_STATUS.COMPLETED] ?? emptyTotal();
  const refundPending = refunds[REFUND_STATUS.PENDING] ?? emptyTotal();
  const refundProcessing = refunds[REFUND_STATUS.PROCESSING] ?? emptyTotal();
  const refundFailed = refunds[REFUND_STATUS.FAILED] ?? emptyTotal();

  const confirmed = bookingRows.find((row) => row._id === BOOKING_STATUS.CONFIRMED);
  const pendingPayment = bookingRows.find((row) => row._id === BOOKING_STATUS.PENDING_PAYMENT);
  const unfulfillable = bookingRows.find((row) => row._id === BOOKING_STATUS.UNFULFILLABLE);

  return {
    window: { from: query.from ?? null, to: query.to ?? null },
    currency: 'INR',
    scope: scopeIds === null ? 'platform' : 'theaters',
    collected,
    refunded,
    /** Collected minus refunded. The figure that is actually in hand. */
    netPaise: collected.amountPaise - refunded.amountPaise,
    refundsOutstanding: {
      count: refundPending.count + refundProcessing.count,
      amountPaise: refundPending.amountPaise + refundProcessing.amountPaise,
    },
    refundsFailed: refundFailed,
    /** Reached the gateway and did not succeed. Never counted as revenue. */
    failedAttempts: payments[PAYMENT_ATTEMPT_STATUS.FAILED] ?? emptyTotal(),
    openAttempts: payments[PAYMENT_ATTEMPT_STATUS.CREATED] ?? emptyTotal(),
    awaitingPayment: {
      count: pendingPayment?.count ?? 0,
      amountPaise: pendingPayment?.amountPaise ?? 0,
    },
    unfulfillable: {
      count: unfulfillable?.count ?? 0,
      amountPaise: unfulfillable?.amountPaise ?? 0,
    },
    /** From the price snapshots of confirmed bookings. */
    confirmedBookings: {
      count: confirmed?.count ?? 0,
      grossPaise: confirmed?.amountPaise ?? 0,
      ticketsPaise: confirmed?.subtotalPaise ?? 0,
      convenienceFeesPaise: confirmed?.feePaise ?? 0,
      taxPaise: confirmed?.taxPaise ?? 0,
    },
    taxBreakdown: taxRows.map((row) => ({
      name: row._id,
      rateBasisPoints: row.rateBasisPoints ?? null,
      amountPaise: row.amountPaise,
    })),
  };
}

export async function listRefunds(actor, query, { scoped }) {
  const { page, limit, skip } = resolvePagination(query);
  const theaterIds = await resolveTheaterScope(actor, { scoped });

  const theaterFilter = {};
  applyTheaterFilter(theaterFilter, theaterIds, query.theaterId);

  // Refunds hang off bookings, so the venue filter is resolved to the booking
  // ids first. Scoping stays in the query either way.
  const refundFilter = {};
  if (theaterFilter.theaterId !== undefined) {
    const bookingIds = await Booking.find({ theaterId: theaterFilter.theaterId })
      .select('_id')
      .lean();
    refundFilter.bookingId = { $in: bookingIds.map((booking) => booking._id) };
  }
  if (query.status) refundFilter.status = query.status;
  if (query.reason) refundFilter.reason = query.reason;

  const [items, total] = await Promise.all([
    Refund.find(refundFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('bookingId', 'reference snapshot.movieTitle snapshot.theaterName amountPaise'),
    Refund.countDocuments(refundFilter),
  ]);

  return paginated(
    items.map((refund) => {
      const booking = refund.bookingId;
      return {
        ...refundJSON(refund),
        bookingId: booking?._id ? String(booking._id) : String(refund.bookingId),
        booking: booking?.reference
          ? {
              reference: booking.reference,
              movieTitle: booking.snapshot?.movieTitle ?? null,
              theaterName: booking.snapshot?.theaterName ?? null,
              amountPaise: booking.amountPaise,
            }
          : null,
      };
    }),
    { page, limit, total },
  );
}

// --- Dashboard --------------------------------------------------------------

/** "2026-10-10" for an instant, as the calendar reads in `timeZone`. */
function dayKeyIn(date, timeZone) {
  // en-CA formats as YYYY-MM-DD, which is also the key $dateToString makes.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * The console's landing page.
 *
 * Every counter is a database aggregate over the caller's own scope. Nothing
 * is estimated, and nothing is computed by fetching records and adding them up
 * in a browser.
 */
export async function getDashboard(actor, { scoped }) {
  const theaterIds = await resolveTheaterScope(actor, { scoped });
  const venueMatch = theaterIds === null ? {} : { theaterId: { $in: theaterIds } };
  const showMatch = theaterIds === null ? {} : { theaterId: { $in: theaterIds } };
  const now = new Date();
  /**
   * Days are the platform's own days. Bucketing by UTC made "today" begin at
   * 05:30 in India, so an evening's bookings were split across two bars. The
   * query reaches back a day further than needed and the buckets are then
   * matched by local date key, which stays right across any offset.
   */
  const timeZone = (await getSettings())?.defaultTimezone || 'Asia/Kolkata';
  const trendKeys = Array.from({ length: TREND_DAYS }, (_, index) =>
    dayKeyIn(new Date(now.getTime() - (TREND_DAYS - 1 - index) * 86_400_000), timeZone),
  );
  const trendFrom = new Date(now.getTime() - (TREND_DAYS + 1) * 86_400_000);

  const [
    bookingsByStatus,
    financeSummary,
    showCounts,
    theaterCount,
    recentBookings,
    upcomingShows,
    trend,
    platform,
  ] = await Promise.all([
    Booking.aggregate([
      { $match: venueMatch },
      { $group: { _id: '$status', count: { $sum: 1 }, amountPaise: { $sum: '$amountPaise' } } },
    ]),

    getFinanceSummary(actor, {}, { scoped }),

    Show.aggregate([
      { $match: showMatch },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          upcoming: { $sum: { $cond: [{ $gt: ['$startAt', now] }, 1, 0] } },
        },
      },
    ]),

    Theater.countDocuments(
      theaterIds === null
        ? { status: THEATER_STATUS.ACTIVE }
        : { _id: { $in: theaterIds }, status: THEATER_STATUS.ACTIVE },
    ),

    Booking.find(venueMatch)
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('userId', 'name email phone'),

    Show.find({ ...showMatch, status: SHOW_STATUS.PUBLISHED, startAt: { $gt: now } })
      .sort({ startAt: 1 })
      .limit(8)
      .populate('movieId', 'title slug poster')
      .populate('theaterId', 'name cityLabel')
      .populate('screenId', 'name'),

    /**
     * Confirmed bookings per day, with the value they were booked at. Labelled
     * as booked value rather than revenue: collected money is reported from
     * captured payments, and conflating the two is how a dashboard ends up
     * counting the same rupee twice.
     */
    Booking.aggregate([
      {
        $match: {
          ...venueMatch,
          status: BOOKING_STATUS.CONFIRMED,
          confirmedAt: { $gte: trendFrom },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$confirmedAt', timezone: timeZone } },
          bookings: { $sum: 1 },
          bookedValuePaise: { $sum: '$amountPaise' },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Platform-wide figures, meaningful only to an administrator.
    scoped
      ? Promise.resolve(null)
      : Promise.all([
          Movie.countDocuments({ status: MOVIE_STATUS.PUBLISHED }),
          Movie.countDocuments({ status: MOVIE_STATUS.DRAFT }),
          Theater.countDocuments({}),
          OrganizerApplication.countDocuments({ status: APPLICATION_STATUS.PENDING }),
          TheaterRequest.countDocuments({ status: REQUEST_STATUS.PENDING }),
        ]).then(([published, draft, theaters, applications, theaterRequests]) => ({
          moviesPublished: published,
          moviesDraft: draft,
          theatersTotal: theaters,
          pendingApplications: applications,
          pendingTheaterRequests: theaterRequests,
        })),
  ]);

  const bookingCount = (status) =>
    bookingsByStatus.find((row) => row._id === status)?.count ?? 0;

  const showCount = (status) => showCounts.find((row) => row._id === status)?.count ?? 0;
  const upcomingPublished =
    showCounts.find((row) => row._id === SHOW_STATUS.PUBLISHED)?.upcoming ?? 0;

  // Fill the gaps so the chart has a point for every day, not just busy ones.
  const trendByDate = new Map(trend.map((row) => [row._id, row]));
  const series = trendKeys.map((key) => {
    const row = trendByDate.get(key);
    return {
      date: key,
      bookings: row?.bookings ?? 0,
      bookedValuePaise: row?.bookedValuePaise ?? 0,
    };
  });

  return {
    scope: theaterIds === null ? 'platform' : 'theaters',
    assignedTheaterCount: theaterIds === null ? null : theaterIds.length,
    generatedAt: now,
    bookings: {
      total: bookingsByStatus.reduce((sum, row) => sum + row.count, 0),
      confirmed: bookingCount(BOOKING_STATUS.CONFIRMED),
      pendingPayment: bookingCount(BOOKING_STATUS.PENDING_PAYMENT),
      paymentFailed: bookingCount(BOOKING_STATUS.PAYMENT_FAILED),
      cancelled: bookingCount(BOOKING_STATUS.CANCELLED),
      expired: bookingCount(BOOKING_STATUS.EXPIRED),
      unfulfillable: bookingCount(BOOKING_STATUS.UNFULFILLABLE),
    },
    finance: {
      currency: financeSummary.currency,
      collectedPaise: financeSummary.collected.amountPaise,
      refundedPaise: financeSummary.refunded.amountPaise,
      netPaise: financeSummary.netPaise,
      refundsOutstandingPaise: financeSummary.refundsOutstanding.amountPaise,
      awaitingPaymentPaise: financeSummary.awaitingPayment.amountPaise,
    },
    shows: {
      upcomingPublished,
      published: showCount(SHOW_STATUS.PUBLISHED),
      draft: showCount(SHOW_STATUS.DRAFT),
      cancelled: showCount(SHOW_STATUS.CANCELLED),
    },
    theaters: { active: theaterCount },
    platform,
    recentBookings: recentBookings.map((booking) =>
      bookingRowJSON(booking, { canSeeContact: !scoped }),
    ),
    upcomingShows: upcomingShows.map((show) => ({
      id: String(show._id),
      startAt: show.startAt,
      language: show.language,
      format: show.format,
      status: show.status,
      bookedSeatCount: show.bookedSeatCount,
      movie: show.movieId
        ? { title: show.movieId.title, slug: show.movieId.slug, posterUrl: show.movieId.poster?.url ?? null }
        : null,
      theater: show.theaterId
        ? { id: String(show.theaterId._id), name: show.theaterId.name, city: show.theaterId.cityLabel }
        : null,
      screen: show.screenId ? show.screenId.name : null,
    })),
    trend: { days: TREND_DAYS, basis: 'confirmedAt', timezone: timeZone, series },
  };
}

/**
 * A customer's booking history, for the account view. Scoped like every other
 * read here: a show runner sees only that customer's bookings at their venues.
 */
export async function getCustomerBookingSummary(actor, userId, { scoped }) {
  const theaterIds = await resolveTheaterScope(actor, { scoped });
  const filter = { userId };
  if (theaterIds !== null) filter.theaterId = { $in: theaterIds };

  const rows = await Booking.aggregate([
    { $match: filter },
    { $group: { _id: '$status', count: { $sum: 1 }, amountPaise: { $sum: '$amountPaise' } } },
  ]);

  const confirmed = rows.find((row) => row._id === BOOKING_STATUS.CONFIRMED);
  return {
    totalBookings: rows.reduce((sum, row) => sum + row.count, 0),
    confirmedBookings: confirmed?.count ?? 0,
    confirmedValuePaise: confirmed?.amountPaise ?? 0,
    byStatus: Object.fromEntries(rows.map((row) => [row._id, row.count])),
  };
}
