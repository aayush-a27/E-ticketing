import { Link } from 'react-router-dom';
import { MapPin, Projector } from 'lucide-react';
import { formatMoney, formatShowTime } from '../../utils/format.js';

/**
 * Shows grouped by venue, which is how someone actually decides: pick the
 * cinema you can get to, then the time.
 */
export function ShowtimeList({ shows }) {
  const byTheater = new Map();

  for (const show of shows) {
    const key = show.theaterId;
    if (!byTheater.has(key)) {
      byTheater.set(key, { theater: show.theater, shows: [] });
    }
    byTheater.get(key).shows.push(show);
  }

  const groups = [...byTheater.entries()].map(([id, group]) => ({
    id,
    ...group,
    shows: [...group.shows].sort((a, b) => new Date(a.startAt) - new Date(b.startAt)),
  }));

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.id} className="card-surface p-5">
          <header className="mb-4">
            <h3 className="text-lg text-ivory">{group.theater?.name ?? 'Venue'}</h3>
            {group.theater?.address && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-ivory-muted">
                <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {group.theater.address}
                  {group.theater.city ? `, ${group.theater.city}` : ''}
                </span>
              </p>
            )}
          </header>

          <ul className="flex flex-wrap gap-2.5">
            {group.shows.map((show) => (
              <li key={show.id}>
                <Link
                  to={`/shows/${show.id}/seats`}
                  className="neu neu-pressable flex min-w-24 flex-col items-center rounded-xl px-4 py-2.5 transition hover:text-amber-bright"
                  aria-label={`Book ${formatShowTime(show.startAt, show.timezone)} at ${
                    group.theater?.name ?? 'this venue'
                  }`}
                >
                  <span className="text-sm font-semibold text-ivory">
                    {formatShowTime(show.startAt, show.timezone)}
                  </span>
                  <span className="mt-0.5 text-[10px] uppercase tracking-wide text-ivory-muted">
                    {show.format} · {show.language}
                  </span>
                  {show.startingPricePaise !== null && (
                    <span className="mt-1 text-[11px] text-amber-brand">
                      from {formatMoney(show.startingPricePaise)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {group.shows[0]?.screen?.name && (
            <p className="mt-3.5 flex items-center gap-1.5 text-[11px] text-ivory-muted">
              <Projector className="size-3" aria-hidden="true" />
              {[...new Set(group.shows.map((show) => show.screen?.name).filter(Boolean))].join(', ')}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

/** The horizontal date strip used above a showtime list. */
export function DateStrip({ dates, selected, onSelect }) {
  return (
    <div
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2"
      role="tablist"
      aria-label="Choose a date"
    >
      {dates.map(({ key, date, label, weekday, isToday }) => {
        const active = key === selected;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(key)}
            className={[
              'flex min-w-16 shrink-0 flex-col items-center rounded-xl px-3.5 py-2.5 transition',
              active
                ? 'bg-amber-brand text-midnight'
                : 'neu text-ivory-dim hover:text-ivory',
            ].join(' ')}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
              {isToday ? 'Today' : weekday}
            </span>
            <span className="text-base font-semibold">{date}</span>
            <span className="text-[10px] opacity-80">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
