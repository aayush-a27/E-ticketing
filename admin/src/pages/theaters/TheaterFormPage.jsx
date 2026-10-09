import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import { createTheater, fetchTheater, updateTheater } from '../../services/venueService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader, PageHeader } from '../../components/ui/Layout.jsx';
import { Select, TextField } from '../../components/ui/Field.jsx';
import { TagInput } from '../../components/ui/TagInput.jsx';
import { ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { THEATER_STATUSES, toOptions } from '../../utils/constants.js';

const AMENITIES = [
  'Parking',
  'Cafe',
  'Wheelchair access',
  'Recliners',
  'Dolby Atmos',
  'Food court',
  'Air conditioning',
  'Online snacks',
];

/**
 * Creating and editing a venue.
 *
 * Creating is super-admin only: venues are assigned to show runners, never
 * self-served, so a runner who could create one could grant themselves a
 * venue. Editing is open to the assigned runner, and gate 4 resolves the
 * theater from the database before the handler runs.
 */
export default function TheaterFormPage() {
  const { theaterId } = useParams();
  const isEditing = Boolean(theaterId);
  const { namespace } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: theater, error, loading } = useResource(
    useCallback(
      ({ signal }) => (isEditing ? fetchTheater(namespace, theaterId, { signal }) : null),
      [namespace, theaterId, isEditing],
    ),
    [theaterId, namespace],
    { enabled: isEditing },
  );

  if (isEditing && loading) return <LoadingBlock label="Loading venue" />;
  if (isEditing && error) return <ErrorState error={error} />;

  return (
    <TheaterForm
      key={theater?._id ?? 'new'}
      theater={theater}
      isEditing={isEditing}
      namespace={namespace}
      navigate={navigate}
      toast={toast}
    />
  );
}

