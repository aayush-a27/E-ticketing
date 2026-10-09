import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Film } from 'lucide-react';
import { formatRuntime } from '../../utils/format.js';

/** Poster placeholder for a movie whose artwork has not been uploaded. */
function PosterFallback({ title }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-charcoal-soft p-4 text-center">
      <Film className="size-7 text-ivory-muted/50" aria-hidden="true" />
      <span className="line-clamp-3 text-xs text-ivory-muted">{title}</span>
    </div>
  );
}

export function MovieCard({ movie, index = 0 }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      // Capped so a long grid does not stagger for seconds.
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.25) }}
    >
      <Link
        to={`/movies/${movie.slug}`}
        className="group block rounded-xl focus-visible:outline-offset-4"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-slate-line bg-charcoal">
          {movie.poster?.url ? (
            <img
              src={movie.poster.url}
              alt={`Poster for ${movie.title}`}
              loading={index < 6 ? 'eager' : 'lazy'}
              decoding="async"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <PosterFallback title={movie.title} />
          )}

          <div
            className="absolute inset-0 bg-gradient-to-t from-midnight/85 via-midnight/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden="true"
          />

          {movie.certification && (
            <span className="absolute right-2 top-2 rounded-md bg-midnight/80 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ivory backdrop-blur-sm">
              {movie.certification}
            </span>
          )}
        </div>

        <h3 className="mt-3 line-clamp-1 font-sans text-sm font-semibold text-ivory transition-colors group-hover:text-amber-bright">
          {movie.title}
        </h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ivory-muted">
          {movie.languages?.length > 0 && (
            <span className="truncate">{movie.languages.slice(0, 2).join(', ')}</span>
          )}
          {movie.runtimeMinutes && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {formatRuntime(movie.runtimeMinutes)}
            </span>
          )}
        </div>
      </Link>
    </motion.article>
  );
}

export function MovieGrid({ movies }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {movies.map((movie, index) => (
        <MovieCard key={movie.id} movie={movie} index={index} />
      ))}
    </div>
  );
}
