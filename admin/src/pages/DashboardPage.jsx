import { useCallback } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Clock,
  Film,
  Inbox,
  RefreshCw,
  Ticket,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useResource } from '../hooks/useResource.js';
import { fetchDashboard } from '../services/operationsService.js';
import { Button } from '../components/ui/Button.jsx';
import {
  Card,
  CardHeader,
  DetailList,
  DetailRow,
  PageHeader,
  StatCard,
} from '../components/ui/Layout.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/Table.jsx';
import {
  count,
  dateTime,
  money,
  moneyShort,
  relative,
  seatSummary,
  shortDay,
  timeOnly,
} from '../utils/format.js';

/**
 * The console's landing page.
 *
 * Every figure comes from GET /{namespace}/dashboard, which aggregates in the
 * database over whatever the caller is allowed to see. Nothing is computed
 * here, nothing is estimated, and there is no fixture data anywhere on this
 * page — an empty platform shows zeros and says so.
 */
export default function DashboardPage() {
  const { namespace, isSuperAdmin, user } = useAuth();

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchDashboard(namespace, { signal }), [namespace]),
    [namespace],
  );

  const firstName = user?.name?.split(' ')[0];

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={firstName ? `Good to see you, ${firstName}` : 'Dashboard'}
        description={
          isSuperAdmin
            ? 'Everything across the platform.'
            : 'Bookings and takings for the venues assigned to you.'
        }
        actions={
          <Button variant="secondary" size="sm" onClick={refetch} loading={loading}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {/* A runner who is approved but holds no venue would otherwise just see
          a wall of zeros with no explanation. */}
      {data?.assignedTheaterCount === 0 && (
        <Card className="mb-6 border-info/30 bg-info-soft p-4">
          <p className="text-sm font-medium text-ink-900">No venue assigned yet</p>
          <p className="mt-1 text-sm text-ink-600">
            Your show-runner account is approved, but a platform administrator still has to assign
            you a theater. Until then there is nothing for this console to show — approval and
            venue assignment are separate steps.
          </p>
        </Card>
      )}

      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Collected"
          value={loading ? '' : moneyShort(data?.finance.collectedPaise)}
          hint="Captured payments only"
          icon={Banknote}
          tone="good"
          loading={loading}
        />
        <StatCard
          label="Net of refunds"
          value={loading ? '' : moneyShort(data?.finance.netPaise)}
          hint={
            loading ? undefined : `${moneyShort(data?.finance.refundedPaise)} refunded`
          }
          icon={CircleDollarSign}
          tone="brand"
          loading={loading}
        />
        <StatCard
          label="Confirmed bookings"
          value={loading ? '' : count(data?.bookings.confirmed)}
          hint={loading ? undefined : `${count(data?.bookings.total)} in total`}
          icon={Ticket}
          tone="info"
          loading={loading}
        />
        <StatCard
          label="Upcoming shows"
          value={loading ? '' : count(data?.shows.upcomingPublished)}
          hint={loading ? undefined : `${count(data?.shows.draft)} still in draft`}
          icon={CalendarClock}
          loading={loading}
        />
      </section>

      <section
        aria-label="Attention needed"
        className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Awaiting payment"
          value={loading ? '' : moneyShort(data?.finance.awaitingPaymentPaise)}
          hint={loading ? undefined : `${count(data?.bookings.pendingPayment)} unpaid bookings`}
          icon={Clock}
          tone="warn"
          loading={loading}
        />
        <StatCard
          label="Refunds outstanding"
          value={loading ? '' : moneyShort(data?.finance.refundsOutstandingPaise)}
          hint="Owed back, not yet settled"
          icon={RefreshCw}
          tone={data?.finance.refundsOutstandingPaise > 0 ? 'warn' : 'neutral'}
          loading={loading}
        />
        <StatCard
          label="Could not be fulfilled"
          value={loading ? '' : count(data?.bookings.unfulfillable)}
          hint="Paid, but the seats were gone"
          icon={TriangleAlert}
          tone={data?.bookings.unfulfillable > 0 ? 'bad' : 'neutral'}
          loading={loading}
        />
        {isSuperAdmin ? (
          <StatCard
            label="Pending applications"
            value={loading ? '' : count(data?.platform?.pendingApplications)}
            hint={
              loading
                ? undefined
                : `${count(data?.platform?.pendingTheaterRequests)} venue requests`
            }
            icon={Users}
            tone={data?.platform?.pendingApplications > 0 ? 'info' : 'neutral'}
            loading={loading}
          />
        ) : (
          <StatCard
            label="Active venues"
            value={loading ? '' : count(data?.theaters.active)}
            hint="Assigned to you"
            icon={Film}
            loading={loading}
          />
        )}
      </section>

      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[1.618fr_1fr]">
        <TrendCard data={data} loading={loading} />
        <BreakdownCard data={data} loading={loading} isSuperAdmin={isSuperAdmin} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <RecentBookingsCard data={data} loading={loading} />
        <UpcomingShowsCard data={data} loading={loading} />
      </div>
    </>
  );
}

/**
 * Confirmed bookings per day, with the value they were booked at.
 *
 * Labelled "booked value", not revenue, because that is what it is: the API
 * derives it from each booking's own stored total at the moment it was
 * confirmed. Money actually collected is reported from captured payments in
 * the cards above, and the two figures are not the same thing.
 */
