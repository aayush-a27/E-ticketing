import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import { fetchHold } from '../services/showService.js';
import { createBooking, fetchBooking } from '../services/bookingService.js';
import {
  createPaymentOrder,
  isSimulatedGateway,
  loadRazorpayScript,
  verifyPayment,
} from '../services/paymentService.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { CountdownBadge, useCountdown } from '../components/common/Countdown.jsx';
import { PriceBreakdown } from '../components/checkout/PriceBreakdown.jsx';
import { Button } from '../components/common/Button.jsx';
import { EmptyState, ErrorState, LoadingBlock } from '../components/common/States.jsx';
import { ERROR_CODES, idempotencyKey } from '../services/api.js';
import { formatShowDate, formatShowTime } from '../utils/format.js';

/**
 * Everything on this page is re-fetched from the hold id in the URL, so a
 * refresh behaves exactly like arriving fresh. Nothing essential is carried in
 * router state.
 */
export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const holdId = searchParams.get('hold');
  const bookingIdParam = searchParams.get('booking');

  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();

  const [booking, setBooking] = useState(null);
  const [paying, setPaying] = useState(false);
  const [expired, setExpired] = useState(false);
  const [outcome, setOutcome] = useState(null);

  // Guards against a second payment attempt from a double click, on top of the
  // server's own idempotency.
  const inFlightRef = useRef(false);
  const paymentKeyRef = useRef(idempotencyKey());

  const loadHold = useCallback(
    ({ signal }) => (holdId ? fetchHold(holdId, { signal }) : Promise.resolve(null)),
    [holdId],
  );
  const hold = useResource(loadHold, [holdId], { enabled: Boolean(holdId) });

  // Recovering an existing booking (e.g. after a refresh mid-payment).
  const loadBooking = useCallback(
    ({ signal }) => (bookingIdParam ? fetchBooking(bookingIdParam, { signal }) : Promise.resolve(null)),
    [bookingIdParam],
  );
  const existingBooking = useResource(loadBooking, [bookingIdParam], {
    enabled: Boolean(bookingIdParam),
  });

  useEffect(() => {
    if (existingBooking.data) setBooking(existingBooking.data);
  }, [existingBooking.data]);

  const expiresAt = hold.data?.expiresAt;
  const secondsLeft = useCountdown(expiresAt, () => setExpired(true));

  // A hold that was already dead when the page loaded.
  useEffect(() => {
    if (hold.data && hold.data.secondsRemaining <= 0) setExpired(true);
  }, [hold.data]);

  const startPayment = async () => {
    if (inFlightRef.current || expired) return;
    inFlightRef.current = true;
    setPaying(true);

    try {
      // Open the booking if this is the first attempt.
      let current = booking;
      if (!current) {
        current = await createBooking(holdId, { key: paymentKeyRef.current });
        setBooking(current);
      }

      const order = await createPaymentOrder(current.id, { key: paymentKeyRef.current });

      if (isSimulatedGateway(order.publicKey)) {
        // The server is running the simulated gateway. There is no fake
        // success path here: the customer is told plainly.
        setOutcome({
          kind: 'gateway-unavailable',
          message:
            'This server is running a simulated payment gateway, so no real payment can be taken. Set PAYMENT_PROVIDER=razorpay with test keys on the backend to complete a booking.',
        });
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setOutcome({
          kind: 'error',
          message: 'We could not load the payment window. Check your connection and try again.',
        });
        return;
      }

      await new Promise((resolve) => {
        const razorpay = new window.Razorpay({
          key: order.publicKey,
          order_id: order.order.orderId,
          amount: order.order.amountPaise,
          currency: order.order.currency,
          name: 'CineReserve',
          description: `${current.movie.title} · ${current.seats.length} seat(s)`,
          image: '/ticket.svg',
          prefill: { name: user?.name, email: user?.email, contact: user?.phone ?? undefined },
          theme: { color: '#D4A24C' },

          handler: async (response) => {
            // The browser saying "paid" proves nothing. The server verifies
            // the signature and decides what actually happened.
            try {
              const result = await verifyPayment(current.id, {
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });

              setBooking(result.booking);

              if (result.outcome === 'unfulfillable') {
                setOutcome({
                  kind: 'unfulfillable',
                  message:
                    'Your payment went through, but the seats were released before it completed. A refund has been started automatically.',
                });
              } else {
                toast.success('Payment confirmed');
                navigate(`/bookings/${result.booking.id}/ticket`, { replace: true });
              }
            } catch (error) {
              setOutcome({
                kind: error.code === ERROR_CODES.SIGNATURE_INVALID ? 'verification-failed' : 'error',
                message: error.message,
              });
            } finally {
              resolve();
            }
          },

          modal: {
            // Dismissing the window is not a failure; the booking stays open
            // for as long as the hold lives.
            ondismiss: () => {
              setOutcome({
                kind: 'cancelled',
                message: 'Payment was not completed. Your seats are held until the timer runs out.',
              });
              resolve();
            },
          },
        });

        razorpay.on('payment.failed', (event) => {
          setOutcome({
            kind: 'failed',
            message:
              event?.error?.description ??
              'The payment was declined. You can try again while your seats are held.',
          });
          resolve();
        });

        razorpay.open();
      });
    } catch (error) {
      if (error.code === ERROR_CODES.HOLD_EXPIRED) {
        setExpired(true);
      } else {
        setOutcome({ kind: 'error', message: error.message });
      }
    } finally {
      inFlightRef.current = false;
      setPaying(false);
      // A fresh attempt must not be mistaken for a replay of the last one.
      paymentKeyRef.current = idempotencyKey();
    }
  };

  if (!holdId && !bookingIdParam) {
    return (
      <div className="page-shell py-16">
        <EmptyState
          title="Nothing to check out"
          description="Pick your seats first, and we will bring you back here."
          action={
            <Button as={Link} to="/shows">
              Find a show
            </Button>
          }
        />
      </div>
    );
  }

  if (hold.loading || existingBooking.loading) return <LoadingBlock label="Loading your booking" />;

  if (hold.error && !booking) {
    const gone = hold.error.code === ERROR_CODES.NOT_FOUND;
    return (
      <div className="page-shell py-16">
        {gone ? (
          <EmptyState
            icon={AlertTriangle}
            title="That hold is gone"
            description="Your seats were released. Please choose seats again."
            action={
              <Button as={Link} to="/shows">
                Choose seats
              </Button>
            }
          />
        ) : (
          <ErrorState error={hold.error} onRetry={hold.refetch} />
        )}
      </div>
    );
  }

  const pricing = booking?.pricing ?? hold.data?.pricing;
  const seats = booking?.seats ?? [];

  if (expired && booking?.status !== 'confirmed') {
    return (
      <div className="page-shell py-16">
        <EmptyState
          icon={AlertTriangle}
          title="Your seats were released"
          description="The hold expired before the payment was completed. Nothing has been charged. Please select your seats again."
          action={
            <Button as={Link} to="/shows">
              Choose seats again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-shell py-10">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ivory-muted transition hover:text-ivory"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to seats
      </button>

      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl text-ivory">Checkout</h1>
        {expiresAt && <CountdownBadge secondsLeft={secondsLeft} />}
      </div>

      {outcome && (
        <div
          role="alert"
          className={[
            'mb-6 flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm',
            outcome.kind === 'cancelled'
              ? 'border-status-warn/40 bg-status-warn/10 text-status-warn'
              : 'border-status-bad/40 bg-status-bad/10 text-status-bad',
          ].join(' ')}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p>{outcome.message}</p>
            {outcome.kind === 'unfulfillable' && booking && (
              <Link
                to="/my-bookings"
                className="mt-2 inline-block font-medium underline underline-offset-2"
              >
                Track the refund in My bookings
              </Link>
            )}
          </div>
        </div>
      )}

      {/* φ: summary column takes 1.618 of the payment panel. */}
      <div className="grid gap-6 lg:grid-cols-[1.618fr_1fr]">
        <section className="card-surface p-6" aria-labelledby="booking-summary">
          <h2 id="booking-summary" className="mb-5 text-lg text-ivory">
            Your booking
          </h2>

          {booking ? (
            <div className="flex gap-4">
              {booking.movie.posterUrl && (
                <img
                  src={booking.movie.posterUrl}
                  alt=""
                  className="h-32 w-22 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0">
                <h3 className="text-xl text-ivory">{booking.movie.title}</h3>
                <p className="mt-1.5 text-sm text-ivory-dim">
                  {booking.theater.name} · {booking.theater.screen}
                </p>
                <p className="text-sm text-ivory-muted">{booking.theater.address}</p>
                <p className="mt-2.5 text-sm text-ivory-dim">
                  {formatShowDate(booking.showtime.startAt, booking.showtime.timezone)} ·{' '}
                  {formatShowTime(booking.showtime.startAt, booking.showtime.timezone)}
                </p>
                <p className="mt-2.5 text-sm">
                  <span className="text-ivory-muted">Seats: </span>
                  <span className="font-medium text-amber-bright">
                    {booking.seats.map((seat) => seat.label).join(', ')}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ivory-muted">
              {hold.data?.seatIds?.length ?? 0} seat(s) held. Your booking is created when you pay.
            </p>
          )}
        </section>

        <section className="card-surface h-max p-6" aria-labelledby="price-summary">
          <h2 id="price-summary" className="mb-5 text-lg text-ivory">
            Price details
          </h2>

          <PriceBreakdown pricing={pricing} seats={seats} />

          <Button
            onClick={startPayment}
            loading={paying}
            disabled={expired || booking?.status === 'confirmed'}
            size="lg"
            className="mt-6 w-full"
          >
            <Lock className="size-4" aria-hidden="true" />
            {paying ? 'Opening payment' : 'Pay securely'}
          </Button>

          <p className="mt-3.5 flex items-start gap-2 text-xs text-ivory-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-status-good" aria-hidden="true" />
            Every payment is verified on our server before a ticket is issued.
          </p>
        </section>
      </div>
    </div>
  );
}
