import { Fragment, useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { fetchAuditLogs } from '../../services/platformService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import {
  Table,
  TableMessage,
  TableSkeleton,
  TBody,
  TD,
  TH,
  THead,
} from '../../components/ui/Table.jsx';
import { dateTime, humanize } from '../../utils/format.js';

const DEFAULTS = { action: '', resourceType: '', actorId: '', resourceId: '', page: 1 };
const COLUMNS = 5;

/** The actions the backend records, grouped as an administrator thinks of them. */
const ACTION_GROUPS = [
  ['Accounts', ['user.registered', 'user.logged_in', 'user.password_changed', 'user.password_reset', 'user.status_changed', 'user.role_changed']],
  ['Applications', ['organizer_application.submitted', 'organizer_application.withdrawn', 'organizer_application.approved', 'organizer_application.rejected']],
  ['Show runners', ['show_runner.suspended', 'show_runner.reinstated', 'show_runner.revoked']],
  ['Catalogue', ['movie.created', 'movie.updated', 'movie.published', 'movie.unpublished', 'movie.archived', 'media.uploaded', 'media.deleted']],
  ['Venues', ['theater.created', 'theater.updated', 'theater.manager_assigned', 'theater.manager_removed', 'theater_request.submitted', 'theater_request.approved', 'theater_request.rejected', 'screen.created', 'screen.updated', 'seat_layout.created', 'seat_layout.activated']],
  ['Shows', ['show.created', 'show.updated', 'show.published', 'show.cancelled', 'show_seat.blocked', 'show_seat.unblocked']],
  ['Bookings and money', ['booking.created', 'booking.confirmed', 'booking.unfulfillable', 'payment.initiated', 'payment.verified', 'payment.failed', 'cancellation.requested', 'cancellation.completed', 'refund.initiated', 'refund.completed', 'refund.failed', 'ticket.admitted']],
  ['Platform', ['platform_settings.updated']],
  ['System', ['booking.expired', 'seat_hold.created', 'seat_hold.expired', 'seat_hold.released', 'show_seat.inventory_generated', 'webhook.received']],
];

const RESOURCE_TYPES = [
  'User',
  'OrganizerApplication',
  'ShowRunnerProfile',
  'Movie',
  'Theater',
  'TheaterRequest',
  'Screen',
  'SeatLayout',
  'Show',
  'Booking',
  'Payment',
  'Refund',
  'PlatformSettings',
];

function tone(action) {
  if (/rejected|revoked|suspended|cancelled|failed|removed|deleted|archived|unpublished/.test(action)) return 'bad';
  if (/approved|published|confirmed|completed|reinstated|admitted|assigned/.test(action)) return 'good';
  if (/settings|role_changed|status_changed/.test(action)) return 'warn';
  return 'neutral';
}

/**
 * What changed, who changed it, and when. Super admin only.
 *
 * Entries are written by the server in the same transaction as the change for
 * approvals and role changes, so this log cannot disagree with what happened.
 * It is read-only; nothing in the console can edit or remove an entry.
 */
