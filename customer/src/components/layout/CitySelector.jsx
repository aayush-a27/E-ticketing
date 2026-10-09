import { useMemo, useState } from 'react';
import { Check, MapPin, Search } from 'lucide-react';
import { useCity } from '../../context/CityContext.jsx';
import { Modal } from '../common/Modal.jsx';
import { EmptyState } from '../common/States.jsx';

/**
 * Manual city selection. Geolocation is deliberately never requested: a
 * permission prompt on arrival is hostile, and the city is a one-tap choice.
 */
export function CitySelector({ compact = false }) {
  const { city, cityLabel, setCity, cities, loadingCities } = useCity();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return cities;
    return cities.filter((entry) => entry.label.toLowerCase().includes(term));
  }, [cities, query]);

  const choose = (value) => {
    setCity(value);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loadingCities}
        className="neu neu-pressable inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm text-ivory transition hover:text-amber-bright disabled:opacity-50"
        aria-label={cityLabel ? `Change city, currently ${cityLabel}` : 'Choose your city'}
      >
        <MapPin className="size-4 text-amber-brand" aria-hidden="true" />
        {!compact && (
          <span className="max-w-28 truncate">
            {loadingCities ? 'Loading…' : (cityLabel ?? 'Choose city')}
          </span>
        )}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose your city"
        description="We will show what is playing near you."
      >
        <div className="relative mb-4">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ivory-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search cities"
            aria-label="Search cities"
            className="neu-inset w-full rounded-xl py-3 pl-10 pr-4 text-ivory placeholder:text-ivory-muted/60"
          />
        </div>

        {cities.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No cities yet"
            description="No venue has been listed on CineReserve so far. Check back soon."
          />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-ivory-muted">
            No city matches “{query}”.
          </p>
        ) : (
          <ul className="grid max-h-80 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {filtered.map((entry) => {
              const selected = entry.city === city;
              return (
                <li key={entry.city}>
                  <button
                    type="button"
                    onClick={() => choose(entry.city)}
                    aria-current={selected ? 'true' : undefined}
                    className={[
                      'flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm transition',
                      selected
                        ? 'neu text-amber-bright'
                        : 'text-ivory-dim hover:bg-charcoal-soft hover:text-ivory',
                    ].join(' ')}
                  >
                    <span>
                      {entry.label}
                      <span className="ml-2 text-xs text-ivory-muted">
                        {entry.theaterCount} {entry.theaterCount === 1 ? 'venue' : 'venues'}
                      </span>
                    </span>
                    {selected && <Check className="size-4 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}
