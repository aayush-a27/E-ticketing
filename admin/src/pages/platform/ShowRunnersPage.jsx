import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MoreHorizontal, Plus, Users, X } from 'lucide-react';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  fetchShowRunners,
  updateShowRunnerStatus,
} from '../../services/platformService.js';
import { assignManager, fetchTheaters, removeManager } from '../../services/venueService.js';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog.jsx';
import { Select, TextArea } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { FilterBar, FilterSelect, SearchField } from '../../components/ui/FilterBar.jsx';
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
import { dateOnly, humanize } from '../../utils/format.js';

const DEFAULTS = { search: '', status: '', assigned: '', page: 1 };
const COLUMNS = 5;

/** What each status change means, said before it is made. */
const STATUS_ACTIONS = {
  suspended: {
    label: 'Suspend',
    title: 'Suspend this show runner?',
    explain:
      'They keep the role but every operational request is refused, and their current sessions end now. Their venue assignments are kept, so reinstating them restores everything. Shows already scheduled keep running and selling.',
    variant: 'danger',
  },
  revoked: {
    label: 'Revoke',
    title: 'Revoke show-runner access?',
    explain:
      'Their account goes back to being an ordinary customer and their sessions end now. To run a venue again they would need a new application. Shows already scheduled keep running.',
    variant: 'danger',
  },
  active: {
    label: 'Reinstate',
    title: 'Reinstate this show runner?',
    explain: 'They regain access to the venues still assigned to them on their next sign-in.',
    variant: 'brand',
  },
};

/**
 * Show runners and the venues they hold.
 *
 * Approval and assignment are separate grants, so they are shown side by side:
 * a runner with no theater can sign in and do nothing. "Waiting for a venue"
 * is the filter that finds them.
 */
