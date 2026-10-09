import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, Film, PlayCircle } from 'lucide-react';
import { fetchMovie } from '../services/movieService.js';
import { fetchShows } from '../services/showService.js';
import { useResource } from '../hooks/useResource.js';
import { useDateStrip } from '../hooks/useDateStrip.js';
import { useCity } from '../context/CityContext.jsx';
import { DateStrip, ShowtimeList } from '../components/theaters/ShowtimeList.jsx';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  ShowListSkeleton,
} from '../components/common/States.jsx';
import { CitySelector } from '../components/layout/CitySelector.jsx';
import { Button } from '../components/common/Button.jsx';
import { formatRuntime, toDateKey } from '../utils/format.js';

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ivory-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ivory-dim">{value}</dd>
    </div>
  );
}

export default function MovieDetailPage() {
  const { slug } = useParams();
  const { city, cityLabel } = useCity();
  const dates = useDateStrip(7);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

  // Everything comes from the URL and the API, so a refresh or a shared link
  // works exactly like arriving from the grid.
  const loadMovie = useCallback(({ signal }) => fetchMovie(slug, { signal }), [slug]);
  const movie = useResource(loadMovie, [slug]);

  const movieId = movie.data?.id;
  const loadShows = useCallback(
    ({ signal }) =>
      fetchShows({ movieId, city: city ?? undefined, date: selectedDate, limit: 100 }, { signal }),
    [movieId, city, selectedDate],
  );
  const shows = useResource(loadShows, [movieId, city, selectedDate], {
    enabled: Boolean(movieId),
  });

  if (movie.loading) return <LoadingBlock label="Loading movie" />;

  if (movie.error) {
    return (
      <div className="page-shell py-16">
        <ErrorState error={movie.error} onRetry={movie.refetch} />
        <div className="mt-6 text-center">
          <Button as={Link} to="/movies" variant="secondary">
            Back to movies
          </Button>
        </div>
      </div>
    );
  }

  const film = movie.data;
  const showList = shows.data?.data ?? [];

  return (
    <article>
      <div className="relative">
        {film.backdrop?.url && (
          <div className="absolute inset-0 h-80 overflow-hidden" aria-hidden="true">
            <img src={film.backdrop.url} alt="" className="size-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-gradient-to-b from-midnight/40 via-midnight/80 to-midnight" />
          </div>
        )}

        <div className="page-shell relative py-10">
          <Link
            to="/movies"
            className="mb-7 inline-flex items-center gap-1.5 text-sm text-ivory-muted transition hover:text-ivory"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All movies
          </Link>

          {/* φ: the text column is 1.618 of the poster column. */}
          <div className="grid gap-8 md:grid-cols-[1fr_1.618fr]">
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="mx-auto w-full max-w-64 md:mx-0 md:max-w-none"
            >
              <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-slate-line bg-charcoal shadow-2xl">
                {film.poster?.url ? (
                  <img
                    src={film.poster.url}
                    alt={`Poster for ${film.title}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <Film className="size-10 text-ivory-muted/40" aria-hidden="true" />
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
            >
              <h1 className="text-3xl text-ivory sm:text-4xl lg:text-5xl">{film.title}</h1>
              {film.tagline && (
                <p className="mt-2 font-display text-lg italic text-amber-brand/90">
                  {film.tagline}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2.5 text-sm">
                {film.certification && (
                  <span className="rounded-md border border-slate-line px-2 py-0.5 text-xs font-semibold text-ivory">
                    {film.certification}
                  </span>
                )}
                {film.runtimeMinutes && (
                  <span className="inline-flex items-center gap-1.5 text-ivory-dim">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {formatRuntime(film.runtimeMinutes)}
                  </span>
                )}
                {film.genres?.length > 0 && (
                  <span className="text-ivory-dim">{film.genres.join(' · ')}</span>
                )}
              </div>

              {film.synopsis && (
                <p className="mt-6 max-w-2xl leading-relaxed text-ivory-dim">{film.synopsis}</p>
              )}

              <dl className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3">
                <Fact label="Languages" value={film.languages?.join(', ')} />
                <Fact label="Subtitles" value={film.subtitles?.join(', ')} />
                <Fact label="Director" value={film.director} />
                <Fact
                  label="Release"
                  value={
                    film.releaseDate
                      ? new Intl.DateTimeFormat('en-IN', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        }).format(new Date(film.releaseDate))
                      : null
                  }
                />
              </dl>

              {film.cast?.length > 0 && (
                <div className="mt-7">
                  <h2 className="mb-2.5 text-xs uppercase tracking-wider text-ivory-muted">Cast</h2>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ivory-dim">
                    {film.cast.slice(0, 8).map((member) => (
                      <li key={`${member.name}-${member.character ?? ''}`}>
                        {member.name}
                        {member.character && (
                          <span className="text-ivory-muted"> as {member.character}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-8 flex flex-wrap gap-3">
                <Button as="a" href="#showtimes" size="lg">
                  Book tickets
                </Button>
                {film.trailerUrl && (
                  <Button
                    as="a"
                    href={film.trailerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="secondary"
                    size="lg"
                  >
                    <PlayCircle className="size-4" aria-hidden="true" />
                    Watch trailer
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <section id="showtimes" className="page-shell scroll-mt-20 border-t border-slate-line py-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl text-ivory">Showtimes</h2>
            <p className="mt-1 text-sm text-ivory-muted">
              {cityLabel ? `In ${cityLabel}` : 'Choose a city to narrow these down'}
            </p>
          </div>
          <CitySelector />
        </div>

        <div className="mb-6">
          <DateStrip dates={dates} selected={selectedDate} onSelect={setSelectedDate} />
        </div>

        {shows.loading ? (
          <ShowListSkeleton />
        ) : shows.error ? (
          <ErrorState error={shows.error} onRetry={shows.refetch} />
        ) : showList.length === 0 ? (
          <EmptyState
            title="No shows on this date"
            description={
              cityLabel
                ? `Nothing is scheduled in ${cityLabel} for this day. Try another date or city.`
                : 'Try another date, or choose a city to see what is on near you.'
            }
            action={<CitySelector />}
          />
        ) : (
          <ShowtimeList shows={showList} />
        )}
      </section>
    </article>
  );
}
