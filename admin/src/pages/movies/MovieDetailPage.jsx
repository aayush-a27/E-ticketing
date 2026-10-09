import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, ExternalLink, EyeOff, Pencil, Send } from 'lucide-react';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  archiveMovie,
  attachMovieMedia,
  fetchMovie,
  publishMovie,
  removeMovieMedia,
  unpublishMovie,
} from '../../services/catalogService.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Card,
  CardHeader,
  DetailList,
  DetailRow,
  PageHeader,
} from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { ConfirmDialog } from '../../components/ui/Dialog.jsx';
import { ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { ImageUpload } from '../../components/media/ImageUpload.jsx';
import { count, dateOnly, dateTime, pluralize } from '../../utils/format.js';

/**
 * One film: its details, its images, and the three status changes.
 *
 * Status is not a field on this page. Each change is its own endpoint with its
 * own rules — publishing needs a poster, unpublishing affects shows already
 * scheduled — and the console surfaces those rules rather than working around
 * them.
 */
export default function MovieDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: movie, error, loading, refetch, setData } = useResource(
    useCallback(({ signal }) => fetchMovie(id, { signal }), [id]),
    [id],
  );

  const [pending, setPending] = useState(null);
  const [working, setWorking] = useState(false);

  if (loading) return <LoadingBlock label="Loading film" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!movie) return null;

  const run = async (action, successMessage) => {
    setWorking(true);
    try {
      const result = await action();
      // Unpublish returns the affected show count alongside the film.
      setData(result.movie ?? result);
      toast.success(successMessage(result));
      setPending(null);
    } catch (caught) {
      toast.fromError(caught);
    } finally {
      setWorking(false);
    }
  };

  const onAttach = async (kind, publicId) => {
    const updated = await attachMovieMedia(movie._id, { kind, publicId });
    setData(updated);
  };

  const onRemoveMedia = async (kind) => {
    const updated = await removeMovieMedia(movie._id, kind);
    setData(updated);
  };

  const isPublished = movie.status === 'published';
  const isArchived = movie.status === 'archived';

  return (
    <>
      <PageHeader
        title={movie.title}
        description={movie.tagline || undefined}
        actions={
          <>
            <Button as={Link} to="/movies" variant="secondary">
              <ArrowLeft className="size-4" aria-hidden="true" />
              All movies
            </Button>
            {!isArchived && (
              <Button as={Link} to={`/movies/${movie._id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden="true" />
                Edit
              </Button>
            )}
            {!isPublished && !isArchived && (
              <Button variant="brand" onClick={() => setPending('publish')}>
                <Send className="size-4" aria-hidden="true" />
                Publish
              </Button>
            )}
            {isPublished && (
              <Button variant="secondary" onClick={() => setPending('unpublish')}>
                <EyeOff className="size-4" aria-hidden="true" />
                Unpublish
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={movie.status} />
          {movie.isFeatured && <Badge tone="brand">Featured</Badge>}
          <Badge>{movie.certification}</Badge>
          {!movie.poster?.url && (
            <Badge tone="warn">No poster — cannot be published</Badge>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.618fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Images"
              description="Uploaded straight to storage; the file never passes through the API."
            />
            <div className="space-y-5 p-5">
              <ImageUpload
                label="Poster"
                purpose="movie_poster"
                resourceId={movie._id}
                current={movie.poster}
                aspect="aspect-[2/3]"
                hint="Portrait, 2:3. Required before the film can be published."
                onUploaded={(publicId) => onAttach('poster', publicId)}
                onRemove={isPublished ? undefined : () => onRemoveMedia('poster')}
                disabled={isArchived}
                disabledReason={isArchived ? 'This film is archived.' : undefined}
              />
              {isPublished && movie.poster?.url && (
                <p className="-mt-3 text-xs text-ink-500">
                  Unpublish the film to remove its poster. Replacing it is allowed.
                </p>
              )}

              <ImageUpload
                label="Backdrop"
                purpose="movie_backdrop"
                resourceId={movie._id}
                current={movie.backdrop}
                aspect="aspect-video"
                hint="Landscape, 16:9. Optional, used behind the film's page."
                onUploaded={(publicId) => onAttach('backdrop', publicId)}
                onRemove={() => onRemoveMedia('backdrop')}
                disabled={isArchived}
              />
            </div>
          </Card>

          {!isArchived && (
            <Card>
              <CardHeader title="Archive" />
              <div className="p-5">
                <p className="text-sm text-ink-600">
                  Archiving takes the film out of the catalogue for good. Past bookings and
                  tickets keep their own copy of its details and are unaffected.
                </p>
                <Button
                  variant="danger-quiet"
                  size="sm"
                  className="mt-3.5"
                  onClick={() => setPending('archive')}
                >
                  <Archive className="size-3.5" aria-hidden="true" />
                  Archive this film
                </Button>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Synopsis" />
            <div className="p-5">
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">
                {movie.synopsis}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <div className="p-5">
              <DetailList>
                <DetailRow label="Slug">
                  <code className="font-mono text-xs">{movie.slug}</code>
                </DetailRow>
                <DetailRow label="Released">{dateOnly(movie.releaseDate)}</DetailRow>
                <DetailRow label="Runtime">
                  {movie.runtimeMinutes ? `${count(movie.runtimeMinutes)} minutes` : null}
                </DetailRow>
                <DetailRow label="Languages">{movie.languages?.join(', ') || null}</DetailRow>
                <DetailRow label="Subtitles">{movie.subtitles?.join(', ') || null}</DetailRow>
                <DetailRow label="Genres">{movie.genres?.join(', ') || null}</DetailRow>
                <DetailRow label="Director">{movie.director || null}</DetailRow>
                <DetailRow label="Trailer">
                  {movie.trailerUrl ? (
                    <a
                      href={movie.trailerUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-brand-strong hover:underline"
                    >
                      Watch
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </DetailRow>
                <DetailRow label="Created">{dateTime(movie.createdAt)}</DetailRow>
                {movie.publishedAt && (
                  <DetailRow label="Published">{dateTime(movie.publishedAt)}</DetailRow>
                )}
              </DetailList>
            </div>
          </Card>

          {movie.cast?.length > 0 && (
            <Card>
              <CardHeader title={`Cast · ${count(movie.cast.length)}`} />
              <ul className="divide-y divide-ink-100">
                {movie.cast.map((member, index) => (
                  <li
                    key={`${member.name}-${index}`}
                    className="flex items-baseline justify-between gap-4 px-5 py-2.5"
                  >
                    <span className="text-sm text-ink-900">{member.name}</span>
                    {member.character && (
                      <span className="text-xs text-ink-500">{member.character}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pending === 'publish'}
        onClose={() => setPending(null)}
        onConfirm={() =>
          run(() => publishMovie(movie._id), () => `"${movie.title}" is now published.`)
        }
        loading={working}
        variant="brand"
        title="Publish this film?"
        description="It becomes visible on the customer site and available for show runners to schedule. The server refuses if there is no poster."
        confirmLabel="Publish"
      />

      <ConfirmDialog
        open={pending === 'unpublish'}
        onClose={() => setPending(null)}
        onConfirm={() =>
          run(
            () => unpublishMovie(movie._id),
            (result) =>
              result.affectedShows
                ? `Unpublished. ${pluralize(result.affectedShows, 'scheduled show')} affected.`
                : 'Unpublished.',
          )
        }
        loading={working}
        title="Take this film off the catalogue?"
        description="Customers will no longer see it and no new shows can be scheduled against it. Shows already scheduled are reported back to you so you can deal with them."
        confirmLabel="Unpublish"
      />

      <ConfirmDialog
        open={pending === 'archive'}
        onClose={() => setPending(null)}
        onConfirm={() =>
          run(
            async () => {
              const archived = await archiveMovie(movie._id);
              navigate('/movies');
              return archived;
            },
            () => `"${movie.title}" archived.`,
          )
        }
        loading={working}
        title="Archive this film?"
        description="This cannot be undone through the console. Past bookings keep their own copy of the film's details and are unaffected."
        confirmLabel="Archive"
      />
    </>
  );
}
