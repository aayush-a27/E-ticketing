import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { fetchRefunds } from '../../services/operationsService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
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
import { dateTime, humanize, money } from '../../utils/format.js';
import { REFUND_STATUSES, toOptions } from '../../utils/constants.js';

const DEFAULTS = { status: '', reason: '', page: 1 };
const COLUMNS = 6;

const REASONS = [
  { value: 'cancellation', label: 'Customer cancelled' },
  { value: 'show_cancelled', label: 'Show cancelled' },
  { value: 'unfulfillable', label: 'Seats were gone' },
  { value: 'manual', label: 'Manual' },
];

/**
 * Money going back to customers.
 *
 * Read-only. Refunds are created by cancellations, by a cancelled show, or
 * when a payment lands after the seats were taken — and processed by the
 * reconciliation job. There is no button here that issues or retries one.
 */
export default function RefundsPage() {
  const { namespace, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchRefunds(namespace, filters, { signal }), [namespace, filters]),
    [namespace, filters],
  );

  const refunds = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Refunds"
        description={
          isSuperAdmin
            ? 'Every refund on the platform, newest first.'
            : 'Refunds on bookings at your venues.'
        }
      />

      <Card className="overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilters({ status: value })}
            options={toOptions(REFUND_STATUSES, { humanizeLabels: true })}
          />
          <FilterSelect
            label="Why"
            value={filters.reason}
            onChange={(value) => setFilters({ reason: value })}
            options={REASONS}
          />
        </FilterBar>

        <Table>
          <THead>
            <TH>Created</TH>
            <TH>Booking</TH>
            <TH>Why</TH>
            <TH>Status</TH>
            <TH>Gateway reference</TH>
            <TH align="right">Amount</TH>
          </THead>

          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={6} />
          ) : error ? (
            <TableMessage columns={COLUMNS}>
              <ErrorState error={error} onRetry={refetch} />
            </TableMessage>
          ) : refunds.length === 0 ? (
            <TableMessage columns={COLUMNS}>
              <EmptyState
                icon={Undo2}
                title={activeCount > 0 ? 'No refunds match those filters' : 'No refunds yet'}
                description={
                  activeCount > 0
                    ? 'Clear the filters to see all refunds.'
                    : 'Refunds appear here when a customer cancels, a show is cancelled, or a payment arrives too late.'
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
              {refunds.map((refund) => (
                <TR key={refund.id} onClick={() => navigate(`/bookings/${refund.bookingId}`)}>
                  <TD className="text-sm text-ink-600">{dateTime(refund.createdAt)}</TD>
                  <TD>
                    <span className="font-mono text-xs font-medium text-ink-900">
                      {refund.booking?.reference ?? '—'}
                    </span>
                    <span className="mt-0.5 block max-w-[14rem] truncate text-[11px] text-ink-500">
                      {refund.booking?.movieTitle} · {refund.booking?.theaterName}
                    </span>
                  </TD>
                  <TD className="text-sm text-ink-600">
                    {REASONS.find((item) => item.value === refund.reason)?.label ??
                      humanize(refund.reason)}
                  </TD>
                  <TD>
                    <StatusBadge status={refund.status} />
                    {refund.failureReason && (
                      <span className="mt-1 block max-w-[14rem] text-[11px] text-bad">
                        {refund.failureReason}
                      </span>
                    )}
                  </TD>
                  <TD className="font-mono text-[11px] text-ink-500">
                    {refund.providerRefundId ?? '—'}
                  </TD>
                  <TD align="right" className="font-medium">
                    {money(refund.amountPaise)}
                  </TD>
                </TR>
              ))}
            </TBody>
          )}
        </Table>

        {!loading && !error && refunds.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>
    </>
  );
}
