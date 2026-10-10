import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { fetchBookings } from '../../services/operationsService.js';
import { fetchTheaters } from '../../services/venueService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import {
  FilterBar,
  FilterDate,
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
import { dateTime, money, pluralize, relative, seatSummary } from '../../utils/format.js';
import { BOOKING_STATUSES, PAYMENT_STATUSES, toOptions } from '../../utils/constants.js';

const DEFAULTS = {
  reference: '',
  customerEmail: '',
  status: '',
  paymentStatus: '',
  theaterId: '',
  admitted: '',
  dateField: 'created',
  from: '',
  to: '',
  userId: '',
  sort: '-createdAt',
  page: 1,
};

const SORTS = [
  { value: '-createdAt', label: 'Newest booked' },
  { value: 'createdAt', label: 'Oldest booked' },
  { value: '-startAt', label: 'Showtime, latest' },
  { value: 'startAt', label: 'Showtime, soonest' },
  { value: '-amount', label: 'Amount, highest' },
];

const COLUMNS = 7;

/** "2026-10-12" as the start or end of that local day, for the API. */
function dayBoundary(value, end) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (end) date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

/**
 * Bookings, read-only.
 *
 * A super admin sees every booking with the customer's contact details; a
 * show runner sees only bookings at their venues, with email addresses masked.
 * Both are decided by the server. There is no control on this page that
 * changes a booking — confirming one requires a verified payment, and nothing
 * here can shortcut that.
 */
