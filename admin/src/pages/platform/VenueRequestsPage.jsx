import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Check, Inbox, Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  approveTheaterRequest,
  fetchMyTheaterRequests,
  fetchPublicTheaters,
  fetchTheaterRequests,
  rejectTheaterRequest,
  submitTheaterRequest,
} from '../../services/platformService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Select, TextArea, TextField } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { dateTime, relative } from '../../utils/format.js';

/**
 * Venue requests. The same address shows a different page to each role: a
 * super admin reviews the queue, a show runner asks for a venue and sees what
 * became of their requests.
 */
export default function VenueRequestsPage() {
  const { isSuperAdmin } = useAuth();
  return isSuperAdmin ? <ReviewQueue /> : <MyRequests />;
}

function describeVenue(request) {
  if (request.theaterId) {
    return {
      name: request.theaterId.name ?? 'An existing theater',
      where: request.theaterId.cityLabel ?? '',
      isNew: false,
    };
  }
  const proposed = request.proposedTheater ?? {};
  return {
    name: proposed.name ?? 'A new theater',
    where: [proposed.addressLine1, proposed.city, proposed.state].filter(Boolean).join(', '),
    isNew: true,
  };
}

// ---------------------------------------------------------------------------

const DEFAULTS = { status: 'pending', page: 1 };

/**
 * The super admin's queue. Approving a claim on an existing theater assigns
 * it; approving a proposal creates the theater and then assigns it. Either way
 * the server re-checks that the runner is still active before granting it.
 */
