import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import { fetchUser, updateUserStatus } from '../../services/platformService.js';
import { fetchBookings } from '../../services/operationsService.js';
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
import { Dialog } from '../../components/ui/Dialog.jsx';
import { TextArea } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { count, dateTime, humanize, money } from '../../utils/format.js';

const CHANGES = {
  suspended: {
    label: 'Suspend',
    title: 'Suspend this account?',
    explain:
      'They are signed out everywhere immediately and cannot sign in until reactivated. Their bookings and tickets are untouched.',
    variant: 'danger',
    Icon: Ban,
  },
  deactivated: {
    label: 'Deactivate',
    title: 'Deactivate this account?',
    explain:
      'For an account that should no longer be used. They are signed out everywhere. Existing bookings are kept.',
    variant: 'danger',
    Icon: Ban,
  },
  active: {
    label: 'Reactivate',
    title: 'Reactivate this account?',
    explain: 'They can sign in again.',
    variant: 'brand',
    Icon: RotateCcw,
  },
};

/** One account: who they are, what they booked, and whether they may sign in. */
export default function UserDetailPage() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const toast = useToast();

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchUser(id, { signal }), [id]),
    [id],
  );

  const recent = useResource(
    useCallback(({ signal }) => fetchBookings('/admin', { userId: id, limit: 5 }, { signal }), [id]),
    [id],
  );

  const [change, setChange] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [changeError, setChangeError] = useState(null);

  if (loading) return <LoadingBlock label="Loading account" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const { user, showRunnerProfile, bookingSummary } = data;
  const isSelf = me?.id === user.id;
  const isAdmin = user.role === 'super_admin';
  // The server refuses both; the buttons are not offered rather than refused.
  const canChange = !isSelf && !isAdmin;
  const options = Object.keys(CHANGES).filter((status) => status !== user.accountStatus);

  const submit = async () => {
    setChangeError(null);
    if (reason.trim().length < 5) return setChangeError('Record why, in at least five characters.');
    setBusy(true);
    try {
      await updateUserStatus(user.id, { accountStatus: change, reason: reason.trim() });
      toast.success(`Account ${humanize(change).toLowerCase()}.`);
      setChange(null);
      setReason('');
      refetch();
    } catch (caught) {
      setChangeError(caught?.message ?? 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <>
            <Button as={Link} to="/users" variant="secondary">
              <ArrowLeft className="size-4" aria-hidden="true" />
              All accounts
            </Button>
            {canChange &&
              options.map((status) => {
                const { Icon, label, variant } = CHANGES[status];
                return (
                  <Button
                    key={status}
                    variant={variant === 'danger' ? 'danger-quiet' : 'secondary'}
                    onClick={() => setChange(status)}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </Button>
                );
              })}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isAdmin ? 'brand' : user.role === 'show_runner' ? 'info' : 'neutral'}>
            {humanize(user.role)}
          </Badge>
          <StatusBadge status={user.accountStatus} />
          {isSelf && <Badge>This is you</Badge>}
          {isAdmin && !isSelf && (
            <Badge>
              <ShieldCheck className="size-3" aria-hidden="true" />
              Cannot be suspended from the console
            </Badge>
          )}
        </div>
      </PageHeader>

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Bookings" value={count(bookingSummary?.totalBookings)} />
        <StatCard label="Confirmed" value={count(bookingSummary?.confirmedBookings)} tone="good" />
        <StatCard
          label="Confirmed value"
          value={money(bookingSummary?.confirmedValuePaise)}
          hint="Booked value, before any refunds"
        />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.618fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Account" />
            <div className="p-5">
              <DetailList>
                <DetailRow label="Name">{user.name}</DetailRow>
                <DetailRow label="Email">{user.email}</DetailRow>
                <DetailRow label="Phone">{user.phone}</DetailRow>
                <DetailRow label="Preferred city">{user.preferredCity}</DetailRow>
                <DetailRow label="Joined">{dateTime(user.createdAt)}</DetailRow>
              </DetailList>
            </div>
          </Card>

          {showRunnerProfile && (
            <Card>
              <CardHeader title="Show-runner profile" />
              <div className="p-5">
                <DetailList>
                  <DetailRow label="Business">{showRunnerProfile.businessName}</DetailRow>
                  <DetailRow label="Status"><StatusBadge status={showRunnerProfile.status} /></DetailRow>
                  <DetailRow label="Cities">{showRunnerProfile.operatingCities?.join(', ')}</DetailRow>
                  <DetailRow label="Approved">
                    {showRunnerProfile.approvedAt ? dateTime(showRunnerProfile.approvedAt) : null}
                  </DetailRow>
                </DetailList>
                <Button
                  as={Link}
                  to={`/show-runners?search=${encodeURIComponent(showRunnerProfile.businessName)}`}
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                >
                  Manage show runner
                </Button>
              </div>
            </Card>
          )}
        </div>

        <Card className="overflow-hidden">
          <CardHeader
            title="Latest bookings"
            actions={
              bookingSummary?.totalBookings > 0 && (
                <Button as={Link} to={`/bookings?userId=${user.id}`} variant="secondary" size="sm">
                  All {count(bookingSummary.totalBookings)}
                </Button>
              )
            }
          />
          {recent.loading ? (
            <LoadingBlock label="Loading bookings" />
          ) : recent.error ? (
            <div className="p-5">
              <ErrorState error={recent.error} onRetry={recent.refetch} />
            </div>
          ) : (recent.data?.items ?? []).length === 0 ? (
            <EmptyState title="No bookings" description="This account has not booked anything." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {recent.data.items.map((booking) => (
                <li key={booking.id}>
                  <Link
                    to={`/bookings/${booking.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-900">{booking.movie.title}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        <span className="font-mono">{booking.reference}</span> · {booking.theater.name} ·{' '}
                        {dateTime(booking.showtime.startAt)}
                      </p>
                    </div>
                    <StatusBadge status={booking.status} />
                    <span className="w-20 shrink-0 text-right text-sm font-medium">
                      {money(booking.amountPaise)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {change && (
        <Dialog
          open
          onClose={busy ? undefined : () => setChange(null)}
          title={CHANGES[change].title}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setChange(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant={CHANGES[change].variant} onClick={submit} loading={busy}>
                {CHANGES[change].label}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {changeError && (
              <p className="rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-ink-800" role="alert">
                {changeError}
              </p>
            )}
            <p className="text-sm text-ink-700">{CHANGES[change].explain}</p>
            <TextArea
              label="Reason"
              required
              rows={3}
              hint="Recorded in the audit log."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
