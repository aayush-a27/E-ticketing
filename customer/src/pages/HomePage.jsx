import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, MapPin, Ticket, TrendingUp } from 'lucide-react';
import { fetchMovies } from '../services/movieService.js';
import { fetchShows } from '../services/showService.js';
import { useResource } from '../hooks/useResource.js';
import { useCity } from '../context/CityContext.jsx';
import { MovieGrid } from '../components/movies/MovieCard.jsx';
import { MovieGridSkeleton, EmptyState, ErrorState } from '../components/common/States.jsx';
import { Button } from '../components/common/Button.jsx';
import { CitySelector } from '../components/layout/CitySelector.jsx';
import { formatMoney, formatShowTime } from '../utils/format.js';

function SectionHeading({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl text-ivory sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1.5 text-sm text-ivory-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * The hero. Composed on φ: the headline column takes 1.618 of the panel
 * beside it, which is the one place on this page the ratio is doing visible
 * work.
 */
function Hero({ city, cityLabel }) {
  return (
    <section className="relative overflow-hidden border-b border-slate-line">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 20% 0%, rgba(212,162,76,0.16), transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="page-shell relative grid items-center gap-10 py-16 md:grid-cols-[1.618fr_1fr] md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-brand/30 bg-amber-brand/10 px-3 py-1 text-xs font-medium text-amber-bright">
            <Ticket className="size-3.5" aria-hidden="true" />
            Book in a few taps
          </p>

          <h1 className="text-4xl leading-[1.1] text-ivory sm:text-5xl lg:text-6xl">
            The film starts
            <br />
            <span className="text-amber-brand">when you do.</span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-ivory-dim sm:text-lg">
            Real showtimes from real venues{cityLabel ? ` in ${cityLabel}` : ''}. Pick your seat,
            pay once, and walk in with a code on your phone.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button as={Link} to="/movies" size="lg">
              Browse movies
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button as={Link} to="/shows" variant="secondary" size="lg">
              What&rsquo;s on today
            </Button>
          </div>

          {!city && (
            <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-ivory-muted">
              <MapPin className="size-4 text-amber-brand" aria-hidden="true" />
              Choose your city to see nearby showtimes
              <CitySelector />
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.12 }}
          className="hidden md:block"
        >
          <div className="neu rounded-2xl p-6">
            <p className="font-display text-sm text-ivory-muted">Now booking</p>
            <p className="mt-2 font-display text-3xl text-ivory">
              {cityLabel ?? 'Across the country'}
            </p>
            <div className="mt-6 space-y-3 text-sm">
              {[
                'Live seat availability',
                'Server-verified payment',
                'QR ticket at the gate',
              ].map((line) => (
                <div key={line} className="flex items-center gap-2.5 text-ivory-dim">
                  <span className="size-1.5 rounded-full bg-amber-brand" aria-hidden="true" />
                  {line}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** A compact show row, used for the "on today" strip. */
function ShowStrip({ shows }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shows.map((show) => (
        <Link
          key={show.id}
          to={`/shows/${show.id}/seats`}
          className="card-surface group flex items-center gap-4 p-4 transition hover:border-amber-brand/50"
        >
          {show.movie?.poster?.url ? (
            <img
              src={show.movie.poster.url}
              alt=""
              loading="lazy"
              className="size-16 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="size-16 shrink-0 rounded-lg bg-charcoal-soft" aria-hidden="true" />
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ivory group-hover:text-amber-bright">
              {show.movie?.title}
            </p>
            <p className="truncate text-xs text-ivory-muted">{show.theater?.name}</p>
            <p className="mt-1 text-xs text-ivory-dim">
              {formatShowTime(show.startAt, show.timezone)}
              {show.startingPricePaise !== null && (
                <span className="text-ivory-muted">
                  {' '}
                  · from {formatMoney(show.startingPricePaise)}
                </span>
              )}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { city, cityLabel } = useCity();

  const loadFeatured = useCallback(
    ({ signal }) => fetchMovies({ featured: 'true', limit: 5 }, { signal }),
    [],
  );
  const loadLatest = useCallback(
    ({ signal }) => fetchMovies({ limit: 10, sort: '-releaseDate' }, { signal }),
    [],
  );
  const loadShows = useCallback(
    ({ signal }) => fetchShows({ city: city ?? undefined, limit: 6 }, { signal }),
    [city],
  );

  const featured = useResource(loadFeatured, []);
  const latest = useResource(loadLatest, []);
  const shows = useResource(loadShows, [city]);

  const featuredMovies = featured.data?.data ?? [];
  const latestMovies = latest.data?.data ?? [];
  const upcomingShows = shows.data?.data ?? [];

  return (
    <>
      <Hero city={city} cityLabel={cityLabel} />

      <div className="page-shell space-y-16 py-14">
        {/* Featured is omitted entirely when nothing is flagged, rather than
            showing an empty shelf. */}
        {featured.loading ? (
          <section>
            <SectionHeading title="Featured" />
            <MovieGridSkeleton count={5} />
          </section>
        ) : (
          featuredMovies.length > 0 && (
            <section>
              <SectionHeading
                title="Featured"
                subtitle="Hand-picked by our team"
                action={
                  <Link
                    to="/movies?featured=true"
                    className="inline-flex items-center gap-1.5 text-sm text-amber-bright hover:underline"
                  >
                    See all <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                }
              />
              <MovieGrid movies={featuredMovies} />
            </section>
          )
        )}

        <section>
          <SectionHeading
            title="In cinemas"
            subtitle="The latest releases on CineReserve"
            action={
              <Link
                to="/movies"
                className="inline-flex items-center gap-1.5 text-sm text-amber-bright hover:underline"
              >
                All movies <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />

          {latest.loading ? (
            <MovieGridSkeleton />
          ) : latest.error ? (
            <ErrorState error={latest.error} onRetry={latest.refetch} />
          ) : latestMovies.length === 0 ? (
            <EmptyState
              title="No movies yet"
              description="Nothing has been published on CineReserve so far. Check back soon."
            />
          ) : (
            <MovieGrid movies={latestMovies} />
          )}
        </section>

        <section>
          <SectionHeading
            title={cityLabel ? `On today in ${cityLabel}` : 'Showing soon'}
            subtitle="Next available shows"
            action={
              <Link
                to="/shows"
                className="inline-flex items-center gap-1.5 text-sm text-amber-bright hover:underline"
              >
                All showtimes <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          />

          {shows.loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="card-surface h-24 animate-pulse" />
              ))}
            </div>
          ) : shows.error ? (
            <ErrorState error={shows.error} onRetry={shows.refetch} />
          ) : upcomingShows.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title={cityLabel ? `No shows in ${cityLabel} yet` : 'No shows scheduled'}
              description="Nothing is scheduled right now. Try another city, or check back later."
              action={<CitySelector />}
            />
          ) : (
            <ShowStrip shows={upcomingShows} />
          )}
        </section>
      </div>
    </>
  );
}
