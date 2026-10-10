import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireActiveShowRunner } from '../../middleware/authorize.js';
import { gateLimiter } from '../../middleware/rateLimiter.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import {
  AUDIT_ACTIONS,
  BOOKING_STATUS,
  ERROR_CODES,
  ROLES,
} from '../../constants/index.js';
import { Booking } from '../../models/Booking.js';
import { Theater } from '../../models/Theater.js';
import { Show } from '../../models/Show.js';
import { normalizeEntryCode, verifyTicketToken } from '../../services/ticketService.js';
import { recordAudit } from '../../services/auditService.js';

/**
 * Either the QR's signed token or the short entry code printed under it —
 * one, never both. The code exists for a door with no camera.
 */
const validateSchema = z
  .object({
    token: z.string().trim().min(32).max(200).optional(),
    code: z.string().trim().min(10).max(16).optional(),
  })
  .refine((value) => Boolean(value.token) !== Boolean(value.code), {
    message: 'Send the ticket token or the entry code',
  });

async function bookingForToken(token) {
  const decoded = verifyTicketToken(token);
  if (!decoded) return null;
  const booking = await Booking.findById(decoded.bookingId);
  return booking?.ticketToken === token ? booking : null;
}

async function bookingForCode(input) {
  const code = normalizeEntryCode(input);
  if (!code) return null;
  return Booking.findOne({ entryCode: code });
}

/** When a show's end time was never recorded, assume a long film. */
const FALLBACK_RUN_MINUTES = 240;

/**
 * Gate validation, for venue staff. A ticket arrives as the QR's signed token
 * or as the short entry code, and both go through the same checks below.
 *
 * The checks run in an order that leaks nothing:
 *
 *   1. the signature, so a forged token learns nothing at all;
 *   2. the venue, so staff at one theater cannot discover whether a ticket
 *      for another theater was cancelled, refunded or already used;
 *   3. the booking's state;
 *   4. the time window, so a ticket for another day is refused without being
 *      spent;
 *   5. admission itself, as a conditional update — two scanners reading the
 *      same QR code cannot both admit. The second is told when the first did.
 */
export const ticketsRouter = Router();

ticketsRouter.use(authenticate, requireActiveShowRunner);

ticketsRouter.post(
  '/validate',
  gateLimiter,
  validate({ body: validateSchema }),
  asyncHandler(async (req, res) => {
    const booking = req.body.token
      ? await bookingForToken(req.body.token)
      : await bookingForCode(req.body.code);

    if (!booking) {
      // A cancelled booking has its token and code cleared, so it lands here
      // too: a cancelled ticket reads the same as a forged one, which is right.
      throw new ApiError(400, ERROR_CODES.TICKET_INVALID, 'This ticket is not valid');
    }

    // Staff may only admit at venues they manage — checked before anything
    // about the booking's state is revealed.
    if (req.user.role !== ROLES.SUPER_ADMIN) {
      const theaterId =
        booking.theaterId ?? (await Show.findById(booking.showId).select('theaterId'))?.theaterId;
      const theater = theaterId ? await Theater.findById(theaterId) : null;
      if (!theater?.isManagedBy(req.user._id)) {
        throw ApiError.forbidden(
          'This ticket is for a venue you do not manage',
          ERROR_CODES.NOT_THEATER_MANAGER,
        );
      }
    }

    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
      throw new ApiError(
        400,
        ERROR_CODES.TICKET_INVALID,
        `This booking is ${booking.status}; the ticket is not valid`,
      );
    }

    if (booking.admittedAt) {
      throw new ApiError(
        409,
        ERROR_CODES.TICKET_ALREADY_USED,
        `This ticket was already used at ${booking.admittedAt.toISOString()}`,
        [{ field: 'admittedAt', message: booking.admittedAt.toISOString() }],
      );
    }

    /**
     * The window: from GATE_OPENS_MINUTES_BEFORE before the show until it
     * ends. Refused scans do not touch the booking, so the ticket still works
     * at the right time.
     */
    const now = Date.now();
    const startAt = new Date(booking.snapshot.startAt).getTime();
    const endAt = booking.snapshot.endAt
      ? new Date(booking.snapshot.endAt).getTime()
      : startAt + FALLBACK_RUN_MINUTES * 60_000;
    const opensAt = startAt - env.GATE_OPENS_MINUTES_BEFORE * 60_000;

    if (now < opensAt) {
      throw new ApiError(
        409,
        ERROR_CODES.TICKET_NOT_YET_VALID,
        `This ticket is for a show starting ${new Date(startAt).toISOString()}. Entry opens ${env.GATE_OPENS_MINUTES_BEFORE} minutes before.`,
        [{ field: 'startAt', message: new Date(startAt).toISOString() }],
      );
    }
    if (now > endAt) {
      throw new ApiError(
        409,
        ERROR_CODES.TICKET_SHOW_ENDED,
        `This ticket was for a show that ended ${new Date(endAt).toISOString()}.`,
        [{ field: 'startAt', message: new Date(startAt).toISOString() }],
      );
    }

    const admitted = await Booking.findOneAndUpdate(
      { _id: booking._id, admittedAt: null, status: BOOKING_STATUS.CONFIRMED },
      { admittedAt: new Date(), admittedBy: req.user._id },
      { new: true },
    );

    if (!admitted) {
      // Lost a race with another scanner, or the booking changed underneath.
      const current = await Booking.findById(booking._id).select('admittedAt status');
      if (current?.admittedAt) {
        throw new ApiError(
          409,
          ERROR_CODES.TICKET_ALREADY_USED,
          `This ticket was already used at ${current.admittedAt.toISOString()}`,
          [{ field: 'admittedAt', message: current.admittedAt.toISOString() }],
        );
      }
      throw new ApiError(400, ERROR_CODES.TICKET_INVALID, 'This ticket is no longer valid');
    }

    await recordAudit({
      actor: req.user,
      action: AUDIT_ACTIONS.TICKET_ADMITTED,
      resourceType: 'Booking',
      resourceId: booking._id,
      after: { reference: booking.reference, seats: booking.activeSeats.length },
      req,
    });

    res.json({
      data: {
        valid: true,
        reference: admitted.reference,
        movieTitle: admitted.snapshot.movieTitle,
        theaterName: admitted.snapshot.theaterName,
        screenName: admitted.snapshot.screenName,
        startAt: admitted.snapshot.startAt,
        seats: admitted.activeSeats.map((seat) => seat.label),
        admittedAt: admitted.admittedAt,
      },
    });
  }),
);
