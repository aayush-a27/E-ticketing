import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote,
  CircleDollarSign,
  Clock,
  RefreshCw,
  TriangleAlert,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { fetchFinanceSummary } from '../../services/operationsService.js';
import { fetchTheaters } from '../../services/venueService.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Card,
  CardHeader,
  DetailList,
  DetailRow,
  PageHeader,
  StatCard,
} from '../../components/ui/Layout.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import { FilterBar, FilterDate, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { basisPoints, count, money, pluralize } from '../../utils/format.js';

const DEFAULTS = { theaterId: '', from: '', to: '' };

function dayBoundary(value, end) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (end) date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

/**
 * Money, as the records prove it.
 *
 * "Collected" is captured payments — written only after the server verified
 * the gateway's signature. "Refunded" is completed refunds. Nothing on this
 * page is added up in the browser; every figure is a database aggregate, and
 * a failed or pending payment is shown separately and never counted as
 * revenue.
 */
export default function FinancePage() {
  const { namespace, isSuperAdmin } = useAuth();
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);

  const { data: summary, error, loading, refetch } = useResource(
    useCallback(
      ({ signal }) =>
        fetchFinanceSummary(
          namespace,
          {
            theaterId: filters.theaterId,
            from: dayBoundary(filters.from, false),
            to: dayBoundary(filters.to, true),
          },
          { signal },
        ),
      [namespace, filters],
    ),
    [namespace, filters],
  );

  const { data: theaterData } = useResource(
    useCallback(
      ({ signal }) => fetchTheaters(namespace, { limit: 100 }, { signal }),
      [namespace],
    ),
    [namespace],
  );

  const s = summary;

  return (
    <>
      <PageHeader
        title="Finance"
        description={
          isSuperAdmin
            ? 'Collected, refunded and owed, across the platform.'
            : 'Collected, refunded and owed at your venues.'
        }
        actions={
          <Button variant="secondary" size="sm" onClick={refetch} loading={loading}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <Card className="mb-5 overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <FilterSelect
            label="Venue"
            value={filters.theaterId}
            onChange={(value) => setFilters({ theaterId: value })}
            options={(theaterData?.items ?? []).map((theater) => ({
              value: theater._id,
              label: theater.name,
            }))}
            placeholder={isSuperAdmin ? 'All venues' : 'All your venues'}
          />
          <FilterDate label="From" value={filters.from} onChange={(value) => setFilters({ from: value })} />
          <FilterDate label="To" value={filters.to} onChange={(value) => setFilters({ to: value })} />
        </FilterBar>
        <p className="px-4 py-2.5 text-xs text-ink-500">
          Dates filter on when each payment, refund or booking was created.
          {!filters.from && !filters.to && ' No range set — showing all time.'}
        </p>
      </Card>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          <section aria-label="Headline figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Collected"
              value={s ? money(s.collected.amountPaise) : ''}
              hint={s ? `${pluralize(s.collected.count, 'captured payment')}` : undefined}
              icon={Banknote}
              tone="good"
              loading={loading}
            />
            <StatCard
              label="Refunded"
              value={s ? money(s.refunded.amountPaise) : ''}
              hint={s ? `${pluralize(s.refunded.count, 'completed refund')}` : undefined}
              icon={Undo2}
              tone="info"
              loading={loading}
            />
            <StatCard
              label="Net"
              value={s ? money(s.netPaise) : ''}
              hint="Collected minus refunded"
              icon={CircleDollarSign}
              tone="brand"
              loading={loading}
            />
            <StatCard
              label="Refunds outstanding"
              value={s ? money(s.refundsOutstanding.amountPaise) : ''}
              hint={s ? `${pluralize(s.refundsOutstanding.count, 'refund')} not yet settled` : undefined}
              icon={Clock}
              tone={s?.refundsOutstanding.count > 0 ? 'warn' : 'neutral'}
              loading={loading}
            />
          </section>

          {s?.refundsFailed.count > 0 && (
            <div
              className="mt-4 flex flex-wrap items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3.5 py-3"
              role="alert"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm text-ink-800">
                <span className="font-medium">
                  {pluralize(s.refundsFailed.count, 'refund')} failed (
                  {money(s.refundsFailed.amountPaise)}).
                </span>{' '}
                The gateway refused them. These customers are still owed money.
              </p>
              <Button as={Link} to="/refunds?status=failed" variant="secondary" size="sm">
                See them
              </Button>
            </div>
          )}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Confirmed bookings"
                description="From each booking's stored price snapshot."
              />
              <div className="p-5">
                {loading || !s ? (
                  <p className="text-sm text-ink-500">Loading…</p>
                ) : (
                  <DetailList>
                    <DetailRow label="Bookings">{count(s.confirmedBookings.count)}</DetailRow>
                    <DetailRow label="Ticket value">{money(s.confirmedBookings.ticketsPaise)}</DetailRow>
                    <DetailRow label="Convenience fees">
                      {money(s.confirmedBookings.convenienceFeesPaise)}
                    </DetailRow>
                    <DetailRow label="Tax">{money(s.confirmedBookings.taxPaise)}</DetailRow>
                    <div className="!mt-3 border-t border-ink-200 pt-3">
                      <DetailRow label="Gross">
                        <span className="font-semibold">{money(s.confirmedBookings.grossPaise)}</span>
                      </DetailRow>
                    </div>
                  </DetailList>
                )}
                {!isSuperAdmin && (
                  <p className="mt-4 text-xs text-ink-500">
                    Convenience fees and tax are collected on your bookings, but are not all yours —
                    fees go to the platform and tax to the government.
                  </p>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Tax collected"
                description="Per component, named as the platform settings name it."
              />
              <div className="p-5">
                {loading || !s ? (
                  <p className="text-sm text-ink-500">Loading…</p>
                ) : s.taxBreakdown.length === 0 ? (
                  <p className="text-sm text-ink-500">
                    No tax has been charged. Tax components are configured in Settings.
                  </p>
                ) : (
                  <DetailList>
                    {s.taxBreakdown.map((tax) => (
                      <DetailRow
                        key={tax.name}
                        label={`${tax.name}${tax.rateBasisPoints != null ? ` · ${basisPoints(tax.rateBasisPoints)}` : ''}`}
                      >
                        {money(tax.amountPaise)}
                      </DetailRow>
                    ))}
                  </DetailList>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Not revenue"
                description="Shown so they are not mistaken for it."
              />
              <div className="p-5">
                {loading || !s ? (
                  <p className="text-sm text-ink-500">Loading…</p>
                ) : (
                  <DetailList>
                    <DetailRow label="Awaiting payment">
                      {money(s.awaitingPayment.amountPaise)}
                      <span className="ml-1.5 text-xs text-ink-500">
                        ({pluralize(s.awaitingPayment.count, 'booking')})
                      </span>
                    </DetailRow>
                    <DetailRow label="Failed attempts">
                      {money(s.failedAttempts.amountPaise)}
                      <span className="ml-1.5 text-xs text-ink-500">
                        ({count(s.failedAttempts.count)})
                      </span>
                    </DetailRow>
                    <DetailRow label="Started, never finished">
                      {money(s.openAttempts.amountPaise)}
                      <span className="ml-1.5 text-xs text-ink-500">
                        ({count(s.openAttempts.count)})
                      </span>
                    </DetailRow>
                  </DetailList>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Could not be fulfilled" />
              <div className="p-5">
                {loading || !s ? (
                  <p className="text-sm text-ink-500">Loading…</p>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <XCircle
                        className={`size-4 ${s.unfulfillable.count > 0 ? 'text-bad' : 'text-ink-400'}`}
                        aria-hidden="true"
                      />
                      <p className="text-2xl font-semibold text-ink-900">
                        {count(s.unfulfillable.count)}
                      </p>
                      <p className="text-sm text-ink-500">{money(s.unfulfillable.amountPaise)}</p>
                    </div>
                    <p className="mt-2 text-sm text-ink-600">
                      Customers whose payment arrived after their seat hold had lapsed and someone
                      else took the seats. Each is refunded automatically.
                    </p>
                    {s.unfulfillable.count > 0 && (
                      <Button
                        as={Link}
                        to="/bookings?status=unfulfillable"
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                      >
                        See these bookings
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
