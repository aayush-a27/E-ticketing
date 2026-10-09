import { ApiError } from '../utils/ApiError.js';
import { ERROR_CODES } from '../constants/index.js';
import { getSettings } from './settingsService.js';

const BASIS_POINTS = 10_000;

/**
 * Applies a basis-point rate to an amount in paise and rounds half-up to the
 * nearest paisa. Every money calculation in the platform goes through this, so
 * rounding is consistent and a total can always be re-derived from its parts.
 */
export function applyRate(amountPaise, rateBasisPoints) {
  return Math.round((amountPaise * rateBasisPoints) / BASIS_POINTS);
}

/**
 * Computes what a customer pays, from the show's own price table and the
 * platform settings. Nothing here reads an amount from the client.
 *
 * Returns a snapshot that is stored verbatim on the booking: a later fee or tax
 * change must never alter what an existing booking says it cost.
 */
export async function calculatePricing({ show, seats, coupon = null, settings = null }) {
  const config = settings ?? (await getSettings());

  if (!Array.isArray(seats) || seats.length === 0) {
    throw ApiError.badRequest('Select at least one seat');
  }

  const lineItems = seats.map((seat) => {
    const basePaise = show.priceFor(seat.category);
    if (basePaise === null || basePaise === undefined) {
      throw ApiError.badRequest(
        `This show has no price for seat category "${seat.category}"`,
        [{ field: 'pricing', message: `Missing price for ${seat.category}` }],
        ERROR_CODES.PRICING_INCOMPLETE,
      );
    }
    return {
      seatId: seat.seatId,
      label: seat.label,
      category: seat.category,
      basePaise,
    };
  });

  const subtotalPaise = lineItems.reduce((sum, item) => sum + item.basePaise, 0);

  // Fees: percentage of the ticket subtotal plus a flat amount per ticket,
  // optionally capped per booking.
  const percentFeePaise = applyRate(subtotalPaise, config.fees?.percentBasisPoints ?? 0);
  const flatFeePaise = (config.fees?.flatPerTicketPaise ?? 0) * seats.length;
  let convenienceFeePaise = percentFeePaise + flatFeePaise;

  const cap = config.fees?.capPerBookingPaise;
  if (cap !== null && cap !== undefined && convenienceFeePaise > cap) {
    convenienceFeePaise = cap;
  }

  // Discount applies to the ticket subtotal only, never to tax or fees, and
  // can never exceed the subtotal.
  const discountPaise = coupon ? Math.min(calculateDiscount(coupon, subtotalPaise), subtotalPaise) : 0;
  const discountedSubtotalPaise = subtotalPaise - discountPaise;

  /**
   * Tax components are evaluated per ticket, because the threshold that
   * decides whether a component applies is a per-ticket price in India, not a
   * basket total.
   */
  const taxes = [];
  for (const component of config.taxComponents ?? []) {
    let taxableBase = 0;

    for (const item of lineItems) {
      // Spread any discount across tickets in proportion to their price, so
      // the threshold test uses what the customer actually pays for that seat.
      const share = subtotalPaise === 0 ? 0 : applyRate(discountPaise, Math.round((item.basePaise / subtotalPaise) * BASIS_POINTS));
      const effectivePaise = item.basePaise - share;
      if (effectivePaise >= (component.appliesAbovePaise ?? 0)) {
        taxableBase += effectivePaise;
      }
    }

    if (component.appliesTo === 'fees') {
      taxableBase = convenienceFeePaise;
    } else if (component.appliesTo === 'ticket_and_fees') {
      taxableBase += convenienceFeePaise;
    }

    if (taxableBase <= 0) continue;

    const amountPaise = applyRate(taxableBase, component.rateBasisPoints);
    if (amountPaise > 0) {
      taxes.push({
        name: component.name,
        rateBasisPoints: component.rateBasisPoints,
        taxableBasePaise: taxableBase,
        amountPaise,
      });
    }
  }

  const taxTotalPaise = taxes.reduce((sum, tax) => sum + tax.amountPaise, 0);
  const totalPaise = discountedSubtotalPaise + convenienceFeePaise + taxTotalPaise;

  return {
    currency: config.currency ?? 'INR',
    seatCount: seats.length,
    lineItems,
    subtotalPaise,
    discountPaise,
    discountedSubtotalPaise,
    convenienceFeePaise,
    feeBreakdown: { percentFeePaise, flatFeePaise, capApplied: convenienceFeePaise === cap },
    taxes,
    taxTotalPaise,
    totalPaise,
    couponCode: coupon?.code ?? null,
    calculatedAt: new Date(),
  };
}

function calculateDiscount(coupon, subtotalPaise) {
  if (coupon.type === 'flat') return coupon.valuePaise ?? 0;
  if (coupon.type === 'percent') {
    const raw = applyRate(subtotalPaise, coupon.valueBasisPoints ?? 0);
    return coupon.maxDiscountPaise ? Math.min(raw, coupon.maxDiscountPaise) : raw;
  }
  return 0;
}

/** For display: 24500 -> "₹245.00". */
export function formatPaise(paise, currency = 'INR') {
  const symbol = currency === 'INR' ? '₹' : '';
  return `${symbol}${(paise / 100).toFixed(2)}`;
}
