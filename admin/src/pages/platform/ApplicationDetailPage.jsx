import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ExternalLink, Info, X } from 'lucide-react';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  approveApplication,
  fetchApplication,
  rejectApplication,
} from '../../services/platformService.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Card,
  CardHeader,
  DetailList,
  DetailRow,
  PageHeader,
} from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { TextArea } from '../../components/ui/Field.jsx';
import { ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { dateTime, humanize } from '../../utils/format.js';

/**
 * Reviewing one application.
 *
 * Approving changes the applicant's role and ends their current sessions so
 * the new role takes effect. It does not give them a venue — after approving,
 * the next step is assigning a theater, and this page says so rather than
 * leaving the runner approved but unable to do anything.
 *
 * Both decisions are one-shot on the server: approving an application that
 * someone else has just rejected is refused, not applied twice.
 */
export default function ApplicationDetailPage() {
  const { id } = useParams();
  const toast = useToast();

  const { data: application, error, loading, refetch, setData } = useResource(
    useCallback(({ signal }) => fetchApplication(id, { signal }), [id]),
    [id],
  );

  const [deciding, setDeciding] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState(null);

  if (loading) return <LoadingBlock label="Loading application" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!application) return null;

  const isPending = application.status === 'pending';
  const applicant = application.applicantId;

  const decide = async () => {
    setDecisionError(null);
    if (deciding === 'reject' && rejectionReason.trim().length < 5) {
      setDecisionError('Give the applicant a reason, in at least five characters.');
      return;
    }

    setBusy(true);
    try {
      if (deciding === 'approve') {
        const result = await approveApplication(application._id, {
          reviewNotes: reviewNotes.trim(),
        });
        toast.success(`${application.businessName} is now a show runner. Assign them a theater next.`, {
          duration: 9000,
        });
        setData({ ...application, ...result.application, applicantId: applicant });
      } else {
        const rejected = await rejectApplication(application._id, {
          rejectionReason: rejectionReason.trim(),
          reviewNotes: reviewNotes.trim(),
        });
        toast.success('Application rejected. The applicant can see your reason.');
        setData({ ...application, ...rejected, applicantId: applicant });
      }
      setDeciding(null);
      // Re-read, so the page shows exactly what the server stored.
      refetch();
    } catch (caught) {
      // APPLICATION_NOT_PENDING: someone else decided first.
      setDecisionError(caught?.message ?? 'That did not work.');
      refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={application.businessName}
        description={`Applied ${dateTime(application.submittedAt)} by ${application.contactName}`}
        actions={
          <>
            <Button as={Link} to="/applications" variant="secondary">
              <ArrowLeft className="size-4" aria-hidden="true" />
              All applications
            </Button>
            {isPending && (
              <>
                <Button variant="danger-quiet" onClick={() => setDeciding('reject')}>
                  <X className="size-4" aria-hidden="true" />
                  Reject
                </Button>
                <Button variant="brand" onClick={() => setDeciding('approve')}>
                  <Check className="size-4" aria-hidden="true" />
                  Approve
                </Button>
              </>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={application.status} />
          <Badge>{humanize(application.businessType)}</Badge>
          {applicant?.accountStatus && applicant.accountStatus !== 'active' && (
            <Badge tone="bad">Account {applicant.accountStatus}</Badge>
          )}
        </div>
      </PageHeader>

      {application.status === 'approved' && applicant?._id && (
        <div className="mb-5 flex flex-wrap items-start gap-2 rounded-lg border border-info/30 bg-info-soft px-3.5 py-3">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm text-ink-800">
            Approved {application.reviewedAt ? dateTime(application.reviewedAt) : ''}. They can sign
            in to the console now, but they manage nothing until a theater is assigned to them.
          </p>
          <Button
            as={Link}
            to={`/show-runners?search=${encodeURIComponent(application.businessName)}`}
            variant="secondary"
            size="sm"
          >
            Assign a theater
          </Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="The business" />
          <div className="p-5">
            <DetailList>
              <DetailRow label="Name">{application.businessName}</DetailRow>
              <DetailRow label="Type">{humanize(application.businessType)}</DetailRow>
              <DetailRow label="Cities">{application.cities?.join(', ')}</DetailRow>
              <DetailRow label="Website">
                {application.website ? (
                  <a
                    href={application.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-brand-strong hover:underline"
                  >
                    {application.website.replace(/^https?:\/\//, '')}
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                ) : null}
              </DetailRow>
            </DetailList>
            {application.notes && (
              <div className="mt-4 rounded-lg bg-ink-50 px-3.5 py-3">
                <p className="text-xs uppercase tracking-wide text-ink-500">Their notes</p>
                <p className="mt-1 whitespace-pre-line text-sm text-ink-800">{application.notes}</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact" />
          <div className="p-5">
            <DetailList>
              <DetailRow label="Contact name">{application.contactName}</DetailRow>
              <DetailRow label="Contact email">{application.contactEmail}</DetailRow>
              <DetailRow label="Phone">{application.contactPhone}</DetailRow>
              <DetailRow label="Account">{applicant?.email}</DetailRow>
              <DetailRow label="Account role">{humanize(applicant?.role)}</DetailRow>
              <DetailRow label="Account since">{applicant?.createdAt ? dateTime(applicant.createdAt) : null}</DetailRow>
            </DetailList>
            {applicant?._id && (
              <Button as={Link} to={`/users/${applicant._id}`} variant="secondary" size="sm" className="mt-4">
                Open account
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Proposed venue"
            description="What they intend to run. Approval does not create or assign it."
          />
          <div className="p-5">
            <DetailList>
              <DetailRow label="Name">{application.proposedTheater?.name}</DetailRow>
              <DetailRow label="Address">
                {[application.proposedTheater?.addressLine1, application.proposedTheater?.addressLine2]
                  .filter(Boolean)
                  .join(', ')}
              </DetailRow>
              <DetailRow label="City">
                {application.proposedTheater?.city}, {application.proposedTheater?.state}
              </DetailRow>
              <DetailRow label="Pincode">{application.proposedTheater?.pincode}</DetailRow>
              <DetailRow label="Screens">{application.proposedTheater?.screenCount ?? null}</DetailRow>
            </DetailList>
          </div>
        </Card>

        <Card>
          <CardHeader title="Decision" />
          <div className="p-5">
            {isPending ? (
              <p className="text-sm text-ink-500">Not reviewed yet.</p>
            ) : (
              <DetailList>
                <DetailRow label="Status"><StatusBadge status={application.status} /></DetailRow>
                <DetailRow label="Reviewed by">{application.reviewedBy?.name ?? null}</DetailRow>
                <DetailRow label="Reviewed">{application.reviewedAt ? dateTime(application.reviewedAt) : null}</DetailRow>
                {application.withdrawnAt && (
                  <DetailRow label="Withdrawn">{dateTime(application.withdrawnAt)}</DetailRow>
                )}
              </DetailList>
            )}
            {application.rejectionReason && (
              <div className="mt-4 rounded-lg bg-bad-soft px-3.5 py-3">
                <p className="text-xs uppercase tracking-wide text-ink-500">Reason given to the applicant</p>
                <p className="mt-1 text-sm text-ink-800">{application.rejectionReason}</p>
              </div>
            )}
            {application.reviewNotes && (
              <div className="mt-3 rounded-lg bg-ink-50 px-3.5 py-3">
                <p className="text-xs uppercase tracking-wide text-ink-500">Internal notes</p>
                <p className="mt-1 text-sm text-ink-800">{application.reviewNotes}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Dialog
        open={Boolean(deciding)}
        onClose={busy ? undefined : () => setDeciding(null)}
        title={deciding === 'approve' ? `Approve ${application.businessName}?` : `Reject ${application.businessName}?`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeciding(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={deciding === 'approve' ? 'brand' : 'danger'} onClick={decide} loading={busy}>
              {deciding === 'approve' ? 'Approve' : 'Reject'}
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
          {deciding === 'approve' ? (
            <p className="text-sm text-ink-700">
              Their account becomes a show runner and their current sessions end, so they sign in again
              with the new role. They get <span className="font-medium">no venue</span> — you assign
              one separately.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-700">They can see the reason and apply again later.</p>
              <TextArea
                label="Reason for the applicant"
                required
                rows={3}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="We could not verify the venue address."
              />
            </>
          )}
          <TextArea
            label="Internal notes"
            hint="Optional. Not shown to the applicant."
            rows={2}
            value={reviewNotes}
            onChange={(event) => setReviewNotes(event.target.value)}
          />
        </div>
      </Dialog>
    </>
  );
}
