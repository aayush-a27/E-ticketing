import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Clock, MapPin, Printer, Ticket } from 'lucide-react';
import { fetchTicket } from '../services/bookingService.js';
import { useResource } from '../hooks/useResource.js';
import { Button } from '../components/common/Button.jsx';
import { EmptyState, ErrorState, LoadingBlock } from '../components/common/States.jsx';
import { ERROR_CODES } from '../services/api.js';
import { formatFullDateTime, formatMoney } from '../utils/format.js';

/**
 * The ticket only exists for a confirmed booking — the endpoint refuses
 * anything else, so there is no path here that renders a convincing ticket for
 * a payment that did not complete.
 */
export default function TicketPage() {
  const { bookingId } = useParams();

  const load = useCallback(({ signal }) => fetchTicket(bookingId, { signal }), [bookingId]);
  const { data, loading, error, refetch } = useResource(load, [bookingId]);

  if (loading) return <LoadingBlock label="Loading your ticket" />;

  if (error) {
    const notConfirmed = error.code === ERROR_CODES.PAYMENT_NOT_CONFIRMED;
    return (
      <div className="page-shell py-16">
        {notConfirmed ? (
          <EmptyState
            icon={Clock}
            title="No ticket yet"
            description={`${error.message} If you have just paid, give it a moment and refresh.`}
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="secondary" onClick={refetch}>
                  Check again
                </Button>
                <Button as={Link} to="/my-bookings">
                  My bookings
                </Button>
              </div>
            }
          />
        ) : (
          <ErrorState error={error} onRetry={refetch} />
        )}
      </div>
    );
  }

  const { booking, ticket } = data;

  return (
    <div className="page-shell py-10">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/my-bookings"
          className="inline-flex items-center gap-1.5 text-sm text-ivory-muted transition hover:text-ivory"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          My bookings
        </Link>

        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden="true" />
          Print
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-xl"
      >
        <div className="no-print mb-6 flex items-center justify-center gap-2.5 text-status-good">
          <CheckCircle2 className="size-5" aria-hidden="true" />
          <p className="font-medium">Booking confirmed</p>
        </div>

        <article className="print-ticket card-surface overflow-hidden">
          <header className="border-b border-dashed border-slate-line p-6 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-ivory-muted">CineReserve</p>
            <h1 className="mt-2.5 text-2xl text-ivory">{booking.movie.title}</h1>
            {booking.movie.certification && (
              <span className="mt-2 inline-block rounded border border-slate-line px-2 py-0.5 text-[10px] font-semibold text-ivory-dim">
                {booking.movie.certification}
              </span>
            )}
          </header>

          <div className="space-y-5 p-6">
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-amber-brand" aria-hidden="true" />
              <div>
                <p className="font-medium text-ivory">{booking.theater.name}</p>
                <p className="text-sm text-ivory-muted">{booking.theater.address}</p>
                <p className="text-sm text-ivory-muted">{booking.theater.screen}</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 size-4 shrink-0 text-amber-brand" aria-hidden="true" />
              <p className="text-sm text-ivory-dim">
                {formatFullDateTime(booking.showtime.startAt, booking.showtime.timezone)}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-5 border-y border-dashed border-slate-line py-5">
              <div>
                <dt className="text-xs uppercase tracking-wider text-ivory-muted">Seats</dt>
                <dd className="mt-1 font-display text-lg text-amber-bright">
                  {booking.seats
                    .filter((seat) => !seat.cancelled)
                    .map((seat) => seat.label)
                    .join(', ')}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-ivory-muted">Paid</dt>
                <dd className="mt-1 font-display text-lg text-ivory">
                  {formatMoney(booking.amountPaise, booking.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-ivory-muted">Reference</dt>
                <dd className="mt-1 font-mono text-sm text-ivory">{booking.reference}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-ivory-muted">Status</dt>
                <dd className="mt-1 text-sm capitalize text-status-good">{booking.status}</dd>
              </div>
            </dl>

            {booking.seats.some((seat) => seat.cancelled) && (
              <p className="text-xs text-status-warn">
                Cancelled seats:{' '}
                {booking.seats
                  .filter((seat) => seat.cancelled)
                  .map((seat) => seat.label)
                  .join(', ')}
              </p>
            )}

            <div className="flex flex-col items-center pt-2">
              {ticket.qrDataUrl ? (
                <img
                  src={ticket.qrDataUrl}
                  alt={`QR code for booking ${booking.reference}`}
                  className="size-44 rounded-lg bg-white p-2.5"
                />
              ) : (
                <div className="flex size-44 items-center justify-center rounded-lg bg-charcoal-soft">
                  <Ticket className="size-8 text-ivory-muted" aria-hidden="true" />
                </div>
              )}
              <p className="mt-3.5 text-center text-xs text-ivory-muted">
                {ticket.admittedAt
                  ? 'This ticket has already been scanned.'
                  : 'Show this code at the entrance.'}
              </p>
            </div>
          </div>
        </article>
      </motion.div>
    </div>
  );
}
