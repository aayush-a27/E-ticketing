import { applyRate } from './pricingService.js';
import { getSettings } from './settingsService.js';

/**
 * Decides what a cancellation is worth. Pure: it reads settings and returns a
 * decision, and never writes anything, so it can be used both to quote
 * eligibility to a customer and to settle the actual refund.
 *
 * Two layers, in order:
 *   1. A grace window measured from when the booking was made — cancel soon
 *      after booking and the refund is full, whatever the showtime rule says.
 *   2. Otherwise the first rule whose window the showtime still falls inside.
 *      Rules are stored widest-first, so the first match is the most generous
 *      one the customer qualifies for.
 */
export async function evaluateCancellation({
  booking,
  seatIds = null,
  now = new Date(),
  settings = null,
}) {
  const config = settings ?? (await getSettings());
  const policy = config.cancellation ?? {};

  if (policy.enabled === false) {
    return { eligible: false, reason: 'Cancellation is not available on this platform' };
  }

  const startAt = booking.snapshot?.startAt;
  if (!startAt) {
    return { eligible: false, reason: 'This booking has no showtime' };
  }

  if (startAt <= now) {
    return { eligible: false, reason: 'The show has already started' };
  }

  // Which seats are being given up, and what they were worth.
  const live = booking.seats.filter((seat) => !seat.cancelledAt);
  const targeted = seatIds?.length
    ? live.filter((seat) => seatIds.includes(seat.seatId))
    : live;

  if (targeted.length === 0) {
    return { eligible: false, reason: 'No cancellable seats in this booking' };
  }

  const seatsValuePaise = targeted.reduce((sum, seat) => sum + seat.pricePaise, 0);
  const isWholeBooking = targeted.length === live.length;

  const hoursBeforeShow = (startAt.getTime() - now.getTime()) / 3_600_000;
  const minutesSinceBooking = (now.getTime() - booking.createdAt.getTime()) / 60_000;
  const graceWindowMinutes = policy.graceWindowMinutes ?? 0;
  const withinGraceWindow = minutesSinceBooking <= graceWindowMinutes;

  let rule;
  if (withinGraceWindow) {
    rule = {
      label: `Within ${graceWindowMinutes} minutes of booking`,
      minHoursBeforeShow: 0,
      refundPercentBasisPoints: 10_000,
      refundFees: true,
    };
  } else {
    rule = (policy.rules ?? []).find((entry) => hoursBeforeShow >= entry.minHoursBeforeShow);
  }

  if (!rule) {
    return {
      eligible: false,
      reason: 'This booking is too close to showtime to cancel',
      hoursBeforeShow,
    };
  }

  // The seat value is refunded at the rule's rate. Fees come back only when
  // the rule says so, and only in proportion to the seats being cancelled.
  const seatRefundPaise = applyRate(seatsValuePaise, rule.refundPercentBasisPoints);

  let feeRefundPaise = 0;
  if (rule.refundFees) {
    const totalFees =
      (booking.pricing?.convenienceFeePaise ?? 0) + (booking.pricing?.taxTotalPaise ?? 0);
    const subtotal = booking.pricing?.subtotalPaise ?? 0;
    feeRefundPaise =
      subtotal > 0
        ? applyRate(totalFees, Math.round((seatsValuePaise / subtotal) * 10_000))
        : 0;
  }

  const refundablePaise = seatRefundPaise + feeRefundPaise;

  return {
    eligible: true,
    isWholeBooking,
    seatIds: targeted.map((seat) => seat.seatId),
    seatsValuePaise,
    seatRefundPaise,
    feeRefundPaise,
    refundablePaise,
    hoursBeforeShow,
    withinGraceWindow,
    policyApplied: {
      label: rule.label,
      minHoursBeforeShow: rule.minHoursBeforeShow,
      refundPercentBasisPoints: rule.refundPercentBasisPoints,
      refundFees: Boolean(rule.refundFees),
      withinGraceWindow,
      hoursBeforeShow: Number(hoursBeforeShow.toFixed(2)),
    },
  };
}