export default function AuditLogPage() {
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);
  const [open, setOpen] = useState(null);

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchAuditLogs(filters, { signal }), [filters]),
    [filters],
  );

  const entries = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every privileged change, newest first. Read-only."
      />

      {(filters.actorId || filters.resourceId) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-600">
          {filters.actorId && <Badge tone="info">One person</Badge>}
          {filters.resourceId && <Badge tone="info">One record</Badge>}
          <Button variant="ghost" size="xs" onClick={() => setFilters({ actorId: '', resourceId: '' })}>
            Show everything
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <div className="min-w-[14rem]">
            <label className="mb-1.5 block text-xs font-medium text-ink-600" htmlFor="filter-action">
              Action
            </label>
            <select
              id="filter-action"
              value={filters.action}
              onChange={(event) => setFilters({ action: event.target.value })}
              className="h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 pr-7 text-sm text-ink-900 transition-colors hover:border-ink-300 focus:border-brand"
            >
              <option value="">All actions</option>
              {ACTION_GROUPS.map(([group, actions]) => (
                <optgroup key={group} label={group}>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <FilterSelect
            label="Record type"
            value={filters.resourceType}
            onChange={(value) => setFilters({ resourceType: value })}
            options={RESOURCE_TYPES.map((type) => ({ value: type, label: type }))}
          />
        </FilterBar>

        <Table>
          <THead>
            <TH className="w-8">
              <span className="sr-only">Expand</span>
            </TH>
            <TH>When</TH>
            <TH>Action</TH>
            <TH>Who</TH>
            <TH>Record</TH>
          </THead>

          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={10} />
          ) : error ? (
            <TableMessage columns={COLUMNS}>
              <ErrorState error={error} onRetry={refetch} />
            </TableMessage>
          ) : entries.length === 0 ? (
            <TableMessage columns={COLUMNS}>
              <EmptyState icon={ScrollText} title="Nothing recorded matches" />
            </TableMessage>
          ) : (
            <TBody>
              {entries.map((entry) => {
                const expanded = open === entry._id;
                const actor = entry.actorId;
                return (
                  <Fragment key={entry._id}>
                    <tr className="transition-colors hover:bg-ink-50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setOpen(expanded ? null : entry._id)}
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Hide details' : 'Show details'}
                          className="rounded p-0.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                        >
                          {expanded ? (
                            <ChevronDown className="size-4" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="size-4" aria-hidden="true" />
                          )}
                        </button>
                      </td>
                      <TD className="whitespace-nowrap text-sm text-ink-600">{dateTime(entry.createdAt)}</TD>
                      <TD>
                        <Badge tone={tone(entry.action)}>{entry.action}</Badge>
                        {entry.reason && (
                          <p className="mt-1 max-w-[18rem] truncate text-[11px] text-ink-500" title={entry.reason}>
                            {entry.reason}
                          </p>
                        )}
                      </TD>
                      <TD>
                        {actor ? (
                          <button
                            type="button"
                            onClick={() => setFilters({ actorId: actor._id })}
                            className="text-left hover:underline"
                            title="Show only this person's actions"
                          >
                            <span className="block text-sm text-ink-900">{actor.name}</span>
                            <span className="block text-[11px] text-ink-500">
                              {actor.email} · {humanize(entry.actorRole ?? actor.role)}
                            </span>
                          </button>
                        ) : (
                          <span className="text-sm text-ink-500">System</span>
                        )}
                      </TD>
                      <TD>
                        <span className="block text-sm text-ink-800">{entry.resourceType}</span>
                        {entry.resourceId && (
                          <button
                            type="button"
                            onClick={() => setFilters({ resourceId: entry.resourceId })}
                            className="font-mono text-[11px] text-ink-500 hover:underline"
                            title="Show this record's whole history"
                          >
                            {entry.resourceId}
                          </button>
                        )}
                      </TD>
                    </tr>
                    {expanded && (
                      <tr className="bg-ink-50/70">
                        <td colSpan={COLUMNS} className="px-4 py-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <Snapshot label="Before" value={entry.before} />
                            <Snapshot label="After" value={entry.after} />
                          </div>
                          <p className="mt-3 text-[11px] text-ink-500">
                            {entry.ip ? `From ${entry.ip}` : 'No address recorded'}
                            {entry.requestId ? ` · request ${entry.requestId}` : ''}
                          </p>
                          {entry.userAgent && (
                            <p className="mt-0.5 truncate text-[11px] text-ink-400" title={entry.userAgent}>
                              {entry.userAgent}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          )}
        </Table>

        {!loading && !error && entries.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>
    </>
  );
}

function Snapshot({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      {value === undefined || value === null ? (
        <p className="text-sm text-ink-400">—</p>
      ) : (
        <pre className="scroll-quiet max-h-64 overflow-auto rounded-lg border border-ink-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-ink-800">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
