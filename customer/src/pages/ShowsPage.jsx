import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import { fetchShows } from '../services/showService.js';
import { useResource } from '../hooks/useResource.js';
import { useDateStrip } from '../hooks/useDateStrip.js';
import { useCity } from '../context/CityContext.jsx';
import { DateStrip, ShowtimeList } from '../components/theaters/ShowtimeList.jsx';
import { EmptyState, ErrorState, ShowListSkeleton } from '../components/common/States.jsx';
import { CitySelector } from '../components/layout/CitySelector.jsx';
import { toDateKey } from '../utils/format.js';

const FORMATS = ['2D', '3D', 'IMAX', '4DX', 'DOLBY'];

export default function ShowsPage() {
  const { city, cityLabel } = useCity();
  const dates = useDateStrip(7);
  const [searchParams, setSearchParams] = useSearchParams();

  // In the URL so a chosen day and format survive a refresh and can be shared.
  const selectedDate = searchParams.get('date') ?? toDateKey(new Date());
  const format = searchParams.get('format') ?? '';
  const theaterId = searchParams.get('theaterId') ?? '';

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(
    ({ signal }) =>
      fetchShows(
        { city: city ?? undefined, date: selectedDate, format, theaterId, limit: 100 },
        { signal },
      ),
    [city, selectedDate, format, theaterId],
  );

  const { data, loading, error, refetch } = useResource(load, [
    city,
    selectedDate,
    format,
    theaterId,
  ]);

  const shows = data?.data ?? [];

  return (
    <div className="page-shell py-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl text-ivory sm:text-4xl">What&rsquo;s on</h1>
          <p className="mt-2 text-sm text-ivory-muted">
            {cityLabel
              ? `Shows playing in ${cityLabel}`
              : 'Choose a city to see what is playing near you'}
          </p>
        </div>
        <CitySelector />
      </header>

      <div className="mb-5">
        <DateStrip
          dates={dates}
          selected={selectedDate}
          onSelect={(value) => update({ date: value })}
        />
      </div>

      <div className="mb-7 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!format}
          onClick={() => update({ format: '' })}
          className={[
            'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
            !format ? 'neu text-amber-bright' : 'border border-slate-line text-ivory-dim hover:text-ivory',
          ].join(' ')}
        >
          All formats
        </button>
        {FORMATS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={format === value}
            onClick={() => update({ format: format === value ? '' : value })}
            className={[
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
              format === value
                ? 'neu text-amber-bright'
                : 'border border-slate-line text-ivory-dim hover:text-ivory',
            ].join(' ')}
          >
            {value}
          </button>
        ))}
      </div>

      {loading ? (
        <ShowListSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : shows.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Nothing scheduled"
          description={
            cityLabel
              ? `No shows in ${cityLabel} on this date. Try another day, or a different city.`
              : 'Pick a city to see showtimes, or try another date.'
          }
          action={<CitySelector />}
        />
      ) : (
        <>
          <p className="mb-5 text-sm text-ivory-muted" aria-live="polite">
            {shows.length} {shows.length === 1 ? 'show' : 'shows'}
          </p>
          <ShowtimeList shows={shows} />
        </>
      )}
    </div>
  );
}
