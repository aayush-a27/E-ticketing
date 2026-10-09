import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Pencil, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  blockSeat,
  cancelShow,
  fetchInventorySummary,
  fetchShow,
  fetchShowSeats,
  publishShow,
  unblockSeat,
} from '../../services/showService.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Card,
  CardHeader,
  DetailList,
  DetailRow,
  PageHeader,
  StatCard,
} from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { count, dateTime, money, pluralize } from '../../utils/format.js';

/**
 * One show: how it is configured, how its seats are selling, and the two
 * status changes it allows.
 *
 * Publishing opens booking. Cancelling closes it and tells you how many sold
 * seats are owed a refund — the server returns that number, so the
 * consequence is stated before and after rather than discovered later.
 */
export default function ShowDetailPage() {
  const { showId } = useParams();
  const { namespace } = useAuth();
  const toast = useToast();

  const [pending, setPending] = useState(null);
  const [working, setWorking] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [seatsOpen, setSeatsOpen] = useState(false);

  const showResource = useResource(
    useCallback(({ signal }) => fetchShow(namespace, showId, { signal }), [namespace, showId]),
    [namespace, showId],
  );

  const inventory = useResource(
    useCallback(
      ({ signal }) => fetchInventorySummary(namespace, showId, { signal }),
      [namespace, showId],
    ),
    [namespace, showId],
  );

  const show = showResource.data;

  if (showResource.loading) return <LoadingBlock label="Loading show" />;
  if (showResource.error) {
    return <ErrorState error={showResource.error} onRetry={showResource.refetch} />;
  }
  if (!show) return null;

  const onPublish = async () => {
    setWorking(true);
    try {
      await publishShow(namespace, show._id);
      toast.success('Published. Booking is now open.');
      setPending(null);
      showResource.refetch();
      inventory.refetch();
    } catch (caught) {
      toast.fromError(caught, 'Could not publish this show.');
    } finally {
      setWorking(false);
    }
  };

  const onCancel = async () => {
    if (cancelReason.trim().length < 5) {
      toast.error('Record why, in at least five characters.');
      return;
    }
    setWorking(true);
    try {
      const result = await cancelShow(namespace, show._id, { reason: cancelReason.trim() });
      toast.success(
        result.seatsToRefund
          ? `Show cancelled. ${pluralize(result.seatsToRefund, 'sold seat')} owed a refund.`
          : 'Show cancelled. No seats had been sold.',
        { duration: 10_000 },
      );
      setPending(null);
      setCancelReason('');
      showResource.refetch();
    } catch (caught) {
      toast.fromError(caught, 'Could not cancel this show.');
    } finally {
      setWorking(false);
    }
  };

  const summary = inventory.data;
  const isPast = new Date(show.startAt).getTime() < Date.now();
  const canPublish = show.status === 'draft';
  const canCancel = show.status === 'published' || show.status === 'draft';

  return (
    <>
      <PageHeader
        title={show.movieId?.title ?? 'Show'}
        description={`${dateTime(show.startAt)} · ${show.theaterId?.name ?? ''} · ${
          show.screenId?.name ?? ''
        }`}
        actions={
          <>
            <Button as={Link} to="/shows" variant="secondary">
              <ArrowLeft className="size-4" aria-hidden="true" />
              All shows
            </Button>
            {show.status !== 'cancelled' && !isPast && (
              <Button as={Link} to={`/shows/${show._id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </Button>
            )}
            {canPublish && (
              <Button variant="brand" onClick={() => setPending('publish')}>
                <Send className="size-4" aria-hidden="true" />
                Publish
              </Button>
            )}
            {canCancel && (
              <Button variant="danger-quiet" onClick={() => setPending('cancel')}>
                <Ban className="size-4" aria-hidden="true" />
                Cancel show
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={show.status} />
          <Badge tone="info">{show.format}</Badge>
          <Badge>{show.language}</Badge>
          <Badge>Layout v{show.layoutVersion}</Badge>
          {isPast && <Badge tone="neutral">Already started</Badge>}
          {show.isBookable === false && show.status === 'published' && (
            <Badge tone="warn">Not currently bookable</Badge>
          )}
        </div>
      </PageHeader>

      {show.status === 'cancelled' && (
        <div
          className="mb-5 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3.5 py-3"
          role="alert"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
          <p className="text-sm text-ink-800">
            <span className="font-medium">Cancelled {dateTime(show.cancelledAt)}.</span>{' '}
            {show.cancellationReason}
          </p>
        </div>
      )}

      <section aria-label="Seat inventory" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sold"
          value={summary ? count(summary.booked) : ''}
          hint={summary ? `of ${count(summary.total)} seats` : undefined}
          loading={inventory.loading}
          tone="good"
        />
        <StatCard
          label="Available"
          value={summary ? count(summary.available) : ''}
          loading={inventory.loading}
        />
        <StatCard
          label="Held right now"
          value={summary ? count(summary.held) : ''}
          hint="In someone's basket"
          loading={inventory.loading}
          tone="warn"
        />
        <StatCard
          label="Out of sale"
          value={summary ? count(summary.blocked) : ''}
          hint="Blocked by staff"
          loading={inventory.loading}
          tone={summary?.blocked > 0 ? 'info' : 'neutral'}
        />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.618fr]">
        <Card>
          <CardHeader title="Pricing" description="Per seat, before fees and tax." />
          <div className="p-5">
            <DetailList>
              {show.pricing?.map((item) => (
                <DetailRow key={item.category} label={item.category}>
                  {money(item.basePaise)}
                </DetailRow>
              ))}
            </DetailList>
            <p className="mt-4 text-xs text-ink-500">
              Convenience fees and tax are added at checkout from the platform settings, and each
              booking stores the breakdown it was quoted.
              {summary?.booked > 0
                ? ' Pricing is now fixed: the server refuses to change it once a ticket is sold.'
                : ' Pricing can still be changed until the first ticket is sold.'}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="The show"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  inventory.refetch();
                  showResource.refetch();
                }}
                loading={inventory.loading}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Refresh
              </Button>
            }
          />
          <div className="p-5">
            <DetailList>
              <DetailRow label="Film">{show.movieId?.title}</DetailRow>
              <DetailRow label="Runtime">
                {show.movieId?.runtimeMinutes
                  ? `${count(show.movieId.runtimeMinutes)} minutes`
                  : null}
              </DetailRow>
              <DetailRow label="Venue">{show.theaterId?.name}</DetailRow>
              <DetailRow label="Screen">{show.screenId?.name}</DetailRow>
              <DetailRow label="City">{show.theaterId?.cityLabel}</DetailRow>
              <DetailRow label="Starts">{dateTime(show.startAt)}</DetailRow>
              <DetailRow label="Ends">{dateTime(show.endAt)}</DetailRow>
              <DetailRow label="Timezone">{show.timezone}</DetailRow>
              {show.bookingOpensAt && (
                <DetailRow label="Booking opens">{dateTime(show.bookingOpensAt)}</DetailRow>
              )}
              {show.bookingClosesAt && (
                <DetailRow label="Booking closes">{dateTime(show.bookingClosesAt)}</DetailRow>
              )}
              <DetailRow label="Seat layout">Version {show.layoutVersion}</DetailRow>
              <DetailRow label="Inventory generated">
                {show.inventoryGeneratedAt ? dateTime(show.inventoryGeneratedAt) : null}
              </DetailRow>
              <DetailRow label="Created">{dateTime(show.createdAt)}</DetailRow>
            </DetailList>

            <div className="mt-5 border-t border-ink-100 pt-4">
              <Button variant="secondary" size="sm" onClick={() => setSeatsOpen(true)}>
                Manage individual seats
              </Button>
              <p className="mt-2 text-xs text-ink-500">
                Take a seat out of sale — a broken recliner, a distancing gap. The server refuses
                if the seat is held or already sold, so no paying customer is stranded.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <SeatManagerDialog
        open={seatsOpen}
        onClose={() => setSeatsOpen(false)}
        namespace={namespace}
        showId={show._id}
        toast={toast}
        onChanged={inventory.refetch}
      />

      <ConfirmDialog
        open={pending === 'publish'}
        onClose={() => setPending(null)}
        onConfirm={onPublish}
        loading={working}
        variant="brand"
        title="Publish this show?"
        description="Booking opens immediately and the show appears on the customer site. Seat inventory is generated from the screen's layout if it has not been already."
        confirmLabel="Publish"
      />

      <Dialog
        open={pending === 'cancel'}
        onClose={working ? undefined : () => setPending(null)}
        title="Cancel this show?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={working}>
              Keep the show
            </Button>
            <Button variant="danger" onClick={onCancel} loading={working}>
              Cancel show
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bad-soft">
              <TriangleAlert className="size-4 text-bad" aria-hidden="true" />
            </div>
            <div className="min-w-0 text-sm text-ink-700">
              <p>
                Booking closes and the show disappears from the customer site. This cannot be
                undone.
              </p>
              {summary?.booked > 0 && (
                <p className="mt-2 font-medium text-ink-900">
                  {pluralize(summary.booked, 'seat')} has already been sold. Those customers are
                  owed a refund, and the server reports the exact count back.
                </p>
              )}
            </div>
          </div>

          <TextField
            label="Reason"
            required
            hint="Recorded in the audit log. At least five characters."
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Projector fault in Audi 1"
          />
        </div>
      </Dialog>
    </>
  );
}

/**
 * Blocking and unblocking single seats.
 *
 * Only available and blocked seats can be acted on, so the list is grouped by
 * state and the ones that cannot move say why. The server enforces the same
 * rule; this just avoids offering an action that will be refused.
 */
function SeatManagerDialog({ open, onClose, namespace, showId, toast, onChanged }) {
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState(null);

  const seats = useResource(
    useCallback(
      ({ signal }) => (open ? fetchShowSeats(namespace, showId, { signal }) : null),
      [namespace, showId, open],
    ),
    [open],
    { enabled: open },
  );

  const act = async (seat) => {
    const blocking = seat.state === 'available';
    if (blocking && reason.trim().length < 3) {
      toast.error('Record why this seat is out of sale.');
      return;
    }

    setBusyId(seat.seatId);
    try {
      if (blocking) {
        await blockSeat(namespace, showId, seat.seatId, { reason: reason.trim() });
        toast.success(`${seat.label} taken out of sale.`);
      } else {
        await unblockSeat(namespace, showId, seat.seatId);
        toast.success(`${seat.label} returned to sale.`);
      }
      seats.refetch();
      onChanged();
    } catch (caught) {
      toast.fromError(caught);
    } finally {
      setBusyId(null);
    }
  };

  const rows = seats.data?.seats ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Individual seats"
      description="Available seats can be taken out of sale; blocked ones can be returned. Held and sold seats cannot be touched."
      size="lg"
    >
      {seats.loading ? (
        <LoadingBlock label="Loading seats" />
      ) : seats.error ? (
        <ErrorState error={seats.error} onRetry={seats.refetch} />
      ) : (
        <div className="space-y-4">
          <TextField
            label="Reason for taking a seat out of sale"
            hint="Required when blocking. Recorded in the audit log."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Broken recliner"
          />

          <div className="flex flex-wrap gap-1.5">
            {rows.map((seat) => {
              const actionable = seat.state === 'available' || seat.state === 'blocked';
              const tone =
                seat.state === 'booked'
                  ? 'bg-good text-white'
                  : seat.state === 'held'
                    ? 'bg-warn text-white'
                    : seat.state === 'blocked'
                      ? 'border border-dashed border-ink-400 bg-white text-ink-500'
                      : 'bg-ink-200 text-ink-800 hover:bg-ink-300';

              return (
                <button
                  key={seat.seatId}
                  type="button"
                  disabled={!actionable || busyId === seat.seatId}
                  onClick={() => act(seat)}
                  title={`${seat.label} · ${seat.category} · ${seat.state}${
                    actionable ? '' : ' (cannot be changed)'
                  }`}
                  aria-label={`${seat.label}, ${seat.category}, ${seat.state}`}
                  className={`h-7 min-w-9 rounded px-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tone}`}
                >
                  {seat.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 border-t border-ink-100 pt-3 text-xs text-ink-600">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-ink-200" aria-hidden="true" /> Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-good" aria-hidden="true" /> Sold
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-warn" aria-hidden="true" /> Held
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-3 rounded border border-dashed border-ink-400 bg-white"
                aria-hidden="true"
              />{' '}
              Out of sale
            </span>
          </div>
        </div>
      )}
    </Dialog>
  );
}