function TrendCard({ data, loading }) {
  const series = (data?.trend.series ?? []).map((point) => ({
    ...point,
    // The API's day keys are calendar dates in the platform's timezone. Read
    // as UTC midnight, they showed as the previous day west of Greenwich, so
    // the label is built from the date's own parts, at local noon.
    label: shortDay(new Date(...point.date.split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0)), 12)),
    bookedValue: point.bookedValuePaise / 100,
  }));

  const hasAny = series.some((point) => point.bookings > 0);

  return (
    <Card>
      <CardHeader
        title={`Confirmed bookings · last ${data?.trend.days ?? 14} days`}
        description="Booked value at the time of confirmation, not money collected"
      />
      <div className="p-4">
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : !hasAny ? (
          <EmptyState
            icon={Inbox}
            title="No confirmed bookings yet"
            description="Once a customer pays, their booking appears here the same day."
          />
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="bookedValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b4802c" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#b4802c" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={56}
                  tickFormatter={(value) => `₹${Math.round(value)}`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    boxShadow: '0 4px 12px rgb(15 23 42 / 0.07)',
                  }}
                  formatter={(value, name) =>
                    name === 'bookedValue'
                      ? [money(Math.round(value * 100)), 'Booked value']
                      : [count(value), 'Bookings']
                  }
                />
                <Area
                  type="monotone"
                  dataKey="bookedValue"
                  stroke="#b4802c"
                  strokeWidth={2}
                  fill="url(#bookedValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

function BreakdownCard({ data, loading, isSuperAdmin }) {
  return (
    <Card>
      <CardHeader title="Where things stand" />
      <div className="p-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </div>
        ) : (
          <DetailList>
            <DetailRow label="Confirmed">{count(data?.bookings.confirmed)}</DetailRow>
            <DetailRow label="Awaiting payment">{count(data?.bookings.pendingPayment)}</DetailRow>
            <DetailRow label="Payment failed">{count(data?.bookings.paymentFailed)}</DetailRow>
            <DetailRow label="Cancelled">{count(data?.bookings.cancelled)}</DetailRow>
            <DetailRow label="Expired">{count(data?.bookings.expired)}</DetailRow>

            <div className="!mt-4 border-t border-ink-100 pt-3" />

            <DetailRow label="Published shows">{count(data?.shows.published)}</DetailRow>
            <DetailRow label="Cancelled shows">{count(data?.shows.cancelled)}</DetailRow>
            <DetailRow label={isSuperAdmin ? 'Active theaters' : 'Your venues'}>
              {count(data?.theaters.active)}
            </DetailRow>

            {isSuperAdmin && data?.platform && (
              <>
                <div className="!mt-4 border-t border-ink-100 pt-3" />
                <DetailRow label="Movies published">
                  {count(data.platform.moviesPublished)}
                </DetailRow>
                <DetailRow label="Movies in draft">{count(data.platform.moviesDraft)}</DetailRow>
                <DetailRow label="Theaters, all states">
                  {count(data.platform.theatersTotal)}
                </DetailRow>
              </>
            )}

            <div className="!mt-4 border-t border-ink-100 pt-3" />
            <p className="text-xs text-ink-500">
              Figures as of {dateTime(data?.generatedAt)}.
            </p>
          </DetailList>
        )}
      </div>
    </Card>
  );
}

function RecentBookingsCard({ data, loading }) {
  const rows = data?.recentBookings ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Latest bookings" />
      {loading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No bookings yet"
          description="Bookings made on the customer site appear here as they happen."
        />
      ) : (
        <Table>
          <THead>
            <TH>Reference</TH>
            <TH>Customer</TH>
            <TH>Show</TH>
            <TH>Status</TH>
            <TH align="right">Amount</TH>
          </THead>
          <TBody>
            {rows.map((booking) => (
              <TR key={booking.id}>
                <TD>
                  <span className="font-mono text-xs font-medium text-ink-900">
                    {booking.reference}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-500">
                    {relative(booking.createdAt)}
                  </span>
                </TD>
                <TD>
                  <span className="block max-w-[10rem] truncate text-sm">
                    {booking.customer?.name ?? '—'}
                  </span>
                  {/* Masked for a show runner by the API, never here. */}
                  <span className="mt-0.5 block max-w-[10rem] truncate text-[11px] text-ink-500">
                    {booking.customer?.email ?? ''}
                  </span>
                </TD>
                <TD>
                  <span className="block max-w-[12rem] truncate text-sm">
                    {booking.movie.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-500">
                    {seatSummary(booking.seatLabels, 3)}
                  </span>
                </TD>
                <TD>
                  <StatusBadge status={booking.status} />
                </TD>
                <TD align="right" className="font-medium">
                  {money(booking.amountPaise)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function UpcomingShowsCard({ data, loading }) {
  const rows = data?.upcomingShows ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Next shows" />
      {loading ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled"
          description="Published shows starting in the future appear here."
        />
      ) : (
        <Table>
          <THead>
            <TH>Film</TH>
            <TH>Venue</TH>
            <TH>Starts</TH>
            <TH align="right">Seats sold</TH>
          </THead>
          <TBody>
            {rows.map((show) => (
              <TR key={show.id}>
                <TD>
                  <span className="block max-w-[11rem] truncate text-sm">
                    {show.movie?.title ?? '—'}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-500">
                    {show.language} · {show.format}
                  </span>
                </TD>
                <TD>
                  <span className="block max-w-[10rem] truncate text-sm">
                    {show.theater?.name ?? '—'}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-500">{show.screen}</span>
                </TD>
                <TD>
                  <span className="block text-sm">{shortDay(show.startAt)}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-500">
                    {timeOnly(show.startAt)}
                  </span>
                </TD>
                <TD align="right" className="font-medium">
                  {count(show.bookedSeatCount)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
