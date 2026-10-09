import { memo } from 'react';
import { formatMoney } from '../../utils/format.js';

/**
 * Seat states, and what each one means to the customer. Only `available` is
 * selectable — the rest are rendered but not interactive, so the UI can never
 * offer a seat the server would refuse.
 */
const SEAT_STYLES = {
  available: 'neu neu-pressable text-ivory-dim hover:text-amber-bright cursor-pointer',
  selected: 'bg-amber-brand text-midnight font-semibold shadow-lg shadow-amber-brand/25',
  held: 'bg-charcoal-soft text-ivory-muted/40 cursor-not-allowed',
  booked: 'bg-charcoal-soft text-ivory-muted/30 cursor-not-allowed line-through',
  blocked: 'bg-charcoal-soft/50 text-ivory-muted/25 cursor-not-allowed',
  unavailable: 'opacity-0 pointer-events-none',
};

const LEGEND = [
  { state: 'available', label: 'Available' },
  { state: 'selected', label: 'Your pick' },
  { state: 'held', label: 'Being booked' },
  { state: 'booked', label: 'Sold' },
  { state: 'blocked', label: 'Unavailable' },
];

function Seat({ seat, selected, onToggle, disabled }) {
  const state = selected ? 'selected' : seat.state;
  const interactive = seat.state === 'available' || selected;

  // Aisles and gaps hold their grid position but are never drawn as seats.
  if (seat.kind !== 'seat') {
    return <div className="size-7 sm:size-8" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      disabled={!interactive || disabled}
      onClick={() => onToggle(seat)}
      aria-label={`Seat ${seat.label}, ${seat.category}, ${formatMoney(seat.pricePaise)}${
        interactive ? '' : `, ${seat.state}`
      }`}
      aria-pressed={selected}
      className={[
        'flex size-7 items-center justify-center rounded-md text-[9px] font-medium transition-all duration-150 sm:size-8 sm:text-[10px]',
        SEAT_STYLES[state] ?? SEAT_STYLES.unavailable,
      ].join(' ')}
    >
      {seat.number}
    </button>
  );
}

const MemoSeat = memo(Seat);

export function SeatLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
      {LEGEND.map((item) => (
        <div key={item.state} className="flex items-center gap-2 text-xs text-ivory-muted">
          <span
            className={`size-4 rounded ${SEAT_STYLES[item.state].split(' ').slice(0, 2).join(' ')}`}
            aria-hidden="true"
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}

/**
 * The auditorium. Seats are laid out on the x/y grid the backend returns, so
 * the map matches the real room including its aisles.
 */
export function SeatMap({ seatMap, selectedIds, onToggle, disabled = false }) {
  const rows = new Map();
  for (const seat of seatMap.seats) {
    if (!rows.has(seat.row)) rows.set(seat.row, []);
    rows.get(seat.row).push(seat);
  }

  const orderedRows = [...rows.entries()]
    .map(([row, seats]) => ({ row, seats: [...seats].sort((a, b) => a.x - b.x) }))
    .sort((a, b) => a.row.localeCompare(b.row));

  const selected = new Set(selectedIds);

  return (
    <div className="space-y-6">
      <div className="text-center">
        {/* The screen, drawn as a curve so orientation is obvious at a glance. */}
        <div className="mx-auto h-2 w-3/5 max-w-md rounded-[50%] bg-gradient-to-b from-amber-brand/60 to-transparent" />
        <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-ivory-muted">Screen</p>
      </div>

      {/* Horizontal scroll is confined here, never the page. */}
      <div className="overflow-x-auto pb-2">
        <div className="mx-auto w-max space-y-1.5 px-2">
          {orderedRows.map(({ row, seats }) => (
            <div key={row} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-right text-[10px] font-semibold text-ivory-muted">
                {row}
              </span>
              <div className="flex gap-1.5">
                {seats.map((seat) => (
                  <MemoSeat
                    key={seat.seatId}
                    seat={seat}
                    selected={selected.has(seat.seatId)}
                    onToggle={onToggle}
                    disabled={disabled}
                  />
                ))}
              </div>
              <span className="w-4 shrink-0 text-[10px] font-semibold text-ivory-muted">{row}</span>
            </div>
          ))}
        </div>
      </div>

      {seatMap.categories?.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-line pt-5">
          {[...seatMap.categories]
            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
            .map((category) => (
              <div key={category.name} className="text-xs">
                <span className="font-medium text-ivory">{category.name}</span>
                <span className="ml-1.5 text-amber-brand">
                  {formatMoney(category.pricePaise)}
                </span>
              </div>
            ))}
        </div>
      )}

      <SeatLegend />
    </div>
  );
}
