import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, MapPin, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { fetchTheaters } from '../../services/venueService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { FilterBar, FilterSelect, SearchField } from '../../components/ui/FilterBar.jsx';
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
import { count, pluralize } from '../../utils/format.js';
import { THEATER_STATUSES, toOptions } from '../../utils/constants.js';

const DEFAULTS = { search: '', status: '', city: '', page: 1 };
const COLUMNS = 5;

/**
 * Venues.
 *
 * A super admin sees every theater on the platform. A show runner sees only
 * the ones assigned to them — enforced in the query, so this page does no
 * filtering of its own and cannot be made to show more by editing anything in
 * the browser.
 */
export default function TheatersPage() {
  const { namespace, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);

  const { data, error, loading, refetch } = useResource(
    useCallback(
      ({ signal }) => fetchTheaters(namespace, filters, { signal }),
      [namespace, filters],
    ),
    [namespace, filters],
  );

  const theaters = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Theaters"
        description={
          isSuperAdmin
            ? 'Every venue on the platform.'
            : 'The venues assigned to you. Assignment is a platform administrator decision.'
        }
        actions={
          isSuperAdmin && (
            <Button as={Link} to="/theaters/new">
              <Plus className="size-4" aria-hidden="true" />
              Add theater
            </Button>
          )
        }
      />

      <Card className="overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <SearchField
            value={filters.search}
            onCommit={(value) => setFilters({ search: value })}
            placeholder="Name or address"
          />
          <div className="min-w-[8.5rem]">
            <label className="mb-1.5 block text-xs font-medium text-ink-600" htmlFor="filter-city">
              City
            </label>
            <input
              id="filter-city"
              type="text"
              value={filters.city}
              onChange={(event) => setFilters({ city: event.target.value })}
              placeholder="Any"
              className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-sm text-ink-900 transition-colors placeholder:text-ink-400 hover:border-ink-300 focus:border-brand"
            />
          </div>
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilters({ status: value })}
            options={toOptions(THEATER_STATUSES, { humanizeLabels: true })}
          />
        </FilterBar>

        <Table>
          <THead>
            <TH>Venue</TH>
            <TH>City</TH>
            <TH>Status</TH>
            <TH>Amenities</TH>
            <TH align="right">{isSuperAdmin ? 'Managers' : 'Images'}</TH>
          </THead>

          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={6} />
          ) : error ? (
            <TableMessage columns={COLUMNS}>
              <ErrorState error={error} onRetry={refetch} />
            </TableMessage>
          ) : theaters.length === 0 ? (
            <TableMessage columns={COLUMNS}>
              <EmptyState
                icon={Building2}
                title={
                  activeCount > 0
                    ? 'No venues match those filters'
                    : isSuperAdmin
                      ? 'No venues yet'
                      : 'No venue assigned to you yet'
                }
                description={
                  activeCount > 0
                    ? 'Clear the filters to see everything.'
                    : isSuperAdmin
                      ? 'Add a venue, give it a screen and a seat layout, then shows can be scheduled in it.'
                      : 'Your show-runner account is approved, but a platform administrator still has to assign you a theater. Approval and assignment are separate steps.'
                }
                action={
                  activeCount > 0 ? (
                    <Button variant="secondary" size="sm" onClick={clear}>
                      Clear filters
                    </Button>
                  ) : isSuperAdmin ? (
                    <Button as={Link} to="/theaters/new" size="sm">
                      <Plus className="size-3.5" aria-hidden="true" />
                      Add the first theater
                    </Button>
                  ) : null
                }
              />
            </TableMessage>
          ) : (
            <TBody>
              {theaters.map((theater) => (
                <TR key={theater._id} onClick={() => navigate(`/theaters/${theater._id}`)}>
                  <TD>
                    <p className="font-medium text-ink-900">{theater.name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                      <MapPin className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{theater.addressLine1}</span>
                    </p>
                  </TD>
                  <TD className="text-sm text-ink-600">
                    {theater.cityLabel}
                    <span className="mt-0.5 block text-xs text-ink-500">{theater.state}</span>
                  </TD>
                  <TD>
                    <StatusBadge status={theater.status} />
                  </TD>
                  <TD className="max-w-[16rem] text-sm text-ink-600">
                    <span className="line-clamp-2">
                      {theater.amenities?.length ? theater.amenities.join(', ') : '—'}
                    </span>
                  </TD>
                  <TD align="right" className="text-sm text-ink-600">
                    {isSuperAdmin
                      ? count(theater.managers?.length ?? 0)
                      : count(theater.images?.length ?? 0)}
                  </TD>
                </TR>
              ))}
            </TBody>
          )}
        </Table>

        {!loading && !error && theaters.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>

      {!loading && !error && theaters.length > 0 && (
        <p className="mt-3 text-xs text-ink-500">
          {pluralize(data.pagination.total, 'venue')}
          {activeCount > 0 ? ' matching these filters' : ''}.
        </p>
      )}
    </>
  );
}
