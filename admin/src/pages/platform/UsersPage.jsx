import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useResource } from '../../hooks/useResource.js';
import { useFilters } from '../../hooks/useFilters.js';
import { fetchUsers } from '../../services/platformService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, PageHeader, Pagination } from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
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

const DEFAULTS = { search: '', role: '', accountStatus: '', page: 1 };
const COLUMNS = 5;

const ROLE_TONES = { super_admin: 'brand', show_runner: 'info', customer: 'neutral' };

/**
 * Every account. Super admin only.
 *
 * Roles are not editable here and never will be: a customer becomes a show
 * runner only through an approved application, and a super admin only through
 * the bootstrap script on the server. What an administrator can do from here
 * is suspend or reactivate an account.
 */
export default function UsersPage() {
  const navigate = useNavigate();
  const { filters, setFilters, clear, activeCount } = useFilters(DEFAULTS);

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchUsers(filters, { signal }), [filters]),
    [filters],
  );

  const users = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Customers, show runners and administrators. Roles change only through applications, never from here."
      />

      <Card className="overflow-hidden">
        <FilterBar activeCount={activeCount} onClear={clear}>
          <SearchField
            value={filters.search}
            onCommit={(value) => setFilters({ search: value })}
            placeholder="Name or email"
          />
          <FilterSelect
            label="Role"
            value={filters.role}
            onChange={(value) => setFilters({ role: value })}
            options={[
              { value: 'customer', label: 'Customer' },
              { value: 'show_runner', label: 'Show runner' },
              { value: 'super_admin', label: 'Super admin' },
            ]}
          />
          <FilterSelect
            label="Status"
            value={filters.accountStatus}
            onChange={(value) => setFilters({ accountStatus: value })}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'deactivated', label: 'Deactivated' },
            ]}
          />
        </FilterBar>

        <Table>
          <THead>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Status</TH>
            <TH>Joined</TH>
          </THead>

          {loading ? (
            <TableSkeleton columns={COLUMNS} rows={8} />
          ) : error ? (
            <TableMessage columns={COLUMNS}>
              <ErrorState error={error} onRetry={refetch} />
            </TableMessage>
          ) : users.length === 0 ? (
            <TableMessage columns={COLUMNS}>
              <EmptyState
                icon={Users}
                title="No accounts match"
                action={
                  activeCount > 0 && (
                    <Button variant="secondary" size="sm" onClick={clear}>
                      Clear filters
                    </Button>
                  )
                }
              />
            </TableMessage>
          ) : (
            <TBody>
              {users.map((user) => (
                <TR key={user.id} onClick={() => navigate(`/users/${user.id}`)}>
                  <TD className="font-medium text-ink-900">{user.name}</TD>
                  <TD className="text-sm text-ink-600">{user.email}</TD>
                  <TD>
                    <Badge tone={ROLE_TONES[user.role] ?? 'neutral'}>{humanize(user.role)}</Badge>
                  </TD>
                  <TD>
                    <StatusBadge status={user.accountStatus} />
                  </TD>
                  <TD className="text-sm text-ink-600">{dateOnly(user.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          )}
        </Table>

        {!loading && !error && users.length > 0 && (
          <Pagination
            pagination={data.pagination}
            onPageChange={(page) => setFilters({ page }, { resetPage: false })}
          />
        )}
      </Card>
    </>
  );
}