function TheaterForm({ theater, isEditing, namespace, navigate, toast }) {
  const [submitError, setSubmitError] = useState(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    defaultValues: {
      name: theater?.name ?? '',
      slug: theater?.slug ?? '',
      addressLine1: theater?.addressLine1 ?? '',
      addressLine2: theater?.addressLine2 ?? '',
      city: theater?.cityLabel ?? '',
      state: theater?.state ?? '',
      pincode: theater?.pincode ?? '',
      contactPhone: theater?.contactPhone ?? '',
      contactEmail: theater?.contactEmail ?? '',
      amenities: theater?.amenities ?? [],
      status: theater?.status ?? 'active',
      longitude: theater?.location?.coordinates?.[0] ?? '',
      latitude: theater?.location?.coordinates?.[1] ?? '',
    },
  });

  const onSubmit = async (values) => {
    setSubmitError(null);

    const payload = {
      name: values.name.trim(),
      addressLine1: values.addressLine1.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
      pincode: values.pincode.trim(),
      amenities: values.amenities,
    };

    if (values.slug.trim()) payload.slug = values.slug.trim();
    if (values.addressLine2.trim()) payload.addressLine2 = values.addressLine2.trim();
    if (values.contactPhone.trim()) payload.contactPhone = values.contactPhone.trim();
    if (values.contactEmail.trim()) payload.contactEmail = values.contactEmail.trim();

    /**
     * Coordinates go as a [longitude, latitude] tuple, in that order. Sent
     * only when both are present: a half-filled point is rejected by the
     * geospatial index, which is how this used to fail with a 500.
     */
    const longitude = values.longitude === '' ? null : Number(values.longitude);
    const latitude = values.latitude === '' ? null : Number(values.latitude);
    if (longitude !== null && latitude !== null) {
      payload.coordinates = [longitude, latitude];
    }

    if (isEditing) payload.status = values.status;

    try {
      const saved = isEditing
        ? await updateTheater(namespace, theater._id, payload)
        : await createTheater(payload);

      toast.success(isEditing ? 'Venue updated.' : `"${saved.name}" created.`);
      navigate(`/theaters/${saved._id}`, { replace: true });
    } catch (caught) {
      const fieldErrors = caught?.fieldErrors ?? {};
      let matched = false;
      for (const [field, message] of Object.entries(fieldErrors)) {
        const root = field.split('.')[0];
        // The API calls it `coordinates`; the form has two separate inputs.
        setError(root === 'coordinates' ? 'longitude' : root, { type: 'server', message });
        matched = true;
      }
      setSubmitError(
        matched ? 'Some fields need correcting.' : (caught?.message ?? 'Could not save the venue.'),
      );
    }
  };

  const backTo = isEditing ? `/theaters/${theater._id}` : '/theaters';

  return (
    <>
      <PageHeader
        title={isEditing ? `Edit ${theater.name}` : 'Add a theater'}
        description={
          isEditing
            ? 'Bookings already made keep their own copy of this venue’s name and address.'
            : 'Create the venue, then add screens and a seat layout before scheduling shows in it.'
        }
        actions={
          <Button as={Link} to={backTo} variant="secondary">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Cancel
          </Button>
        }
      />

      {submitError && (
        <div
          className="mb-5 rounded-lg border border-bad/25 bg-bad-soft px-3.5 py-3 text-sm text-ink-800"
          role="alert"
        >
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <Card>
          <CardHeader title="The venue" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextField
              label="Name"
              required
              className="sm:col-span-2"
              placeholder="Nova Cinemas Rajpur Road"
              error={errors.name?.message}
              {...register('name', {
                required: 'Enter the venue name',
                minLength: { value: 2, message: 'Too short' },
              })}
            />

            <TextField
              label="Slug"
              hint={isEditing ? 'Changing this breaks existing links.' : 'Derived if left empty.'}
              error={errors.slug?.message}
              {...register('slug', {
                pattern: {
                  value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                  message: 'Lowercase words separated by hyphens',
                },
              })}
            />

            {isEditing && (
              <Select
                label="Status"
                hint="An inactive venue is hidden from customers; its shows are not."
                options={toOptions(THEATER_STATUSES, { humanizeLabels: true })}
                error={errors.status?.message}
                {...register('status')}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Where it is" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextField
              label="Address line 1"
              required
              className="sm:col-span-2"
              error={errors.addressLine1?.message}
              {...register('addressLine1', {
                required: 'Enter the street address',
                minLength: { value: 4, message: 'Too short' },
              })}
            />
            <TextField
              label="Address line 2"
              className="sm:col-span-2"
              error={errors.addressLine2?.message}
              {...register('addressLine2')}
            />
            <TextField
              label="City"
              required
              hint="Customers browse by city, so spelling matters."
              error={errors.city?.message}
              {...register('city', { required: 'Enter the city' })}
            />
            <TextField
              label="State"
              required
              error={errors.state?.message}
              {...register('state', { required: 'Enter the state' })}
            />
            <TextField
              label="Pincode"
              required
              inputMode="numeric"
              error={errors.pincode?.message}
              {...register('pincode', {
                required: 'Enter the pincode',
                pattern: { value: /^\d{4,10}$/, message: 'Digits only, 4 to 10 of them' },
              })}
            />
            <div />
            <TextField
              label="Longitude"
              type="number"
              step="any"
              hint="Optional. Both coordinates are needed, or neither."
              error={errors.longitude?.message}
              {...register('longitude', {
                validate: (value, form) =>
                  (value === '' && form.latitude === '') ||
                  (value !== '' && form.latitude !== '') ||
                  'Give both coordinates or leave both empty',
                min: { value: -180, message: 'Between -180 and 180' },
                max: { value: 180, message: 'Between -180 and 180' },
              })}
            />
            <TextField
              label="Latitude"
              type="number"
              step="any"
              error={errors.latitude?.message}
              {...register('latitude', {
                min: { value: -90, message: 'Between -90 and 90' },
                max: { value: 90, message: 'Between -90 and 90' },
              })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact and amenities" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextField
              label="Phone"
              type="tel"
              error={errors.contactPhone?.message}
              {...register('contactPhone')}
            />
            <TextField
              label="Email"
              type="email"
              error={errors.contactEmail?.message}
              {...register('contactEmail', {
                pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email address' },
              })}
            />
            <Controller
              control={control}
              name="amenities"
              render={({ field, fieldState }) => (
                <TagInput
                  label="Amenities"
                  max={20}
                  className="sm:col-span-2"
                  value={field.value}
                  onChange={field.onChange}
                  suggestions={AMENITIES}
                  hint="Shown to customers on the venue's page."
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <Button as={Link} to={backTo} variant="secondary">
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={isEditing && !isDirty}>
            {isEditing ? 'Save changes' : 'Create venue'}
          </Button>
        </div>
      </form>
    </>
  );
}
