import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import { createMovie, fetchMovie, updateMovie } from '../../services/catalogService.js';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader, PageHeader } from '../../components/ui/Layout.jsx';
import { Checkbox, Select, TextArea, TextField } from '../../components/ui/Field.jsx';
import { TagInput } from '../../components/ui/TagInput.jsx';
import { ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { toDateInput } from '../../utils/format.js';
import {
  CERTIFICATIONS,
  COMMON_GENRES,
  COMMON_LANGUAGES,
  toOptions,
} from '../../utils/constants.js';

/**
 * Creating and editing a film. One form for both, because the fields are the
 * same and keeping two in step is how they drift.
 *
 * `status` is deliberately absent. Publishing, unpublishing and archiving each
 * have their own endpoint and their own rules — a film cannot be published
 * without a poster, and unpublishing one affects scheduled shows — so a
 * dropdown here would either bypass those rules or lie about them.
 */
export default function MovieFormPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [submitError, setSubmitError] = useState(null);

  const { data: movie, error, loading } = useResource(
    useCallback(({ signal }) => (isEditing ? fetchMovie(id, { signal }) : null), [id, isEditing]),
    [id],
    { enabled: isEditing },
  );

  if (isEditing && loading) return <LoadingBlock label="Loading film" />;
  if (isEditing && error) return <ErrorState error={error} />;

  return (
    <MovieForm
      key={movie?._id ?? 'new'}
      movie={movie}
      isEditing={isEditing}
      navigate={navigate}
      toast={toast}
      submitError={submitError}
      setSubmitError={setSubmitError}
    />
  );
}

