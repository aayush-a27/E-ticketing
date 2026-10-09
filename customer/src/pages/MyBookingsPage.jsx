import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Calendar, Clock, MapPin, Ticket } from 'lucide-react';
import {
  cancelBooking,
  fetchBookings,
  fetchCancellationQuote,
} from '../services/bookingService.js';
import { useResource } from '../hooks/useResource.js';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/common/Button.jsx';
import { ConfirmDialog } from '../components/common/Modal.jsx';
import { EmptyState, ErrorState, ShowListSkeleton } from '../components/common/States.jsx';
import { formatMoney, formatShowDate, formatShowTime } from '../utils/format.js';

/** Status styling driven entirely by what the backend reports. */
const STATUS_STYLES = {
  confirmed: 'bg-status-good/15 text-status-good',
  pending_payment: 'bg-status-warn/15 text-status-warn',
  payment_failed: 'bg-status-bad/15 text-status-bad',
  cancelled: 'bg-charcoal-soft text-ivory-muted',
  expired: 'bg-charcoal-soft text-ivory-muted',
  unfulfillable: 'bg-status-bad/15 text-status-bad',
  cancellation_pending: 'bg-status-warn/15 text-status-warn',
};

const STATUS_LABELS = {
  confirmed: 'Confirmed',
  pending_payment: 'Payment pending',
  payment_failed: 'Payment failed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  unfulfillable: 'Refund due',
  cancellation_pending: 'Cancelling',
};

const PAYMENT_LABELS = {
  paid: 'Paid',
  pending: 'Not paid',
  failed: 'Payment failed',
  refund_pending: 'Refund in progress',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
  refund_failed: 'Refund failed',
};

