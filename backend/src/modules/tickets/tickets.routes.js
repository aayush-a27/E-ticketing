import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireActiveShowRunner } from '../../middleware/authorize.js';
import { sensitiveLimiter } from '../../middleware/rateLimiter.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  AUDIT_ACTIONS,
  BOOKING_STATUS,
  ERROR_CODES,
  ROLES,
} from '../../constants/index.js';
import { Booking } from '../../models/Booking.js';
import { Theater } from '../../models/Theater.js';
import { Show } from '../../models/Show.js';
import { verifyTicketToken } from '../../services/ticketService.js';
import { recordAudit } from '../../services/auditService.js';

const validateSchema = z.object({
  token: z.string().trim().min(32).max(200),
});

/**
 * Gate validation, for venue staff.
 *
 * Admission is single-use and recorded with a conditional update, so two
 * scanners reading the same QR code cannot both admit — the second is told the
 * ticket has already been used, and when.
 */
export const ticketsRouter = Router();

ticketsRouter.use(authenticate, requireActiveShowRunner);

ticketsRouter.post(
  '/validate',
  sensitiveLimiter,
  validate({ body: validateSchema }),
  asyncHandler(async (req, res) => {
    const decoded = verifyTicketToken(req.body.token);
    if (!decoded) {
      throw new ApiError(400, ERROR_CODES.TICKET_INVALID, 'This ticket is not valid');
    }

    const booking = await Booking.findById(decoded.bookingId);
    if (!booking || booking.ticketToken !== req.body.token) {
      throw new ApiError(400, ERROR_CODES.TICKET_INVALID, 'This ticket is not valid');
    }

    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
      throw new ApiError(
        400,
        ERROR_CODES.TICKET_INVALID,
        `This booking is ${booking.status}; the ticket is not valid`,
      );
    }

    // Staff may only admit at venues they manage.
    if (req.user.role !== ROLES.SUPER_ADMIN) {
      const show = await Show.findById(booking.showId).select('theaterId');
      const theater = await Theater.findById(show.theaterId);
      if (!theater?.isManagedBy(req.user._id)) {
        throw ApiError.forbidden(
          'This ticket is for a venue you do not manage',
          ERROR_CODES.NOT_THEATER_MANAGER,
        );
      }
    }

    const admitted = await Booking.findOneAndUpdate(
      { _id: booking._id, admittedAt: null },
      { admittedAt: new Date(), admittedBy: req.user._id },
      { new: true },
    );

    if (!admitted) {
      throw new ApiError(
        409,
        ERROR_CODES.TICKET_ALREADY_USED,
        `This ticket was already used at ${booking.admittedAt.toISOString()}`,
      );
    }

    await recordAudit({
      actor: req.user,
      action: AUDIT_ACTIONS.TICKET_ADMITTED,
      resourceType: 'Booking',
      resourceId: booking._id,
      after: { reference: booking.reference, seats: booking.seats.length },
      req,
    });

    res.json({
      data: {
        valid: true,
        reference: admitted.reference,
        movieTitle: admitted.snapshot.movieTitle,
        screenName: admitted.snapshot.screenName,
        startAt: admitted.snapshot.startAt,
        seats: admitted.activeSeats.map((seat) => seat.label),
        admittedAt: admitted.admittedAt,
      },
    });
  }),
);