function MovieForm({ movie, isEditing, navigate, toast, submitError, setSubmitError }) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    defaultValues: {
      title: movie?.title ?? '',
      slug: movie?.slug ?? '',
      tagline: movie?.tagline ?? '',
      synopsis: movie?.synopsis ?? '',
      trailerUrl: movie?.trailerUrl ?? '',
      genres: movie?.genres ?? [],
      languages: movie?.languages ?? [],
      subtitles: movie?.subtitles ?? [],
      releaseDate: toDateInput(movie?.releaseDate) || '',
      runtimeMinutes: movie?.runtimeMinutes ?? '',
      certification: movie?.certification ?? 'UA',
      director: movie?.director ?? '',
      cast: movie?.cast?.length ? movie.cast : [],
      isFeatured: movie?.isFeatured ?? false,
    },
  });

  const cast = useFieldArray({ control, name: 'cast' });

  const onSubmit = async (values) => {
    setSubmitError(null);

    // Shape the payload to what the API's schema declares. Empty optional
    // strings are dropped rather than sent, because zod would reject "" where
    // it expects a URL.
    const payload = {
      title: values.title.trim(),
      synopsis: values.synopsis.trim(),
      genres: values.genres,
      languages: values.languages,
      subtitles: values.subtitles,
      releaseDate: values.releaseDate,
      runtimeMinutes: Number(values.runtimeMinutes),
      certification: values.certification,
      isFeatured: Boolean(values.isFeatured),
      cast: values.cast
        .filter((member) => member.name?.trim())
        .map((member, index) => ({
          name: member.name.trim(),
          ...(member.character?.trim() ? { character: member.character.trim() } : {}),
          order: index,
        })),
    };

    if (values.slug.trim()) payload.slug = values.slug.trim();
    if (values.tagline.trim()) payload.tagline = values.tagline.trim();
    if (values.trailerUrl.trim()) payload.trailerUrl = values.trailerUrl.trim();
    if (values.director.trim()) payload.director = values.director.trim();

    try {
      const saved = isEditing
        ? await updateMovie(movie._id, payload)
        : await createMovie(payload);

      toast.success(isEditing ? 'Film updated.' : `"${saved.title}" created.`);
      navigate(`/movies/${saved._id}`, { replace: true });
    } catch (caught) {
      // Field errors onto their fields; anything else to the top of the form.
      const fieldErrors = caught?.fieldErrors ?? {};
      let matched = false;
      for (const [field, message] of Object.entries(fieldErrors)) {
        const root = field.split('.')[0];
        setError(root, { type: 'server', message });
        matched = true;
      }
      if (!matched) setSubmitError(caught?.message ?? 'Could not save the film.');
      else setSubmitError('Some fields need correcting.');
    }
  };

  return (
    <>
      <PageHeader
        title={isEditing ? `Edit ${movie.title}` : 'Add a movie'}
        description={
          isEditing
            ? 'Changes do not alter any show already scheduled against this film.'
            : 'The film is created as a draft. Add a poster, then publish it to make it schedulable.'
        }
        actions={
          <Button
            as={Link}
            to={isEditing ? `/movies/${movie._id}` : '/movies'}
            variant="secondary"
          >
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
          <CardHeader title="The film" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextField
              label="Title"
              required
              className="sm:col-span-2"
              error={errors.title?.message}
              {...register('title', {
                required: 'Enter a title',
                maxLength: { value: 200, message: 'Keep the title under 200 characters' },
              })}
            />

            <TextField
              label="Slug"
              hint={
                isEditing
                  ? 'Changing this breaks existing links to the film.'
                  : 'Left empty, one is derived from the title.'
              }
              placeholder="the-long-afternoon"
              error={errors.slug?.message}
              {...register('slug', {
                pattern: {
                  value: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                  message: 'Lowercase words separated by hyphens',
                },
              })}
            />

            <TextField
              label="Tagline"
              placeholder="Some trains you are meant to miss."
              error={errors.tagline?.message}
              {...register('tagline', { maxLength: { value: 240, message: 'Too long' } })}
            />

            <TextArea
              label="Synopsis"
              required
              rows={5}
              className="sm:col-span-2"
              hint="At least 20 characters. This is what customers read on the film's page."
              error={errors.synopsis?.message}
              {...register('synopsis', {
                required: 'Write a synopsis',
                minLength: { value: 20, message: 'Write at least a couple of sentences' },
                maxLength: { value: 4000, message: 'Keep it under 4000 characters' },
              })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Details" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextField
              label="Release date"
              type="date"
              required
              error={errors.releaseDate?.message}
              {...register('releaseDate', { required: 'Pick a release date' })}
            />

            <TextField
              label="Runtime"
              type="number"
              required
              prefix=""
              hint="In minutes. Used to work out when a show ends."
              error={errors.runtimeMinutes?.message}
              {...register('runtimeMinutes', {
                required: 'Enter the runtime',
                min: { value: 1, message: 'Must be at least 1 minute' },
                max: { value: 600, message: 'That is over ten hours' },
              })}
            />

            <Select
              label="Certification"
              required
              options={toOptions(CERTIFICATIONS)}
              error={errors.certification?.message}
              {...register('certification', { required: 'Pick a rating' })}
            />

            <TextField label="Director" error={errors.director?.message} {...register('director')} />

            <Controller
              control={control}
              name="languages"
              rules={{
                validate: (value) => value.length > 0 || 'List at least one language',
              }}
              render={({ field, fieldState }) => (
                <TagInput
                  label="Languages"
                  required
                  max={15}
                  value={field.value}
                  onChange={field.onChange}
                  suggestions={COMMON_LANGUAGES}
                  hint="The languages this film is screened in."
                  error={fieldState.error?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="genres"
              render={({ field, fieldState }) => (
                <TagInput
                  label="Genres"
                  max={10}
                  value={field.value}
                  onChange={field.onChange}
                  suggestions={COMMON_GENRES}
                  error={fieldState.error?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="subtitles"
              render={({ field }) => (
                <TagInput
                  label="Subtitles"
                  max={15}
                  value={field.value}
                  onChange={field.onChange}
                  suggestions={COMMON_LANGUAGES}
                  hint="Optional."
                />
              )}
            />

            <TextField
              label="Trailer URL"
              type="url"
              placeholder="https://www.youtube.com/watch?v=…"
              error={errors.trailerUrl?.message}
              {...register('trailerUrl', {
                pattern: { value: /^https?:\/\/.+/i, message: 'Enter a full URL' },
              })}
            />

            <div className="sm:col-span-2">
              <Checkbox
                label="Feature on the customer home page"
                hint="Featured films appear in the hero carousel once published."
                {...register('isFeatured')}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Cast"
            description="Optional, and shown in this order on the film's page."
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => cast.append({ name: '', character: '' })}
                disabled={cast.fields.length >= 60}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add
              </Button>
            }
          />
          <div className="p-5">
            {cast.fields.length === 0 ? (
              <p className="text-sm text-ink-500">No cast listed.</p>
            ) : (
              <ul className="space-y-2.5">
                {cast.fields.map((member, index) => (
                  <li key={member.id} className="flex items-end gap-2.5">
                    <TextField
                      label={index === 0 ? 'Name' : undefined}
                      className="flex-1"
                      placeholder="Meera Raghavan"
                      {...register(`cast.${index}.name`)}
                    />
                    <TextField
                      label={index === 0 ? 'Character' : undefined}
                      className="flex-1"
                      placeholder="The clerk"
                      {...register(`cast.${index}.character`)}
                    />
                    <IconButton
                      variant="danger-quiet"
                      icon={Trash2}
                      label={`Remove cast member ${index + 1}`}
                      onClick={() => cast.remove(index)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {errors.cast && (
              <p className="mt-2 text-xs text-bad">{errors.cast.message}</p>
            )}
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <Button
            as={Link}
            to={isEditing ? `/movies/${movie._id}` : '/movies'}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={isEditing && !isDirty}>
            {isEditing ? 'Save changes' : 'Create film'}
          </Button>
        </div>
      </form>
    </>
  );
}
