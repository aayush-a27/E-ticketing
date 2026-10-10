import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { fetchApplications } from '../../services/platformService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
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
import { dateTime, humanize, relative } from '../../utils/format.js';

// Pending first: that is the queue someone opens this page to work through.
const DEFAULTS = { status: 'pending', search: '', page: 1 };
const COLUMNS = 5;

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'all', label: 'All' },
];

/** People asking to run venues on the platform. Super admin only. */
export default function ApplicationsPage() {
  const navigate = useNavigate();
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);

  const query = { ...filters, status: filters.status === 'all' ? '' : filters.status };

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchApplications(query, { signal }), [filters]),
    [filters],
  );

  const applications = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Show-runner applications"
        description="Approving makes someone a show runner. It gives them no venue — assigning a theater is a separate step."
      />

      <Card className="overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <SearchField
            value={filters.search}
            onCommit={(value) => setFilters({ search: value })}
            placeholder="Business or contact name"
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilters({ status: value || 'pending' })}
            options={STATUSES}
            placeholder="Pending"
          />
        </FilterBar>

        <Table>
          <THead>
            <TH>Business</TH>
            <TH>Applicant</TH>
            <TH>Proposed venue</TH>
            <TH>Status</TH>
            <TH>Submitted</TH>
          </THead>

          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={6} />
          ) : error ? (
            <TableMessage columns={COLUMNS}>
              <ErrorState error={error} onRetry={refetch} />
            </TableMessage>
          ) : applications.length === 0 ? (
            <TableMessage columns={COLUMNS}>
              <EmptyState
                icon={ClipboardList}
                title={
                  filters.status === 'pending' && !filters.search
                    ? 'Nothing waiting for review'
                    : 'No applications match'
                }
                description="Customers apply from their profile on the customer site."
                action={
                  activeCount > 0 && (
                    <Button variant="secondary" size="sm" onClick={() => setFilters({ status: 'all', search: '' })}>
                      Show all applications
                    </Button>
                  )
                }
              />
            </TableMessage>
          ) : (
            <TBody>
              {applications.map((application) => (
                <TR key={application._id} onClick={() => navigate(`/applications/${application._id}`)}>
                  <TD>
                    <p className="font-medium text-ink-900">{application.businessName}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{humanize(application.businessType)}</p>
                  </TD>
                  <TD>
                    <p className="text-sm">{application.contactName}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{application.applicantId?.email}</p>
                  </TD>
                  <TD className="text-sm text-ink-600">
                    {application.proposedTheater?.name}
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {application.proposedTheater?.city}
                    </span>
                  </TD>
                  <TD>
                    <StatusBadge status={application.status} />
                  </TD>
                  <TD className="text-sm text-ink-600">
                    {relative(application.submittedAt)}
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {dateTime(application.submittedAt)}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          )}
        </Table>

        {!loading && !error && applications.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>
    </>
  );
}
