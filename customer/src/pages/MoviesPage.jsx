import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { fetchMovies } from '../services/movieService.js';
import { useResource } from '../hooks/useResource.js';
import { MovieGrid } from '../components/movies/MovieCard.jsx';
import { MovieGridSkeleton, EmptyState, ErrorState } from '../components/common/States.jsx';
import { Button } from '../components/common/Button.jsx';

const SORTS = [
  { value: '-releaseDate', label: 'Newest first' },
  { value: 'releaseDate', label: 'Oldest first' },
  { value: 'title', label: 'A to Z' },
  { value: '-title', label: 'Z to A' },
];

const CERTIFICATIONS = ['U', 'UA', 'UA7+', 'UA13+', 'UA16+', 'A', 'S'];

function Chip({ active, children, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={[
        'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
        active ? 'neu text-amber-bright' : 'border border-slate-line text-ivory-dim hover:text-ivory',
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}

export default function MoviesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Filters live in the URL, so a filtered view is shareable and survives a
  // refresh or a back-navigation.
  const search = searchParams.get('search') ?? '';
  const genre = searchParams.get('genre') ?? '';
  const language = searchParams.get('language') ?? '';
  const certification = searchParams.get('certification') ?? '';
  const featured = searchParams.get('featured') ?? '';
  const sort = searchParams.get('sort') ?? '-releaseDate';
  const page = Number(searchParams.get('page') ?? 1);

  const [searchDraft, setSearchDraft] = useState(search);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => setSearchDraft(search), [search]);

  const updateParams = useCallback(
    (changes, { resetPage = true } = {}) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (resetPage) next.delete('page');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const load = useCallback(
    ({ signal }) =>
      fetchMovies({ search, genre, language, certification, featured, sort, page, limit: 20 }, { signal }),
    [search, genre, language, certification, featured, sort, page],
  );

  const { data, loading, error, refetch } = useResource(load, [
    search,
    genre,
    language,
    certification,
    featured,
    sort,
    page,
  ]);

  const movies = data?.data ?? [];
  const pagination = data?.pagination;

  // Derived from what came back, so no filter offers a value that yields
  // nothing. The backend has no facet endpoint, so this is page-scoped.
  const genres = [...new Set(movies.flatMap((movie) => movie.genres ?? []))].sort();
  const languages = [...new Set(movies.flatMap((movie) => movie.languages ?? []))].sort();

  const activeFilters = [genre, language, certification, featured].filter(Boolean).length;

  const clearAll = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
    setSearchDraft('');
  };

  return (
    <div className="page-shell py-10">
      <header className="mb-8">
        <h1 className="text-3xl text-ivory sm:text-4xl">Movies</h1>
        <p className="mt-2 text-sm text-ivory-muted">
          Everything currently published on CineReserve.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            updateParams({ search: searchDraft.trim() });
          }}
          className="relative min-w-0 flex-1 sm:max-w-sm"
        >
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ivory-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search by title"
            aria-label="Search movies by title"
            className="neu-inset h-11 w-full rounded-full pl-10 pr-4 text-sm text-ivory placeholder:text-ivory-muted/60"
          />
        </form>

        <Button
          variant="secondary"
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
          className="shrink-0"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filters
          {activeFilters > 0 && (
            <span className="ml-1 rounded-full bg-amber-brand px-1.5 text-[10px] font-bold text-midnight">
              {activeFilters}
            </span>
          )}
        </Button>

        <label className="sr-only" htmlFor="sort-select">
          Sort movies
        </label>
        <select
          id="sort-select"
          value={sort}
          onChange={(event) => updateParams({ sort: event.target.value })}
          className="neu-inset h-11 shrink-0 rounded-full px-4 text-sm text-ivory"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value} className="bg-charcoal">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {filtersOpen && (
        <div className="card-surface mb-6 space-y-5 p-5">
          {genres.length > 0 && (
            <div>
              <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted">
                Genre
              </h2>
              <div className="flex flex-wrap gap-2">
                {genres.map((value) => (
                  <Chip
                    key={value}
                    active={genre === value}
                    onClick={() => updateParams({ genre: genre === value ? '' : value })}
                  >
                    {value}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {languages.length > 0 && (
            <div>
              <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted">
                Language
              </h2>
              <div className="flex flex-wrap gap-2">
                {languages.map((value) => (
                  <Chip
                    key={value}
                    active={language === value}
                    onClick={() => updateParams({ language: language === value ? '' : value })}
                  >
                    {value}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted">
              Certification
            </h2>
            <div className="flex flex-wrap gap-2">
              {CERTIFICATIONS.map((value) => (
                <Chip
                  key={value}
                  active={certification === value}
                  onClick={() =>
                    updateParams({ certification: certification === value ? '' : value })
                  }
                >
                  {value}
                </Chip>
              ))}
            </div>
          </div>

          {(activeFilters > 0 || search) && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 text-xs text-ivory-muted transition hover:text-ivory"
            >
              <X className="size-3.5" aria-hidden="true" />
              Clear everything
            </button>
          )}
        </div>
      )}

      {loading ? (
        <MovieGridSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : movies.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description={
            search
              ? `No movie matches “${search}”. Try a different title or clear your filters.`
              : 'No movie matches these filters.'
          }
          action={
            (search || activeFilters > 0) && (
              <Button variant="secondary" onClick={clearAll}>
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-5 text-sm text-ivory-muted" aria-live="polite">
            {pagination?.total ?? movies.length}{' '}
            {(pagination?.total ?? movies.length) === 1 ? 'movie' : 'movies'}
          </p>

          <MovieGrid movies={movies} />

          {pagination && pagination.totalPages > 1 && (
            <nav
              className="mt-12 flex items-center justify-center gap-3"
              aria-label="Pagination"
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={!pagination.hasPrev}
                onClick={() => updateParams({ page: String(page - 1) }, { resetPage: false })}
              >
                Previous
              </Button>
              <span className="text-sm text-ivory-muted">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!pagination.hasNext}
                onClick={() => updateParams({ page: String(page + 1) }, { resetPage: false })}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
