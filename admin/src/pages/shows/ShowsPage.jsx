import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { fetchShows } from '../../services/showService.js';
import { fetchTheaters } from '../../services/venueService.js';
import { fetchPublishedMovies } from '../../services/catalogService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { FilterBar, FilterDate, FilterSelect } from '../../components/ui/FilterBar.jsx';
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
import { count, money, pluralize, shortDay, timeOnly } from '../../utils/format.js';
import { SCREEN_FORMATS, SHOW_STATUSES, toOptions } from '../../utils/constants.js';

const DEFAULTS = {
  status: '',
  theaterId: '',
  movieId: '',
  format: '',
  date: '',
  page: 1,
};

const COLUMNS = 7;

/** The schedule. Scoped to the caller's venues by the server, not here. */
export default function ShowsPage() {
  const { namespace, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchShows(namespace, filters, { signal }), [namespace, filters]),
    [namespace, filters],
  );

  // The filter dropdowns. Failing to load one must not take the page down, so
  // these are read without their own error surface — the selects simply stay
  // empty and the table still works.
  const { data: theaterData } = useResource(
    useCallback(
      ({ signal }) => fetchTheaters(namespace, { limit: 100 }, { signal }),
      [namespace],
    ),
    [namespace],
  );

  const { data: movieData } = useResource(
    useCallback(({ signal }) => fetchPublishedMovies({}, { signal }), []),
    [],
  );

  const shows = data?.items ?? [];

  const theaterOptions = (theaterData?.items ?? []).map((theater) => ({
    value: theater._id,
    label: `${theater.name} · ${theater.cityLabel}`,
  }));

  const movieOptions = (movieData?.items ?? []).map((movie) => ({
    value: movie.id,
    label: movie.title,
  }));

  return (
    <>
      <PageHeader
        title="Shows"
        description={
          isSuperAdmin
            ? 'Every scheduled show on the platform.'
            : 'Shows at the venues assigned to you.'
        }
        actions={
          <Button as={Link} to="/shows/new">
            <Plus className="size-4" aria-hidden="true" />
            Schedule a show
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <FilterDate
            label="Date"
            value={filters.date}
            onChange={(value) => setFilters({ date: value })}
          />
          <FilterSelect
            label="Venue"
            value={filters.theaterId}
            onChange={(value) => setFilters({ theaterId: value })}
            options={theaterOptions}
          />
          <FilterSelect
            label="Film"
            value={filters.movieId}
            onChange={(value) => setFilters({ movieId: value })}
            options={movieOptions}
          />
          <FilterSelect
            label="Format"
            value={filters.format}
            onChange={(value) => setFilters({ format: value })}
            options={toOptions(SCREEN_FORMATS)}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilters({ status: value })}
            options={toOptions(SHOW_STATUSES, { humanizeLabels: true })}
          />
        </FilterBar>

        <Table>
          <THead>
            <TH>Starts</TH>
            <TH>Film</TH>
            <TH>Where</TH>
            <TH>Status</TH>
            <TH>Format</TH>
            <TH align="right">Sold</TH>
            <TH align="right">From</TH>
          </THead>

          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={8} />
          ) : error ? (
            <TableMessage columns={COLUMNS}>
              <ErrorState error={error} onRetry={refetch} />
            </TableMessage>
          ) : shows.length === 0 ? (
            <TableMessage columns={COLUMNS}>
              <EmptyState
                icon={CalendarClock}
                title={activeCount > 0 ? 'No shows match those filters' : 'Nothing scheduled'}
                description={
                  activeCount > 0
                    ? 'Clear the filters to see the whole schedule.'
                    : 'Schedule a show against a published film, in a screen that has an active seat layout.'
                }
                action={
                  activeCount > 0 ? (
                    <Button variant="secondary" size="sm" onClick={clear}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button as={Link} to="/shows/new" size="sm">
                      <Plus className="size-3.5" aria-hidden="true" />
                      Schedule the first show
                    </Button>
                  )
                }
              />
            </TableMessage>
          ) : (
            <TBody>
              {shows.map((show) => {
                const cheapest = show.pricing?.length
                  ? Math.min(...show.pricing.map((item) => item.basePaise))
                  : null;
                return (
                  <TR key={show._id} onClick={() => navigate(`/shows/${show._id}`)}>
                    <TD>
                      <p className="font-medium text-ink-900">{shortDay(show.startAt)}</p>
                      <p className="mt-0.5 text-xs text-ink-500">{timeOnly(show.startAt)}</p>
                    </TD>
                    <TD>
                      <p className="max-w-[12rem] truncate text-sm text-ink-900">
                        {show.movieId?.title ?? '—'}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">{show.language}</p>
                    </TD>
                    <TD>
                      <p className="max-w-[12rem] truncate text-sm text-ink-900">
                        {show.theaterId?.name ?? '—'}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {show.screenId?.name}
                        {show.theaterId?.cityLabel ? ` · ${show.theaterId.cityLabel}` : ''}
                      </p>
                    </TD>
                    <TD>
                      <StatusBadge status={show.status} />
                    </TD>
                    <TD>
                      <Badge tone="info">{show.format}</Badge>
                    </TD>
                    <TD align="right" className="text-sm text-ink-600">
                      {count(show.bookedSeatCount ?? 0)}
                    </TD>
                    <TD align="right" className="text-sm font-medium">
                      {cheapest === null ? '—' : money(cheapest)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          )}
        </Table>

        {!loading && !error && shows.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>

      {!loading && !error && shows.length > 0 && (
        <p className="mt-3 text-xs text-ink-500">
          {pluralize(data.pagination.total, 'show')}
          {activeCount > 0 ? ' matching these filters' : ''}. Prices shown are the cheapest seat
          category, before fees and tax.
        </p>
      )}
    </>
  );
}