function BookingCard({ booking, onCancel }) {
  const isUpcoming = new Date(booking.showtime.startAt) > new Date();
  const canCancel = booking.status === 'confirmed' && isUpcoming;

  return (
    <article className="card-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          {booking.movie.posterUrl ? (
            <img
              src={booking.movie.posterUrl}
              alt=""
              loading="lazy"
              className="h-28 w-20 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="h-28 w-20 shrink-0 rounded-lg bg-charcoal-soft" aria-hidden="true" />
          )}

          <div className="min-w-0">
            <h3 className="truncate text-lg text-ivory">{booking.movie.title}</h3>

            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ivory-muted">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {booking.theater.name} · {booking.theater.screen}
              </span>
            </p>

            <p className="mt-1 flex items-center gap-1.5 text-sm text-ivory-dim">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              {formatShowDate(booking.showtime.startAt, booking.showtime.timezone)} ·{' '}
              {formatShowTime(booking.showtime.startAt, booking.showtime.timezone)}
            </p>

            <p className="mt-2 text-sm">
              <span className="text-ivory-muted">Seats: </span>
              <span className="text-ivory">
                {booking.seats
                  .filter((seat) => !seat.cancelled)
                  .map((seat) => seat.label)
                  .join(', ') || '—'}
              </span>
            </p>

            <p className="mt-1 font-mono text-xs text-ivory-muted">{booking.reference}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              STATUS_STYLES[booking.status] ?? 'bg-charcoal-soft text-ivory-muted'
            }`}
          >
            {STATUS_LABELS[booking.status] ?? booking.status}
          </span>

          <span className="text-sm font-semibold text-ivory">
            {formatMoney(booking.amountPaise, booking.currency)}
          </span>

          {booking.paymentStatus && booking.paymentStatus !== 'paid' && (
            <span className="text-xs text-ivory-muted">
              {PAYMENT_LABELS[booking.paymentStatus] ?? booking.paymentStatus}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5 border-t border-slate-line pt-4">
        {booking.status === 'confirmed' && (
          <Button as={Link} to={`/bookings/${booking.id}/ticket`} size="sm">
            <Ticket className="size-4" aria-hidden="true" />
            View ticket
          </Button>
        )}

        {booking.status === 'pending_payment' && (
          <Button as={Link} to={`/checkout?booking=${booking.id}`} size="sm">
            Complete payment
          </Button>
        )}

        {canCancel && (
          <Button variant="danger" size="sm" onClick={() => onCancel(booking)}>
            Cancel booking
          </Button>
        )}
      </div>
    </article>
  );
}

export default function MyBookingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = searchParams.get('scope') ?? 'upcoming';
  const toast = useToast();

  const [cancelTarget, setCancelTarget] = useState(null);
  const [quote, setQuote] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(
    ({ signal }) => fetchBookings({ scope, limit: 50 }, { signal }),
    [scope],
  );
  const { data, loading, error, refetch } = useResource(load, [scope]);

  const bookings = data?.data ?? [];

  const openCancel = async (booking) => {
    setCancelTarget(booking);
    setQuote(null);
    try {
      setQuote(await fetchCancellationQuote(booking.id));
    } catch {
      setQuote({ eligible: false, reason: 'We could not work out your refund just now.' });
    }
  };

  const confirmCancel = async () => {
    setCancelling(true);
    try {
      const result = await cancelBooking(cancelTarget.id, {
        reason: 'Cancelled by customer',
      });
      toast.success(
        result.refund
          ? `Booking cancelled. A refund of ${formatMoney(result.refund.amountPaise)} is on its way.`
          : 'Booking cancelled. No refund is due under the policy that applied.',
      );
      setCancelTarget(null);
      refetch();
    } catch (cancelError) {
      toast.error(cancelError.message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="page-shell py-10">
      <header className="mb-7">
        <h1 className="text-3xl text-ivory sm:text-4xl">My bookings</h1>
        <p className="mt-2 text-sm text-ivory-muted">Your tickets and booking history.</p>
      </header>

      <div className="mb-7 flex gap-2" role="tablist" aria-label="Booking scope">
        {[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={scope === tab.value}
            onClick={() => setSearchParams({ scope: tab.value }, { replace: true })}
            className={[
              'rounded-full px-4 py-2 text-sm font-medium transition',
              scope === tab.value
                ? 'bg-amber-brand text-midnight'
                : 'neu text-ivory-dim hover:text-ivory',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <ShowListSkeleton count={2} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={scope === 'upcoming' ? 'No upcoming bookings' : 'Nothing in your history yet'}
          description={
            scope === 'upcoming'
              ? 'When you book a ticket it will appear here.'
              : 'Past bookings will show up here after the show.'
          }
          action={
            <Button as={Link} to="/shows">
              Find a show
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} onCancel={openCancel} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        title="Cancel this booking?"
        confirmLabel="Yes, cancel"
        cancelLabel="Keep booking"
        variant="danger"
        loading={cancelling}
      >
        {quote === null ? (
          <p className="text-sm text-ivory-muted">Working out your refund…</p>
        ) : quote.eligible ? (
          <div className="space-y-3 text-sm">
            <p className="text-ivory-dim">
              {cancelTarget?.movie.title} ·{' '}
              {cancelTarget &&
                formatShowDate(
                  cancelTarget.showtime.startAt,
                  cancelTarget.showtime.timezone,
                )}
            </p>
            <div className="neu-inset rounded-xl p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-ivory-muted">Refund due</span>
                <span className="text-lg font-semibold text-status-good">
                  {formatMoney(quote.refundablePaise)}
                </span>
              </div>
              {quote.policyApplied?.label && (
                <p className="mt-2 text-xs text-ivory-muted">{quote.policyApplied.label}</p>
              )}
            </div>
            <p className="text-xs text-ivory-muted">
              Your seats go back on sale immediately. Refunds usually reach your account within 5
              to 7 working days.
            </p>
          </div>
        ) : (
          <p className="text-sm text-status-warn">
            {quote.reason ?? 'This booking cannot be cancelled.'}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
