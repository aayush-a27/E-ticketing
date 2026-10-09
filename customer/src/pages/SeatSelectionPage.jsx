import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { createSeatHold, fetchSeatMap, fetchShow } from '../services/showService.js';
import { useResource } from '../hooks/useResource.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { SeatMap } from '../components/seats/SeatMap.jsx';
import { Button } from '../components/common/Button.jsx';
import { ErrorState, LoadingBlock } from '../components/common/States.jsx';
import { ERROR_CODES, idempotencyKey } from '../services/api.js';
import { formatMoney, formatShowDate, formatShowTime } from '../utils/format.js';

/** Availability is re-read on this cadence so the map does not go stale. */
const REFRESH_MS = 15_000;

export default function SeatSelectionPage() {
  const { showId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuth();

  const [selected, setSelected] = useState([]);
  const [holding, setHolding] = useState(false);
  // Regenerated per attempt, so a retry of the same click is idempotent but a
  // genuinely new attempt is not mistaken for a replay.
  const holdKeyRef = useRef(idempotencyKey());

  const loadShow = useCallback(({ signal }) => fetchShow(showId, { signal }), [showId]);
  const loadSeats = useCallback(({ signal }) => fetchSeatMap(showId, { signal }), [showId]);

  const show = useResource(loadShow, [showId]);
  const seats = useResource(loadSeats, [showId]);

  // Poll while the tab is visible. The server is the authority; this only
  // keeps what the customer is looking at close to the truth.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !holding) seats.refetch();
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [seats, holding]);

  // Drop any selected seat that someone else has taken since.
  useEffect(() => {
    if (!seats.data) return;
    const stillFree = new Set(
      seats.data.seats
        .filter((seat) => seat.state === 'available' || seat.heldByYou)
        .map((seat) => seat.seatId),
    );

    setSelected((current) => {
      const kept = current.filter((id) => stillFree.has(id));
      if (kept.length !== current.length) {
        toast.warning('Some of your seats were taken. We have deselected them.');
      }
      return kept;
    });
  }, [seats.data, toast]);

  const seatMap = seats.data;
  const selectedSeats = seatMap
    ? seatMap.seats.filter((seat) => selected.includes(seat.seatId))
    : [];

  // Summed only to preview the ticket subtotal; the authoritative figure comes
  // back with the hold.
  const previewPaise = selectedSeats.reduce((sum, seat) => sum + (seat.pricePaise ?? 0), 0);

  const toggleSeat = (seat) => {
    setSelected((current) =>
      current.includes(seat.seatId)
        ? current.filter((id) => id !== seat.seatId)
        : [...current, seat.seatId],
    );
  };

  const proceed = async () => {
    if (selected.length === 0) return;

    if (!isAuthenticated) {
      // Keep the destination so they return here after signing in.
      navigate('/login', {
        state: { from: { pathname: `/shows/${showId}/seats` } },
      });
      return;
    }

    setHolding(true);
    try {
      const hold = await createSeatHold({
        showId,
        seatIds: selected,
        key: holdKeyRef.current,
      });
      // The hold id is the only thing checkout needs; it refetches the rest.
      navigate(`/checkout?hold=${hold.id}`);
    } catch (error) {
      holdKeyRef.current = idempotencyKey();

      if (error.code === ERROR_CODES.SEATS_UNAVAILABLE) {
        toast.error('One or more selected seats are no longer available. Please choose different seats.');
        setSelected([]);
        seats.refetch();
      } else if (error.code === ERROR_CODES.HOLD_LIMIT_EXCEEDED) {
        toast.error(error.message);
      } else if (error.code === ERROR_CODES.SHOW_NOT_BOOKABLE) {
        toast.error(error.message);
        seats.refetch();
      } else {
        toast.error(error.message);
      }
    } finally {
      setHolding(false);
    }
  };

  if (show.loading || seats.loading) return <LoadingBlock label="Loading seats" />;

  if (show.error || seats.error) {
    return (
      <div className="page-shell py-16">
        <ErrorState
          error={show.error ?? seats.error}
          onRetry={() => {
            show.refetch();
            seats.refetch();
          }}
        />
        <div className="mt-6 text-center">
          <Button as={Link} to="/shows" variant="secondary">
            Back to showtimes
          </Button>
        </div>
      </div>
    );
  }

  const detail = show.data;

  return (
    <div className="page-shell py-8 pb-40 lg:pb-8">
      <Link
        to={detail.movie?.slug ? `/movies/${detail.movie.slug}` : '/shows'}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ivory-muted transition hover:text-ivory"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </Link>

      <header className="mb-7">
        <h1 className="text-2xl text-ivory sm:text-3xl">{detail.movie?.title}</h1>
        <p className="mt-1.5 text-sm text-ivory-muted">
          {detail.theater?.name} · {detail.screen?.name} ·{' '}
          {formatShowDate(detail.startAt, detail.timezone)} at{' '}
          {formatShowTime(detail.startAt, detail.timezone)}
        </p>
        <p className="mt-1 text-xs text-ivory-muted">
          {detail.language} · {detail.format}
          {seatMap?.summary && (
            <span> · {seatMap.summary.available} of {seatMap.summary.total} seats free</span>
          )}
        </p>
      </header>

      <div className="card-surface p-5 sm:p-7">
        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            onClick={seats.refetch}
            className="inline-flex items-center gap-1.5 text-xs text-ivory-muted transition hover:text-ivory"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh availability
          </button>
        </div>

        <SeatMap
          seatMap={seatMap}
          selectedIds={selected}
          onToggle={toggleSeat}
          disabled={holding}
        />
      </div>

      {/* Sticky on mobile so the primary action is always reachable. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-line bg-midnight/95 p-4 backdrop-blur-xl lg:static lg:mt-7 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="page-shell flex items-center justify-between gap-4 lg:px-0">
          <div className="min-w-0">
            {selectedSeats.length > 0 ? (
              <>
                <p className="truncate text-sm font-medium text-ivory">
                  {selectedSeats.map((seat) => seat.label).join(', ')}
                </p>
                <p className="text-xs text-ivory-muted">
                  {selectedSeats.length}{' '}
                  {selectedSeats.length === 1 ? 'seat' : 'seats'} ·{' '}
                  {formatMoney(previewPaise)} before fees
                </p>
              </>
            ) : (
              <p className="text-sm text-ivory-muted">Pick your seats to continue</p>
            )}
          </div>

          <Button
            onClick={proceed}
            loading={holding}
            disabled={selectedSeats.length === 0}
            size="lg"
            className="shrink-0"
          >
            {holding ? 'Holding seats' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
