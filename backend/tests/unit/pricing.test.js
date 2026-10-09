import { describe, it, expect } from 'vitest';
import { calculatePricing, applyRate, formatPaise } from '../../src/services/pricingService.js';

/** A stand-in for a Show document: only priceFor() is needed. */
function showWithPrices(prices) {
  return {
    priceFor(category) {
      return Object.hasOwn(prices, category) ? prices[category] : null;
    },
  };
}

const settings = {
  currency: 'INR',
  fees: { percentBasisPoints: 200, flatPerTicketPaise: 2000, capPerBookingPaise: null },
  taxComponents: [
    { name: 'GST', rateBasisPoints: 1800, appliesAbovePaise: 10_000, appliesTo: 'ticket' },
  ],
};

const seat = (seatId, category) => ({ seatId, label: seatId, category });

describe('applyRate', () => {
  it('applies basis points and rounds half-up', () => {
    expect(applyRate(10_000, 1800)).toBe(1800); // 18% of ₹100
    expect(applyRate(33_333, 1800)).toBe(6000); // 5999.94 -> 6000
    expect(applyRate(0, 1800)).toBe(0);
    expect(applyRate(10_000, 0)).toBe(0);
  });
});

describe('calculatePricing', () => {
  it('prices a single ticket with fee and tax', async () => {
    const show = showWithPrices({ Gold: 25_000 }); // ₹250

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Gold')],
      settings,
    });

    expect(quote.subtotalPaise).toBe(25_000);
    // 2% of 25000 = 500, plus ₹20 flat = 2500
    expect(quote.convenienceFeePaise).toBe(2500);
    // 18% of 25000 (above the ₹100 threshold)
    expect(quote.taxTotalPaise).toBe(4500);
    expect(quote.totalPaise).toBe(25_000 + 2500 + 4500);
  });

  it('charges the flat fee per ticket, not per booking', async () => {
    const show = showWithPrices({ Silver: 15_000 });

    const one = await calculatePricing({ show, seats: [seat('A1', 'Silver')], settings });
    const three = await calculatePricing({
      show,
      seats: [seat('A1', 'Silver'), seat('A2', 'Silver'), seat('A3', 'Silver')],
      settings,
    });

    expect(one.feeBreakdown.flatFeePaise).toBe(2000);
    expect(three.feeBreakdown.flatFeePaise).toBe(6000);
    expect(three.subtotalPaise).toBe(45_000);
  });

  it('mixes seat categories at their own prices', async () => {
    const show = showWithPrices({ Silver: 15_000, Gold: 25_000, Recliner: 45_000 });

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Silver'), seat('B1', 'Gold'), seat('C1', 'Recliner')],
      settings,
    });

    expect(quote.subtotalPaise).toBe(85_000);
    expect(quote.lineItems.map((item) => item.basePaise)).toEqual([15_000, 25_000, 45_000]);
  });

  /**
   * The threshold is a per-ticket test, so a basket of cheap tickets that sums
   * past the threshold must still be untaxed.
   */
  it('applies the tax threshold per ticket, not to the basket', async () => {
    const show = showWithPrices({ Economy: 8_000 }); // ₹80, under ₹100

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Economy'), seat('A2', 'Economy')],
      settings,
    });

    expect(quote.subtotalPaise).toBe(16_000);
    expect(quote.taxTotalPaise).toBe(0);
  });

  it('taxes only the tickets that clear the threshold', async () => {
    const show = showWithPrices({ Economy: 8_000, Gold: 25_000 });

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Economy'), seat('B1', 'Gold')],
      settings,
    });

    // Only the ₹250 ticket is taxable.
    expect(quote.taxes[0].taxableBasePaise).toBe(25_000);
    expect(quote.taxTotalPaise).toBe(4500);
  });

  it('caps the convenience fee when a cap is configured', async () => {
    const show = showWithPrices({ Gold: 25_000 });
    const capped = {
      ...settings,
      fees: { percentBasisPoints: 200, flatPerTicketPaise: 2000, capPerBookingPaise: 5000 },
    };

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Gold'), seat('A2', 'Gold'), seat('A3', 'Gold'), seat('A4', 'Gold')],
      settings: capped,
    });

    // Uncapped this would be 2000 + 8000 = 10000.
    expect(quote.convenienceFeePaise).toBe(5000);
    expect(quote.feeBreakdown.capApplied).toBe(true);
  });

  it('applies a percentage coupon to the ticket subtotal only', async () => {
    const show = showWithPrices({ Gold: 25_000 });

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Gold'), seat('A2', 'Gold')],
      coupon: { code: 'HALF', type: 'percent', valueBasisPoints: 5000 },
      settings,
    });

    expect(quote.subtotalPaise).toBe(50_000);
    expect(quote.discountPaise).toBe(25_000);
    expect(quote.discountedSubtotalPaise).toBe(25_000);
    // The fee is still based on the undiscounted subtotal plus flat per ticket.
    expect(quote.convenienceFeePaise).toBe(1000 + 4000);
    expect(quote.couponCode).toBe('HALF');
  });

  it('never lets a discount exceed the subtotal', async () => {
    const show = showWithPrices({ Silver: 10_000 });

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Silver')],
      coupon: { code: 'TOOBIG', type: 'flat', valuePaise: 999_999 },
      settings,
    });

    expect(quote.discountPaise).toBe(10_000);
    expect(quote.discountedSubtotalPaise).toBe(0);
    expect(quote.totalPaise).toBeGreaterThanOrEqual(0);
  });

  it('honours a coupon max discount', async () => {
    const show = showWithPrices({ Gold: 100_000 });

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Gold')],
      coupon: { code: 'CAP', type: 'percent', valueBasisPoints: 5000, maxDiscountPaise: 10_000 },
      settings,
    });

    expect(quote.discountPaise).toBe(10_000);
  });

  it('refuses a seat category the show does not price', async () => {
    const show = showWithPrices({ Gold: 25_000 });

    await expect(
      calculatePricing({ show, seats: [seat('A1', 'Platinum')], settings }),
    ).rejects.toMatchObject({ code: 'PRICING_INCOMPLETE' });
  });

  it('refuses an empty seat list', async () => {
    await expect(
      calculatePricing({ show: showWithPrices({ Gold: 1 }), seats: [], settings }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('keeps every amount an integer number of paise', async () => {
    const show = showWithPrices({ Odd: 33_333 });

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Odd'), seat('A2', 'Odd'), seat('A3', 'Odd')],
      settings,
    });

    for (const value of [
      quote.subtotalPaise,
      quote.convenienceFeePaise,
      quote.taxTotalPaise,
      quote.totalPaise,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('reconciles: total equals the sum of its parts', async () => {
    const show = showWithPrices({ Silver: 15_000, Gold: 25_000 });

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Silver'), seat('B1', 'Gold')],
      coupon: { code: 'TEN', type: 'percent', valueBasisPoints: 1000 },
      settings,
    });

    expect(quote.totalPaise).toBe(
      quote.subtotalPaise - quote.discountPaise + quote.convenienceFeePaise + quote.taxTotalPaise,
    );
  });

  it('handles a zero-fee, zero-tax configuration', async () => {
    const show = showWithPrices({ Free: 0 });

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Free')],
      settings: { currency: 'INR', fees: {}, taxComponents: [] },
    });

    expect(quote.totalPaise).toBe(0);
    expect(quote.taxes).toEqual([]);
  });

  it('can tax fees as well as tickets when configured', async () => {
    const show = showWithPrices({ Gold: 25_000 });
    const taxedFees = {
      ...settings,
      taxComponents: [
        { name: 'GST', rateBasisPoints: 1800, appliesAbovePaise: 0, appliesTo: 'ticket_and_fees' },
      ],
    };

    const quote = await calculatePricing({
      show,
      seats: [seat('A1', 'Gold')],
      settings: taxedFees,
    });

    expect(quote.taxes[0].taxableBasePaise).toBe(25_000 + 2500);
  });
});

describe('formatPaise', () => {
  it('renders paise as rupees', () => {
    expect(formatPaise(24_500)).toBe('₹245.00');
    expect(formatPaise(0)).toBe('₹0.00');
    expect(formatPaise(1)).toBe('₹0.01');
  });
});
