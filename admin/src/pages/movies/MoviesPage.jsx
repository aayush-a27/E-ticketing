import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Film, ImageOff, Plus } from 'lucide-react';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { fetchMovies } from '../../services/catalogService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import {
  FilterBar,
  FilterSelect,
  SearchField,
} from '../../components/ui/FilterBar.jsx';
import {
  Table,
  TableMessage,
  TableSkeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui/Table.jsx';
import { count, dateOnly, pluralize } from '../../utils/format.js';
import {
  CERTIFICATIONS,
  COMMON_GENRES,
  COMMON_LANGUAGES,
  MOVIE_STATUSES,
  toOptions,
} from '../../utils/constants.js';

const DEFAULTS = {
  search: '',
  status: '',
  genre: '',
  language: '',
  certification: '',
  featured: '',
  sort: '-createdAt',
  page: 1,
};

const SORTS = [
  { value: '-createdAt', label: 'Newest added' },
  { value: '-releaseDate', label: 'Release date, newest' },
  { value: 'releaseDate', label: 'Release date, oldest' },
  { value: 'title', label: 'Title A–Z' },
  { value: '-title', label: 'Title Z–A' },
];

const COLUMNS = 7;

/**
 * The platform's film catalogue.
 *
 * Super admin only — show runners schedule published films rather than
 * creating them, so this page is not in their navigation and the endpoint
 * behind it refuses them regardless.
 */
export default function MoviesPage() {
  const navigate = useNavigate();
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchMovies(filters, { signal }), [filters]),
    [filters],
  );

  const movies = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Movies"
        description="The platform catalogue. Only published films can be scheduled."
        actions={
          <Button as={Link} to="/movies/new">
            <Plus className="size-4" aria-hidden="true" />
            Add movie
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <SearchField
            value={filters.search}
            onCommit={(value) => setFilters({ search: value })}
            placeholder="Title or synopsis"
            label="Search"
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilters({ status: value })}
            options={toOptions(MOVIE_STATUSES, { humanizeLabels: true })}
          />
          <FilterSelect
            label="Genre"
            value={filters.genre}
            onChange={(value) => setFilters({ genre: value })}
            options={toOptions(COMMON_GENRES)}
          />
          <FilterSelect
            label="Language"
            value={filters.language}
            onChange={(value) => setFilters({ language: value })}
            options={toOptions(COMMON_LANGUAGES)}
          />
          <FilterSelect
            label="Rating"
            value={filters.certification}
            onChange={(value) => setFilters({ certification: value })}
            options={toOptions(CERTIFICATIONS)}
          />
          <FilterSelect
            label="Featured"
            value={filters.featured}
            onChange={(value) => setFilters({ featured: value })}
            options={[
              { value: 'true', label: 'Featured only' },
              { value: 'false', label: 'Not featured' },
            ]}
          />
          <FilterSelect
            label="Sort"
            value={filters.sort}
            onChange={(value) => setFilters({ sort: value })}
            options={SORTS}
            placeholder="Default"
          />
        </FilterBar>

        <Table>
          <THead>
            <TH>Film</TH>
            <TH>Status</TH>
            <TH>Languages</TH>
            <TH>Genres</TH>
            <TH>Rating</TH>
            <TH>Released</TH>
            <TH align="right">Runtime</TH>
          </THead>

          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={8} />
          ) : error ? (
            <TableMessage columns={COLUMNS}>
              <ErrorState error={error} onRetry={refetch} />
            </TableMessage>
          ) : movies.length === 0 ? (
            <TableMessage columns={COLUMNS}>
              <EmptyState
                icon={Film}
                title={activeCount > 0 ? 'No films match those filters' : 'No films yet'}
                description={
                  activeCount > 0
                    ? 'Clear the filters to see the whole catalogue.'
                    : 'Add a film, give it a poster, then publish it so shows can be scheduled against it.'
                }
                action={
                  activeCount > 0 ? (
                    <Button variant="secondary" size="sm" onClick={clear}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button as={Link} to="/movies/new" size="sm">
                      <Plus className="size-3.5" aria-hidden="true" />
                      Add the first movie
                    </Button>
                  )
                }
              />
            </TableMessage>
          ) : (
            <TBody>
              {movies.map((movie) => (
                <TR key={movie._id} onClick={() => navigate(`/movies/${movie._id}`)}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-ink-100">
                        {movie.poster?.url ? (
                          <img
                            src={movie.poster.url}
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center">
                            <ImageOff className="size-3 text-ink-400" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">{movie.title}</p>
                        <p className="truncate text-xs text-ink-500">
                          {movie.isFeatured && (
                            <span className="mr-1.5 text-brand-strong">Featured ·</span>
                          )}
                          {movie.slug}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <StatusBadge status={movie.status} />
                  </TD>
                  <TD className="text-sm text-ink-600">
                    {movie.languages?.join(', ') || '—'}
                  </TD>
                  <TD className="text-sm text-ink-600">{movie.genres?.join(', ') || '—'}</TD>
                  <TD className="text-sm">{movie.certification}</TD>
                  <TD className="text-sm text-ink-600">{dateOnly(movie.releaseDate)}</TD>
                  <TD align="right" className="text-sm text-ink-600">
                    {movie.runtimeMinutes ? `${count(movie.runtimeMinutes)} min` : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          )}
        </Table>

        {!loading && !error && movies.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>

      {!loading && !error && movies.length > 0 && (
        <p className="mt-3 text-xs text-ink-500">
          {pluralize(data.pagination.total, 'film')} in the catalogue
          {activeCount > 0 ? ' matching these filters' : ''}.
        </p>
      )}
    </>
  );
}
