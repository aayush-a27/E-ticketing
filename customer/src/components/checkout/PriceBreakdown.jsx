import { formatMoney } from '../../utils/format.js';

function Line({ label, value, muted = false, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className={muted ? 'text-ivory-muted' : 'text-ivory-dim'}>{label}</span>
      <span
        className={[
          'shrink-0 tabular-nums',
          strong ? 'text-lg font-semibold text-ivory' : 'text-ivory',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Renders the server's quote exactly as given. Nothing here is added up on
 * the client — every figure, including the total, comes from the backend.
 */
export function PriceBreakdown({ pricing, seats = [] }) {
  if (!pricing) return null;
  const currency = pricing.currency ?? 'INR';

  return (
    <div className="space-y-3">
      {seats.length > 0 && (
        <div className="space-y-1.5 border-b border-slate-line pb-3">
          {seats.map((seat) => (
            <Line
              key={seat.seatId}
              label={`${seat.label} · ${seat.category}`}
              value={formatMoney(seat.pricePaise, currency)}
              muted
            />
          ))}
        </div>
      )}

      <Line
        label={`Tickets (${pricing.seatCount ?? seats.length})`}
        value={formatMoney(pricing.subtotalPaise, currency)}
      />

      {pricing.discountPaise > 0 && (
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="text-status-good">
            Discount{pricing.couponCode ? ` (${pricing.couponCode})` : ''}
          </span>
          <span className="shrink-0 tabular-nums text-status-good">
            −{formatMoney(pricing.discountPaise, currency)}
          </span>
        </div>
      )}

      {pricing.convenienceFeePaise > 0 && (
        <Line
          label="Convenience fee"
          value={formatMoney(pricing.convenienceFeePaise, currency)}
        />
      )}

      {pricing.taxes?.map((tax) => (
        <Line
          key={tax.name}
          label={`${tax.name} (${(tax.rateBasisPoints / 100).toFixed(0)}%)`}
          value={formatMoney(tax.amountPaise, currency)}
        />
      ))}

      <div className="border-t border-slate-line pt-3">
        <Line
          label="Total payable"
          value={formatMoney(pricing.totalPaise, currency)}
          strong
        />
      </div>
    </div>
  );
}
