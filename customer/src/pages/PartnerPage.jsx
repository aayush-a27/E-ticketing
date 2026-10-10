import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Building2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useResource } from '../hooks/useResource.js';
import {
  fetchMyApplications,
  submitApplication,
  withdrawApplication,
} from '../services/partnerService.js';
import { Button } from '../components/common/Button.jsx';
import { TextField } from '../components/common/TextField.jsx';
import { ConfirmDialog } from '../components/common/Modal.jsx';
import { ErrorState, LoadingBlock } from '../components/common/States.jsx';
import { formatFullDateTime } from '../utils/format.js';

/**
 * Where the operations console lives, if this deployment says so. Left unset,
 * the page explains where to go instead of linking to a guessed address.
 */
const CONSOLE_URL = import.meta.env.VITE_CONSOLE_URL || '';

const BUSINESS_TYPES = [
  { value: 'single_screen', label: 'Single-screen cinema' },
  { value: 'multiplex', label: 'Multiplex' },
  { value: 'chain', label: 'Cinema chain' },
  { value: 'other', label: 'Something else' },
];

const STATUS_COPY = {
  pending: { Icon: Clock, tone: 'text-amber-bright', title: 'Under review' },
  approved: { Icon: CheckCircle2, tone: 'text-status-good', title: 'Approved' },
  rejected: { Icon: XCircle, tone: 'text-status-bad', title: 'Not approved' },
  withdrawn: { Icon: XCircle, tone: 'text-ivory-muted', title: 'Withdrawn' },
};

/**
 * Applying to run a venue on CineReserve.
 *
 * The application is only a request. A platform administrator reviews it, and
 * approval makes the account a show runner — with no venue yet. A theater is
 * assigned to them as a separate step. The page says both things, so nobody
 * expects to be running shows the moment they press Submit.
 */