function ReviewQueue() {
  const toast = useToast();
  const { filters, setFilters } = useFilters(DEFAULTS);
  const query = { ...filters, status: filters.status === 'all' ? '' : filters.status };

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchTheaterRequests(query, { signal }), [filters]),
    [filters],
  );

  const [deciding, setDeciding] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(null);

  const requests = data?.items ?? [];

  const decide = async () => {
    setDecisionError(null);
    if (deciding.kind === 'reject' && notes.trim().length < 5) {
      setDecisionError('Give the runner a reason, in at least five characters.');
      return;
    }
    setBusy(true);
    try {
      if (deciding.kind === 'approve') {
        const result = await approveTheaterRequest(deciding.request._id, {
          decisionNotes: notes.trim(),
        });
        toast.success(`Approved. ${result.theater?.name ?? 'The theater'} is now assigned to them.`);
      } else {
        await rejectTheaterRequest(deciding.request._id, { decisionNotes: notes.trim() });
        toast.success('Request rejected.');
      }
      setDeciding(null);
      setNotes('');
      refetch();
    } catch (caught) {
      setDecisionError(caught?.message ?? 'That did not work.');
      refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Venue requests"
        description="Show runners asking to manage a theater, or proposing a new one."
      />

      <Card className="overflow-hidden">
        <FilterBar activeCount={0}>
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilters({ status: value || 'pending' })}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'all', label: 'All' },
            ]}
            placeholder="Pending"
          />
        </FilterBar>

        {loading ? (
          <LoadingBlock label="Loading requests" />
        ) : error ? (
          <div className="p-5">
            <ErrorState error={error} onRetry={refetch} />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={filters.status === 'pending' ? 'Nothing waiting for review' : 'No requests here'}
            description="Show runners ask for venues from their own console."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {requests.map((request) => {
              const venue = describeVenue(request);
              return (
                <li key={request._id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-ink-900">{venue.name}</p>
                      {venue.isNew ? <Badge tone="info">New theater</Badge> : <Badge>Existing</Badge>}
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">{venue.where}</p>
                    <p className="mt-2 text-sm text-ink-700">
                      <span className="font-medium">{request.requesterId?.name}</span>{' '}
                      <span className="text-ink-500">({request.requesterId?.email})</span> ·{' '}
                      {relative(request.createdAt)}
                    </p>
                    <p className="mt-1.5 whitespace-pre-line rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800">
                      {request.justification}
                    </p>
                    {request.decisionNotes && request.status !== 'pending' && (
                      <p className="mt-1.5 text-xs text-ink-500">Decision: {request.decisionNotes}</p>
                    )}
                  </div>
                  {request.status === 'pending' && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="danger-quiet"
                        size="sm"
                        onClick={() => setDeciding({ kind: 'reject', request })}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        Reject
                      </Button>
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() => setDeciding({ kind: 'approve', request })}
                      >
                        <Check className="size-3.5" aria-hidden="true" />
                        Approve
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !error && requests.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>

      {deciding && (
        <Dialog
          open
          onClose={busy ? undefined : () => setDeciding(null)}
          title={deciding.kind === 'approve' ? 'Approve this request?' : 'Reject this request?'}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeciding(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant={deciding.kind === 'approve' ? 'brand' : 'danger'}
                onClick={decide}
                loading={busy}
              >
                {deciding.kind === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {decisionError && (
              <p className="rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-ink-800" role="alert">
                {decisionError}
              </p>
            )}
            <p className="text-sm text-ink-700">
              {deciding.kind === 'approve'
                ? describeVenue(deciding.request).isNew
                  ? 'This creates the theater from their proposal and assigns it to them. You can complete its details afterwards.'
                  : 'They become a manager of this theater and can schedule shows in it straight away.'
                : 'They can see your reason and ask again.'}
            </p>
            <TextArea
              label={deciding.kind === 'approve' ? 'Notes' : 'Reason'}
              required={deciding.kind === 'reject'}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              hint="Recorded in the audit log."
            />
          </div>
        </Dialog>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

/** A show runner's own requests, and the form to make one. */
function MyRequests() {
  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchMyTheaterRequests({ signal }), []),
    [],
  );
  const [asking, setAsking] = useState(false);
  const requests = data ?? [];

  return (
    <>
      <PageHeader
        title="Venue requests"
        description="Ask a platform administrator to let you manage a theater, or propose a new one."
        actions={
          <Button onClick={() => setAsking(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Request a venue
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader title="Your requests" />
        {loading ? (
          <LoadingBlock label="Loading your requests" />
        ) : error ? (
          <div className="p-5">
            <ErrorState error={error} onRetry={refetch} />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="You have not asked for a venue yet"
            description="Until a theater is assigned to you, there is nothing in this console you can manage."
            action={
              <Button size="sm" onClick={() => setAsking(true)}>
                Request a venue
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {requests.map((request) => {
              const venue = describeVenue(request);
              return (
                <li key={request._id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink-900">{venue.name}</p>
                    <StatusBadge status={request.status} />
                    <span className="text-xs text-ink-500">{dateTime(request.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">{venue.where}</p>
                  {request.decisionNotes && request.status !== 'pending' && (
                    <p className="mt-2 text-sm text-ink-700">Response: {request.decisionNotes}</p>
                  )}
                  {request.status === 'approved' && request.theaterId && (
                    <Button
                      as={Link}
                      to={`/theaters/${request.theaterId._id ?? request.theaterId}`}
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                    >
                      Open the theater
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <RequestDialog
        open={asking}
        onClose={() => setAsking(false)}
        onDone={() => {
          setAsking(false);
          refetch();
        }}
      />
    </>
  );
}

function RequestDialog({ open, onClose, onDone }) {
  const toast = useToast();
  const [mode, setMode] = useState('existing');
  const [theaterId, setTheaterId] = useState('');
  const [proposed, setProposed] = useState({
    name: '',
    addressLine1: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const theaters = useResource(
    useCallback(({ signal }) => (open ? fetchPublicTheaters({}, { signal }) : null), [open]),
    [open],
    { enabled: open },
  );

  if (!open) return null;

  const setField = (field) => (event) =>
    setProposed((current) => ({ ...current, [field]: event.target.value }));

  const submit = async () => {
    setError(null);
    if (justification.trim().length < 10) {
      return setError('Explain the request in at least ten characters.');
    }
    const payload = { justification: justification.trim() };
    if (mode === 'existing') {
      if (!theaterId) return setError('Pick a theater.');
      payload.theaterId = theaterId;
    } else {
      const missing = Object.entries(proposed).filter(([, value]) => !value.trim());
      if (missing.length) return setError('Fill in every field of the proposed theater.');
      if (!/^\d{4,10}$/.test(proposed.pincode.trim())) return setError('Enter a valid pincode.');
      payload.proposedTheater = Object.fromEntries(
        Object.entries(proposed).map(([key, value]) => [key, value.trim()]),
      );
    }

    setBusy(true);
    try {
      await submitTheaterRequest(payload);
      toast.success('Request sent. A platform administrator will review it.');
      setJustification('');
      setTheaterId('');
      onDone();
    } catch (caught) {
      setError(caught?.message ?? 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      title="Request a venue"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-ink-800" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2" role="radiogroup" aria-label="Kind of request">
          {[
            { value: 'existing', label: 'A theater already listed' },
            { value: 'new', label: 'A new theater' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              onClick={() => setMode(option.value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                mode === option.value
                  ? 'border-brand bg-brand-soft font-medium text-ink-900'
                  : 'border-ink-200 text-ink-600 hover:border-ink-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <Select
            label="Theater"
            required
            value={theaterId}
            onChange={(event) => setTheaterId(event.target.value)}
            placeholder={theaters.loading ? 'Loading…' : 'Pick a theater'}
            options={(theaters.data?.items ?? []).map((theater) => ({
              value: theater.id,
              label: `${theater.name} · ${theater.city}`,
            }))}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Name" required className="sm:col-span-2" value={proposed.name} onChange={setField('name')} />
            <TextField label="Address" required className="sm:col-span-2" value={proposed.addressLine1} onChange={setField('addressLine1')} />
            <TextField label="City" required value={proposed.city} onChange={setField('city')} />
            <TextField label="State" required value={proposed.state} onChange={setField('state')} />
            <TextField label="Pincode" required inputMode="numeric" value={proposed.pincode} onChange={setField('pincode')} />
          </div>
        )}

        <TextArea
          label="Why should you manage it?"
          required
          rows={4}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
          placeholder="We own and operate this venue; the lease is in our business name."
        />
      </div>
    </Dialog>
  );
}