export default function BookingsPage() {
  const { namespace, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);

  const query = {
    ...filters,
    // Search by email is refused for a show runner, so it is never sent.
    customerEmail: isSuperAdmin ? filters.customerEmail : '',
    dateField: filters.from || filters.to ? filters.dateField : '',
    from: dayBoundary(filters.from, false),
    to: dayBoundary(filters.to, true),
  };

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchBookings(namespace, query, { signal }), [namespace, filters]),
    [namespace, filters],
  );

  const { data: theaterData } = useResource(
    useCallback(
      ({ signal }) => fetchTheaters(namespace, { limit: 100 }, { signal }),
      [namespace],
    ),
    [namespace],
  );

  const bookings = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Bookings"
        description={
          isSuperAdmin
            ? 'Every booking on the platform. Read-only: payment state is set by the payment gateway, not from here.'
            : 'Bookings at your venues. Customer email addresses are partly hidden.'
        }
      />

      {filters.userId && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-600">
          <Badge tone="info">One customer</Badge>
          Showing a single account&rsquo;s bookings.
          <Button variant="ghost" size="xs" onClick={() => setFilters({ userId: '' })}>
            Show everyone
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <SearchField
            label="Reference"
            value={filters.reference}
            onCommit={(value) =>
              setFilters({ reference: value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') })
            }
            placeholder="CRTUKWB55W"
          />
          {isSuperAdmin && (
            <div className="min-w-[12rem] flex-1">
              <label
                className="mb-1.5 block text-xs font-medium text-ink-600"
                htmlFor="filter-email"
              >
                Customer email
              </label>
              <input
                id="filter-email"
                // Remounts when the URL value changes, so Clear empties it.
                key={filters.customerEmail}
                type="email"
                defaultValue={filters.customerEmail}
                onBlur={(event) => setFilters({ customerEmail: event.target.value.trim() })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setFilters({ customerEmail: event.target.value.trim() });
                }}
                placeholder="Exact address"
                className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-sm text-ink-900 transition-colors placeholder:text-ink-400 hover:border-ink-300 focus:border-brand"
              />
            </div>
          )}
          <FilterSelect
            label="Booking"
            value={filters.status}
            onChange={(value) => setFilters({ status: value })}
            options={toOptions(BOOKING_STATUSES, { humanizeLabels: true })}
          />
          <FilterSelect
            label="Payment"
            value={filters.paymentStatus}
            onChange={(value) => setFilters({ paymentStatus: value })}
            options={toOptions(PAYMENT_STATUSES, { humanizeLabels: true })}
          />
          <FilterSelect
            label="Venue"
            value={filters.theaterId}
            onChange={(value) => setFilters({ theaterId: value })}
            options={(theaterData?.items ?? []).map((theater) => ({
              value: theater._id,
              label: theater.name,
            }))}
          />
          <FilterSelect
            label="Entry"
            value={filters.admitted}
            onChange={(value) => setFilters({ admitted: value })}
            options={[
              { value: 'true', label: 'Admitted' },
              { value: 'false', label: 'Not yet admitted' },
            ]}
          />
          <FilterSelect
            label="Dates apply to"
            value={filters.dateField}
            onChange={(value) => setFilters({ dateField: value || 'created' })}
            options={[
              { value: 'created', label: 'When booked' },
              { value: 'showtime', label: 'Showtime' },
            ]}
            placeholder="When booked"
          />
          <FilterDate label="From" value={filters.from} onChange={(value) => setFilters({ from: value })} />
          <FilterDate label="To" value={filters.to} onChange={(value) => setFilters({ to: value })} />
          <FilterSelect
            label="Sort"
            value={filters.sort}
            onChange={(value) => setFilters({ sort: value || '-createdAt' })}
            options={SORTS}
            placeholder="Newest booked"
          />
        </FilterBar>

        <Table>
          <THead>
            <TH>Reference</TH>
            <TH>Customer</TH>
            <TH>Show</TH>
            <TH>Seats</TH>
            <TH>Booking</TH>
            <TH>Payment</TH>
            <TH align="right">Amount</TH>
          </THead>

          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={8} />
          ) : error ? (
            <TableMessage columns={COLUMNS}>
              <ErrorState error={error} onRetry={refetch} />
            </TableMessage>
          ) : bookings.length === 0 ? (
            <TableMessage columns={COLUMNS}>
              <EmptyState
                icon={Ticket}
                title={activeCount > 0 ? 'No bookings match those filters' : 'No bookings yet'}
                description={
                  activeCount > 0
                    ? 'Clear the filters to see all bookings.'
                    : 'Bookings made on the customer site appear here as they happen.'
                }
                action={
                  activeCount > 0 && (
                    <Button variant="secondary" size="sm" onClick={clear}>
                      Clear filters
                    </Button>
                  )
                }
              />
            </TableMessage>
          ) : (
            <TBody>
              {bookings.map((booking) => (
                <TR key={booking.id} onClick={() => navigate(`/bookings/${booking.id}`)}>
                  <TD>
                    <span className="font-mono text-xs font-medium text-ink-900">
                      {booking.reference}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-500">
                      {relative(booking.createdAt)}
                    </span>
                  </TD>
                  <TD>
                    <span className="block max-w-[11rem] truncate text-sm">
                      {booking.customer?.name ?? '—'}
                    </span>
                    <span className="mt-0.5 block max-w-[11rem] truncate text-[11px] text-ink-500">
                      {booking.customer?.email ?? ''}
                    </span>
                  </TD>
                  <TD>
                    <span className="block max-w-[13rem] truncate text-sm">
                      {booking.movie.title}
                    </span>
                    <span className="mt-0.5 block max-w-[13rem] truncate text-[11px] text-ink-500">
                      {booking.theater.name} · {dateTime(booking.showtime.startAt)}
                    </span>
                  </TD>
                  <TD className="text-sm text-ink-600">
                    {seatSummary(booking.seatLabels, 3)}
                    {booking.cancelledSeatCount > 0 && (
                      <span className="mt-0.5 block text-[11px] text-ink-500">
                        {pluralize(booking.cancelledSeatCount, 'seat')} cancelled
                      </span>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge status={booking.status} />
                    {booking.admittedAt && (
                      <span className="mt-1 block text-[11px] text-good">Admitted</span>
                    )}
                  </TD>
                  <TD>
                    <StatusBadge status={booking.paymentStatus} dot={false} />
                  </TD>
                  <TD align="right" className="font-medium">
                    {money(booking.amountPaise)}
                  </TD>
                </TR>
              ))}
            </TBody>
          )}
        </Table>

        {!loading && !error && bookings.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>
    </>
  );
}