export default function ShowRunnersPage() {
  const toast = useToast();
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchShowRunners(filters, { signal }), [filters]),
    [filters],
  );

  const [statusChange, setStatusChange] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [unassigning, setUnassigning] = useState(null);

  const runners = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Show runners"
        description="Approved operators, their status, and the theaters they may manage."
        actions={
          <Button as={Link} to="/applications" variant="secondary">
            Applications
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <SearchField
            value={filters.search}
            onCommit={(value) => setFilters({ search: value })}
            placeholder="Business name"
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilters({ status: value })}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'revoked', label: 'Revoked' },
            ]}
          />
          <FilterSelect
            label="Venues"
            value={filters.assigned}
            onChange={(value) => setFilters({ assigned: value })}
            options={[
              { value: 'false', label: 'Waiting for a venue' },
              { value: 'true', label: 'Has a venue' },
            ]}
          />
        </FilterBar>

        <Table>
          <THead>
            <TH>Business</TH>
            <TH>Account</TH>
            <TH>Status</TH>
            <TH>Theaters</TH>
            <TH align="right">
              <span className="sr-only">Actions</span>
            </TH>
          </THead>

          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={6} />
          ) : error ? (
            <TableMessage columns={COLUMNS}>
              <ErrorState error={error} onRetry={refetch} />
            </TableMessage>
          ) : runners.length === 0 ? (
            <TableMessage columns={COLUMNS}>
              <EmptyState
                icon={Users}
                title={activeCount > 0 ? 'No show runners match' : 'No show runners yet'}
                description="People become show runners when you approve their application."
              />
            </TableMessage>
          ) : (
            <TBody>
              {runners.map((runner) => {
                const account = runner.userId ?? {};
                return (
                  <TR key={runner._id}>
                    <TD>
                      <p className="font-medium text-ink-900">{runner.businessName}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        Approved {runner.approvedAt ? dateOnly(runner.approvedAt) : '—'}
                        {runner.operatingCities?.length ? ` · ${runner.operatingCities.join(', ')}` : ''}
                      </p>
                    </TD>
                    <TD>
                      <p className="text-sm">{account.name}</p>
                      <p className="mt-0.5 text-xs text-ink-500">{account.email}</p>
                      {account.accountStatus && account.accountStatus !== 'active' && (
                        <Badge tone="bad" className="mt-1">
                          Account {account.accountStatus}
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <StatusBadge status={runner.status} />
                      {runner.statusReason && runner.status !== 'active' && (
                        <p className="mt-1 max-w-[12rem] text-[11px] text-ink-500">{runner.statusReason}</p>
                      )}
                    </TD>
                    <TD>
                      {runner.needsTheaterAssignment ? (
                        <Badge tone="warn">Waiting for a venue</Badge>
                      ) : (
                        <ul className="space-y-1">
                          {runner.assignedTheaters.map((theater) => (
                            <li key={theater.id} className="flex items-center gap-1.5">
                              <Link
                                to={`/theaters/${theater.id}`}
                                className="truncate text-sm text-ink-800 hover:text-brand-strong hover:underline"
                              >
                                {theater.name}
                              </Link>
                              <span className="text-xs text-ink-500">{theater.city}</span>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                icon={X}
                                label={`Remove ${theater.name} from ${runner.businessName}`}
                                onClick={() => setUnassigning({ runner, theater })}
                              />
                            </li>
                          ))}
                        </ul>
                      )}
                    </TD>
                    <TD align="right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {runner.status === 'active' && (
                          <Button variant="secondary" size="sm" onClick={() => setAssigning(runner)}>
                            <Plus className="size-3.5" aria-hidden="true" />
                            Assign theater
                          </Button>
                        )}
                        <RunnerMenu
                          runner={runner}
                          onChoose={(status) => setStatusChange({ runner, status })}
                        />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          )}
        </Table>

        {!loading && !error && runners.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>

      <StatusDialog
        change={statusChange}
        onClose={() => setStatusChange(null)}
        toast={toast}
        onDone={() => {
          setStatusChange(null);
          refetch();
        }}
      />

      <AssignDialog
        runner={assigning}
        onClose={() => setAssigning(null)}
        toast={toast}
        onDone={() => {
          setAssigning(null);
          refetch();
        }}
      />

      <ConfirmDialog
        open={Boolean(unassigning)}
        onClose={() => setUnassigning(null)}
        onConfirm={async () => {
          try {
            await removeManager(unassigning.theater.id, unassigning.runner.userId?._id);
            toast.success(`${unassigning.theater.name} removed from ${unassigning.runner.businessName}.`);
            setUnassigning(null);
            refetch();
          } catch (caught) {
            toast.fromError(caught);
          }
        }}
        title="Remove this theater?"
        description={
          unassigning
            ? `${unassigning.runner.businessName} loses access to ${unassigning.theater.name} immediately. Shows already scheduled there keep running.`
            : ''
        }
        confirmLabel="Remove"
      />
    </>
  );
}

/** The two or three status changes that make sense from where a runner is now. */
function RunnerMenu({ runner, onChoose }) {
  const [open, setOpen] = useState(false);
  const choices = Object.keys(STATUS_ACTIONS).filter((status) => status !== runner.status);
  // A revoked runner is a customer again; reinstating needs a new application.
  const available = runner.status === 'revoked' ? [] : choices;

  if (available.length === 0) return null;

  return (
    <div className="relative">
      <IconButton
        variant="secondary"
        size="sm"
        icon={MoreHorizontal}
        label={`More actions for ${runner.businessName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-lg border border-ink-200 bg-white text-left shadow-overlay"
          >
            {available.map((status) => (
              <button
                key={status}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onChoose(status);
                }}
                className={`block w-full px-3.5 py-2 text-left text-sm transition-colors hover:bg-ink-50 ${
                  status === 'active' ? 'text-ink-800' : 'text-bad'
                }`}
              >
                {STATUS_ACTIONS[status].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusDialog({ change, onClose, toast, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!change) return null;
  const action = STATUS_ACTIONS[change.status];

  const submit = async () => {
    setError(null);
    if (reason.trim().length < 5) return setError('Record why, in at least five characters.');
    setBusy(true);
    try {
      await updateShowRunnerStatus(change.runner.userId?._id, {
        status: change.status,
        reason: reason.trim(),
      });
      toast.success(`${change.runner.businessName}: ${humanize(change.status).toLowerCase()}.`);
      setReason('');
      onDone();
    } catch (caught) {
      setError(caught?.message ?? 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      title={action.title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={action.variant} onClick={submit} loading={busy}>
            {action.label}
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
        <p className="text-sm text-ink-700">
          <span className="font-medium text-ink-900">{change.runner.businessName}.</span> {action.explain}
        </p>
        <TextArea
          label="Reason"
          required
          rows={3}
          hint="Recorded in the audit log, and shown to them."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </Dialog>
  );
}

/**
 * Picks a theater from the platform's list instead of pasting an id. The
 * server still validates everything: the runner must be active, and a theater
 * they already manage is refused.
 */
function AssignDialog({ runner, onClose, toast, onDone }) {
  const [theaterId, setTheaterId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { data: theaterData, loading } = useResource(
    useCallback(
      ({ signal }) => (runner ? fetchTheaters('/admin', { limit: 100 }, { signal }) : null),
      [runner],
    ),
    [runner],
    { enabled: Boolean(runner) },
  );

  if (!runner) return null;

  const held = new Set(runner.assignedTheaters.map((theater) => theater.id));
  const options = (theaterData?.items ?? []).map((theater) => ({
    value: theater._id,
    label: `${theater.name} · ${theater.cityLabel}${theater.status !== 'active' ? ` (${theater.status})` : ''}${held.has(theater._id) ? ' — already theirs' : ''}`,
    disabled: held.has(theater._id),
  }));

  const submit = async () => {
    setError(null);
    if (!theaterId) return setError('Pick a theater.');
    if (reason.trim().length < 5) return setError('Record why, in at least five characters.');
    setBusy(true);
    try {
      await assignManager(theaterId, { userId: runner.userId?._id, reason: reason.trim() });
      toast.success(`Theater assigned to ${runner.businessName}.`);
      setTheaterId('');
      setReason('');
      onDone();
    } catch (caught) {
      setError(caught?.message ?? 'Could not assign that theater.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={busy ? undefined : onClose}
      title={`Assign a theater to ${runner.businessName}`}
      description="They will be able to manage this theater's screens, layouts and shows — nothing else."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            <Building2 className="size-4" aria-hidden="true" />
            Assign
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
        <Select
          label="Theater"
          required
          value={theaterId}
          onChange={(event) => setTheaterId(event.target.value)}
          placeholder={loading ? 'Loading theaters…' : 'Pick a theater'}
          options={options}
          hint={
            !loading && options.length === 0
              ? 'There are no theaters yet. Create one under Theaters first.'
              : undefined
          }
        />
        <TextArea
          label="Reason"
          required
          rows={2}
          hint="Recorded in the audit log."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Approved operator for this venue"
        />
      </div>
    </Dialog>
  );
}