export default function PartnerPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [withdrawing, setWithdrawing] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, error, loading, refetch } = useResource(
    useCallback(({ signal }) => fetchMyApplications({ signal }), []),
    [],
  );

  if (loading) return <LoadingBlock label="Loading" />;
  if (error) {
    return (
      <div className="page-shell max-w-3xl py-10">
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  const applications = data ?? [];
  const pending = applications.find((application) => application.status === 'pending');
  const approved = applications.find((application) => application.status === 'approved');
  const isRunner = user?.role === 'show_runner' || user?.role === 'super_admin';

  const onWithdraw = async () => {
    setBusy(true);
    try {
      await withdrawApplication(withdrawing);
      toast.success('Application withdrawn.');
      setWithdrawing(null);
      refetch();
    } catch (caught) {
      toast.error(caught?.message ?? 'Could not withdraw.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell max-w-3xl py-10">
      <Link
        to="/profile"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-ivory-muted transition hover:text-amber-bright"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to profile
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl text-ivory sm:text-3xl">Run your venue on CineReserve</h1>
        <p className="mt-2 max-w-xl text-ivory-muted">
          Cinema owners and operators can list their screens, schedule shows and sell tickets here.
          Every application is reviewed by our team.
        </p>
      </header>

      {isRunner || approved ? (
        <section className="card-surface p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-6 text-status-good" aria-hidden="true" />
            <h2 className="text-lg text-ivory">You are approved to run venues</h2>
          </div>
          <p className="mt-3 text-sm text-ivory-dim">
            Manage your theaters, screens and shows from the CineReserve operations console. If no
            theater has been assigned to you yet, you can request one there — approval and venue
            assignment are separate steps.
          </p>
          {approved && !isRunner && (
            <p className="mt-2 text-sm text-ivory-muted">
              Approval changed your account, so you will be asked to sign in again.
            </p>
          )}
          {CONSOLE_URL ? (
            <Button as="a" href={CONSOLE_URL} className="mt-5">
              Open the operations console
            </Button>
          ) : (
            <p className="mt-4 text-sm text-ivory-muted">
              Sign in to the operations console with this same email and password.
            </p>
          )}
        </section>
      ) : pending ? (
        <section className="card-surface p-6" aria-live="polite">
          <ApplicationSummary application={pending} />
          <p className="mt-4 text-sm text-ivory-dim">
            We will email you when it has been reviewed. You can only have one application waiting
            at a time.
          </p>
          <Button variant="ghost" className="mt-4" onClick={() => setWithdrawing(pending._id)}>
            Withdraw application
          </Button>
        </section>
      ) : (
        <ApplicationForm
          user={user}
          onSubmitted={() => {
            toast.success('Application sent. We will be in touch.');
            refetch();
          }}
        />
      )}

      {applications.filter((application) => application.status !== 'pending').length > 0 &&
        !approved && (
          <section className="mt-8" aria-labelledby="history-heading">
            <h2 id="history-heading" className="mb-3 text-sm uppercase tracking-wider text-ivory-muted">
              Earlier applications
            </h2>
            <ul className="space-y-3">
              {applications
                .filter((application) => application.status !== 'pending')
                .map((application) => (
                  <li key={application._id} className="card-surface p-5">
                    <ApplicationSummary application={application} compact />
                  </li>
                ))}
            </ul>
          </section>
        )}

      <ConfirmDialog
        open={Boolean(withdrawing)}
        onClose={() => setWithdrawing(null)}
        onConfirm={onWithdraw}
        loading={busy}
        variant="danger"
        title="Withdraw your application?"
        description="It will no longer be reviewed. You can apply again afterwards."
        confirmLabel="Withdraw"
      />
    </div>
  );
}

function ApplicationSummary({ application, compact = false }) {
  const copy = STATUS_COPY[application.status] ?? STATUS_COPY.pending;
  const { Icon } = copy;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Icon className={`size-5 ${copy.tone}`} aria-hidden="true" />
        <p className={`font-medium ${copy.tone}`}>{copy.title}</p>
        <span className="text-xs text-ivory-muted">
          Sent {formatFullDateTime(application.submittedAt ?? application.createdAt)}
        </span>
      </div>
      <p className={`${compact ? 'mt-1.5' : 'mt-3'} text-ivory`}>{application.businessName}</p>
      <p className="text-sm text-ivory-muted">
        {application.proposedTheater?.name} · {application.proposedTheater?.city}
      </p>
      {application.rejectionReason && (
        <p className="mt-3 rounded-lg bg-charcoal-soft px-3 py-2 text-sm text-ivory-dim">
          {application.rejectionReason}
        </p>
      )}
    </div>
  );
}

function NativeSelect({ label, error, options, ...props }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ivory-dim">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? 'true' : undefined}
        className="neu-inset w-full rounded-xl px-4 py-3 text-ivory transition focus:border-amber-brand"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-xs text-status-bad">{error}</p>}
    </div>
  );
}

function ApplicationForm({ user, onSubmitted }) {
  const [formError, setFormError] = useState(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      contactName: user?.name ?? '',
      contactEmail: user?.email ?? '',
      contactPhone: user?.phone ?? '',
      businessName: '',
      businessType: 'single_screen',
      cities: '',
      website: '',
      notes: '',
      proposedTheater: {
        name: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        pincode: '',
        screenCount: '',
      },
    },
  });

  const onSubmit = async (values) => {
    setFormError(null);
    const theater = values.proposedTheater;
    const payload = {
      contactName: values.contactName.trim(),
      contactEmail: values.contactEmail.trim(),
      contactPhone: values.contactPhone.trim(),
      businessName: values.businessName.trim(),
      businessType: values.businessType,
      cities: values.cities
        .split(',')
        .map((city) => city.trim())
        .filter(Boolean),
      proposedTheater: {
        name: theater.name.trim(),
        addressLine1: theater.addressLine1.trim(),
        city: theater.city.trim(),
        state: theater.state.trim(),
        pincode: theater.pincode.trim(),
        ...(theater.addressLine2.trim() ? { addressLine2: theater.addressLine2.trim() } : {}),
        ...(theater.screenCount ? { screenCount: Number(theater.screenCount) } : {}),
      },
      ...(values.website.trim() ? { website: values.website.trim() } : {}),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    };

    try {
      await submitApplication(payload);
      onSubmitted();
    } catch (caught) {
      const fieldErrors = caught?.fieldErrors ?? {};
      const fields = Object.entries(fieldErrors);
      for (const [field, message] of fields) setError(field, { type: 'server', message });
      setFormError(
        caught?.code === 'DUPLICATE_APPLICATION'
          ? 'You already have an application waiting for review.'
          : fields.length
            ? 'Some details need correcting.'
            : (caught?.message ?? 'Could not send your application.'),
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {formError && (
        <p className="rounded-xl border border-status-bad/40 bg-status-bad/10 px-4 py-3 text-sm text-ivory" role="alert">
          {formError}
        </p>
      )}

      <section className="card-surface space-y-5 p-6" aria-labelledby="you-heading">
        <h2 id="you-heading" className="text-lg text-ivory">About you</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Contact name"
            error={errors.contactName?.message}
            {...register('contactName', { required: 'Enter a contact name', minLength: { value: 2, message: 'Too short' } })}
          />
          <TextField
            label="Contact phone"
            type="tel"
            error={errors.contactPhone?.message}
            {...register('contactPhone', {
              required: 'Enter a phone number',
              pattern: { value: /^[+]?[\d\s-]{7,20}$/, message: 'Enter a valid phone number' },
            })}
          />
          <TextField
            label="Contact email"
            type="email"
            className="sm:col-span-2"
            error={errors.contactEmail?.message}
            {...register('contactEmail', {
              required: 'Enter an email address',
              pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email address' },
            })}
          />
        </div>
      </section>

      <section className="card-surface space-y-5 p-6" aria-labelledby="business-heading">
        <h2 id="business-heading" className="text-lg text-ivory">Your business</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Business name"
            error={errors.businessName?.message}
            {...register('businessName', { required: 'Enter the business name', minLength: { value: 2, message: 'Too short' } })}
          />
          <NativeSelect
            label="Kind of business"
            options={BUSINESS_TYPES}
            error={errors.businessType?.message}
            {...register('businessType')}
          />
          <TextField
            label="Cities you operate in"
            hint="Separate several with commas."
            error={errors.cities?.message}
            {...register('cities', {
              validate: (value) =>
                value.split(',').map((city) => city.trim()).filter(Boolean).length > 0 ||
                'Name at least one city',
            })}
          />
          <TextField
            label="Website"
            type="url"
            hint="Optional."
            placeholder="https://"
            error={errors.website?.message}
            {...register('website', {
              pattern: { value: /^$|^https?:\/\/.+/i, message: 'Enter a full address, starting https://' },
            })}
          />
        </div>
      </section>

      <section className="card-surface space-y-5 p-6" aria-labelledby="venue-heading">
        <div>
          <h2 id="venue-heading" className="flex items-center gap-2 text-lg text-ivory">
            <Building2 className="size-5 text-amber-brand" aria-hidden="true" />
            The venue you want to run
          </h2>
          <p className="mt-1 text-sm text-ivory-muted">
            This helps us review you. It is not created or assigned to you automatically.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Venue name"
            className="sm:col-span-2"
            error={errors.proposedTheater?.name?.message}
            {...register('proposedTheater.name', { required: 'Enter the venue name' })}
          />
          <TextField
            label="Address"
            className="sm:col-span-2"
            error={errors.proposedTheater?.addressLine1?.message}
            {...register('proposedTheater.addressLine1', {
              required: 'Enter the street address',
              minLength: { value: 4, message: 'Too short' },
            })}
          />
          <TextField label="Address line 2" className="sm:col-span-2" {...register('proposedTheater.addressLine2')} />
          <TextField
            label="City"
            error={errors.proposedTheater?.city?.message}
            {...register('proposedTheater.city', { required: 'Enter the city' })}
          />
          <TextField
            label="State"
            error={errors.proposedTheater?.state?.message}
            {...register('proposedTheater.state', { required: 'Enter the state' })}
          />
          <TextField
            label="Pincode"
            inputMode="numeric"
            error={errors.proposedTheater?.pincode?.message}
            {...register('proposedTheater.pincode', {
              required: 'Enter the pincode',
              pattern: { value: /^\d{4,10}$/, message: 'Digits only' },
            })}
          />
          <TextField
            label="Number of screens"
            type="number"
            hint="Optional."
            error={errors.proposedTheater?.screenCount?.message}
            {...register('proposedTheater.screenCount', {
              validate: (value) =>
                value === '' || (Number(value) >= 1 && Number(value) <= 50) || 'Between 1 and 50',
            })}
          />
        </div>
      </section>

      <section className="card-surface space-y-3 p-6">
        <label htmlFor="partner-notes" className="block text-sm font-medium text-ivory-dim">
          Anything else we should know? <span className="text-ivory-muted">(optional)</span>
        </label>
        <textarea
          id="partner-notes"
          rows={4}
          className="neu-inset w-full rounded-xl px-4 py-3 text-ivory placeholder:text-ivory-muted/60 transition focus:border-amber-brand"
          {...register('notes', { maxLength: { value: 2000, message: 'Keep it under 2000 characters' } })}
        />
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" loading={isSubmitting} size="lg">
          Send application
        </Button>
        <p className="text-xs text-ivory-muted">Reviewed by the CineReserve team.</p>
      </div>
    </form>
  );
}
