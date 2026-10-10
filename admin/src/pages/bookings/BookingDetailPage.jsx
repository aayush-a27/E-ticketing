import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { fetchBooking } from '../../services/operationsService.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Card,
  CardHeader,
  DetailList,
  DetailRow,
  PageHeader,
} from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { Table, TBody, TD, TH, THead, TR } from '../../components/ui/Table.jsx';
import { basisPoints, dateTime, humanize, money } from '../../utils/format.js';

/**
 * One booking, as the record shows it.
 *
 * Nothing here can be changed. The price breakdown is the snapshot stored when
 * the seats were held — a later change to fees or tax never alters it — and
 * the payment state is whatever the gateway's verified signature established.
 * A booking that looks wrong is investigated here and corrected through the
 * payment and cancellation pipelines, never by editing a status.
 *
 * A show runner opening a booking from another venue gets "not found": the
 * server does not confirm that a reference exists at someone else's theater.
 */
export default function BookingDetailPage() {
  const { bookingId } = useParams();
  const { namespace } = useAuth();

  const { data, error, loading, refetch } = useResource(
    useCallback(
      ({ signal }) => fetchBooking(namespace, bookingId, { signal }),
      [namespace, bookingId],
    ),
    [namespace, bookingId],
  );

  if (loading) return <LoadingBlock label="Loading booking" />;
  if (error) {
    return (
      <>
        <PageHeader
          title="Booking"
          actions={
            <Button as={Link} to="/bookings" variant="secondary">
              <ArrowLeft className="size-4" aria-hidden="true" />
              All bookings
            </Button>
          }
        />
        <ErrorState error={error} onRetry={refetch} />
      </>
    );
  }
  if (!data) return null;

  const { booking, payments, refunds, cancellations } = data;
  const pricing = booking.pricing ?? {};

  return (
    <>
      <PageHeader
        title={booking.reference}
        description={`${booking.movie.title} · ${booking.theater.name} · ${dateTime(
          booking.showtime.startAt,
        )}`}
        actions={
          <Button as={Link} to="/bookings" variant="secondary">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All bookings
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} />
          <StatusBadge status={booking.paymentStatus} dot={false} />
          {booking.admittedAt && <Badge tone="good">Admitted {dateTime(booking.admittedAt)}</Badge>}
          <Badge>
            <Lock className="size-3" aria-hidden="true" />
            Read-only
          </Badge>
        </div>
      </PageHeader>

      {booking.unfulfillableReason && (
        <div
          className="mb-5 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3.5 py-3"
          role="alert"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
          <p className="text-sm text-ink-800">
            <span className="font-medium">Paid, but the seats could not be given.</span>{' '}
            {booking.unfulfillableReason}. The refund is tracked below.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.618fr_1fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title="Seats" description={`Seat layout version ${booking.layoutVersion}`} />
            <Table>
              <THead>
                <TH>Seat</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH align="right">Base price</TH>
              </THead>
              <TBody>
                {booking.seats.map((seat) => (
                  <TR key={seat.seatId}>
                    <TD className="font-medium">{seat.label}</TD>
                    <TD className="text-ink-600">{seat.category}</TD>
                    <TD>
                      {seat.cancelledAt ? (
                        <Badge>Cancelled {dateTime(seat.cancelledAt)}</Badge>
                      ) : (
                        <Badge tone="good">Active</Badge>
                      )}
                    </TD>
                    <TD align="right">{money(seat.pricePaise)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader
              title="Price breakdown"
              description="As quoted when the seats were held. Later fee or tax changes never alter it."
            />
            <div className="p-5">
              <DetailList>
                <DetailRow label="Tickets">{money(pricing.subtotalPaise)}</DetailRow>
                {pricing.discountPaise > 0 && (
                  <DetailRow label={`Discount${pricing.couponCode ? ` (${pricing.couponCode})` : ''}`}>
                    −{money(pricing.discountPaise)}
                  </DetailRow>
                )}
                <DetailRow label="Convenience fee">
                  {money(pricing.convenienceFeePaise)}
                  {pricing.feeBreakdown && (
                    <span className="ml-1.5 text-xs text-ink-500">
                      ({money(pricing.feeBreakdown.percentFeePaise)} percentage +{' '}
                      {money(pricing.feeBreakdown.flatFeePaise)} per-ticket
                      {pricing.feeBreakdown.capApplied ? ', capped' : ''})
                    </span>
                  )}
                </DetailRow>
                {(pricing.taxes ?? []).map((tax) => (
                  <DetailRow key={tax.name} label={`${tax.name} · ${basisPoints(tax.rateBasisPoints)}`}>
                    {money(tax.amountPaise)}
                  </DetailRow>
                ))}
                <div className="!mt-3 border-t border-ink-200 pt-3">
                  <DetailRow label="Total charged">
                    <span className="text-base font-semibold">{money(booking.amountPaise)}</span>
                  </DetailRow>
                </div>
              </DetailList>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              title="Payment attempts"
              description="Every attempt is kept. Only a captured attempt with a verified signature means money was taken."
            />
            {payments.length === 0 ? (
              <EmptyState title="No payment attempted" description="The customer has not started paying." />
            ) : (
              <Table>
                <THead>
                  <TH>Started</TH>
                  <TH>Status</TH>
                  <TH>Verified</TH>
                  <TH>Gateway reference</TH>
                  <TH align="right">Amount</TH>
                </THead>
                <TBody>
                  {payments.map((payment) => (
                    <TR key={payment.id}>
                      <TD className="text-sm text-ink-600">{dateTime(payment.createdAt)}</TD>
                      <TD>
                        <StatusBadge status={payment.status} />
                        {payment.failureReason && (
                          <span className="mt-1 block max-w-[14rem] text-[11px] text-bad">
                            {payment.failureReason}
                          </span>
                        )}
                      </TD>
                      <TD className="text-sm">
                        {payment.signatureVerified ? (
                          <span className="text-good">
                            Yes{payment.confirmedVia ? `, via ${payment.confirmedVia}` : ''}
                          </span>
                        ) : (
                          <span className="text-ink-500">No</span>
                        )}
                      </TD>
                      <TD>
                        <span className="block font-mono text-[11px] text-ink-700">{payment.orderId}</span>
                        {payment.providerPaymentId && (
                          <span className="block font-mono text-[11px] text-ink-500">
                            {payment.providerPaymentId}
                          </span>
                        )}
                      </TD>
                      <TD align="right">{money(payment.amountPaise)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Customer" />
            <div className="p-5">
              <DetailList>
                <DetailRow label="Name">{booking.customer?.name}</DetailRow>
                <DetailRow label="Email">
                  {booking.customer?.email}
                  {booking.customer?.emailMasked && (
                    <span className="ml-1.5 text-xs text-ink-500">(partly hidden)</span>
                  )}
                </DetailRow>
                {!booking.customer?.emailMasked && (
                  <DetailRow label="Phone">{booking.customer?.phone}</DetailRow>
                )}
              </DetailList>
              {!booking.customer?.emailMasked && booking.customer?.id && (
                <Button
                  as={Link}
                  to={`/users/${booking.customer.id}`}
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                >
                  Open account
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Show" />
            <div className="p-5">
              <DetailList>
                <DetailRow label="Film">{booking.movie.title}</DetailRow>
                <DetailRow label="Venue">{booking.theater.name}</DetailRow>
                <DetailRow label="Screen">{booking.theater.screen}</DetailRow>
                <DetailRow label="City">{booking.theater.city}</DetailRow>
                <DetailRow label="Starts">{dateTime(booking.showtime.startAt)}</DetailRow>
                <DetailRow label="Format">
                  {[booking.showtime.format, booking.showtime.language].filter(Boolean).join(' · ')}
                </DetailRow>
              </DetailList>
              <Button
                as={Link}
                to={`/shows/${booking.showId}`}
                variant="secondary"
                size="sm"
                className="mt-4"
              >
                Open show
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <div className="p-5">
              <DetailList>
                <DetailRow label="Booked">{dateTime(booking.createdAt)}</DetailRow>
                <DetailRow label="Confirmed">{booking.confirmedAt ? dateTime(booking.confirmedAt) : null}</DetailRow>
                <DetailRow label="Admitted">{booking.admittedAt ? dateTime(booking.admittedAt) : null}</DetailRow>
                <DetailRow label="Cancelled">{booking.cancelledAt ? dateTime(booking.cancelledAt) : null}</DetailRow>
              </DetailList>
              {booking.cancellationReason && (
                <p className="mt-3 text-xs text-ink-600">Reason: {booking.cancellationReason}</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={`Cancellations · ${cancellations.length}`} />
            <div className="p-5">
              {cancellations.length === 0 ? (
                <p className="text-sm text-ink-500">None.</p>
              ) : (
                <ul className="space-y-3">
                  {cancellations.map((cancellation) => (
                    <li key={cancellation.id} className="rounded-lg border border-ink-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StatusBadge status={cancellation.status} />
                        <span className="text-xs text-ink-500">{dateTime(cancellation.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-sm text-ink-700">
                        {cancellation.isPartial
                          ? `Seats ${cancellation.seatIds.join(', ')}`
                          : 'Whole booking'}{' '}
                        · refundable {money(cancellation.refundablePaise)}
                      </p>
                      {cancellation.policyApplied?.label && (
                        <p className="mt-1 text-xs text-ink-500">
                          Rule: {cancellation.policyApplied.label}
                          {cancellation.policyApplied.withinGraceWindow ? ' (grace window)' : ''}
                        </p>
                      )}
                      {cancellation.reason && (
                        <p className="mt-1 text-xs text-ink-500">“{cancellation.reason}”</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={`Refunds · ${refunds.length}`} />
            <div className="p-5">
              {refunds.length === 0 ? (
                <p className="text-sm text-ink-500">None.</p>
              ) : (
                <ul className="space-y-3">
                  {refunds.map((refund) => (
                    <li key={refund.id} className="rounded-lg border border-ink-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-ink-900">{money(refund.amountPaise)}</span>
                        <StatusBadge status={refund.status} />
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {humanize(refund.reason)} · {dateTime(refund.createdAt)}
                        {refund.attempts > 1 ? ` · ${refund.attempts} attempts` : ''}
                      </p>
                      {refund.failureReason && (
                        <p className="mt-1 text-xs text-bad">{refund.failureReason}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
