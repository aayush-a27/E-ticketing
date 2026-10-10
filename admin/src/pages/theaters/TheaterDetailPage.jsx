import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ImageOff,
  MapPin,
  MonitorPlay,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  assignManager,
  attachTheaterImage,
  createScreen,
  fetchScreens,
  fetchTheater,
  removeManager,
  removeTheaterImage,
} from '../../services/venueService.js';
import {
  isSimulatedMediaProvider,
  requestUploadTicket,
  uploadToProvider,
  validateImageFile,
} from '../../services/catalogService.js';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import {
  Card,
  CardHeader,
  DetailList,
  DetailRow,
  PageHeader,
} from '../../components/ui/Layout.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog.jsx';
import { Checkbox, Select, TextField } from '../../components/ui/Field.jsx';
import { fetchShowRunners } from '../../services/platformService.js';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { count, dateTime, pluralize } from '../../utils/format.js';
import { SCREEN_FORMATS } from '../../utils/constants.js';

/**
 * One venue: its details, its photographs, its screens, and — for a platform
 * administrator — who manages it.
 *
 * Reachable by a show runner only for a theater assigned to them. The id in
 * the URL is checked against the database before any handler runs, so editing
 * it produces a refusal rather than another operator's venue.
 */
export default function TheaterDetailPage() {
  const { theaterId } = useParams();
  const { namespace, isSuperAdmin } = useAuth();
  const toast = useToast();

  const theaterResource = useResource(
    useCallback(
      ({ signal }) => fetchTheater(namespace, theaterId, { signal }),
      [namespace, theaterId],
    ),
    [namespace, theaterId],
  );

  const screensResource = useResource(
    useCallback(
      ({ signal }) => fetchScreens(namespace, theaterId, { signal }),
      [namespace, theaterId],
    ),
    [namespace, theaterId],
  );

  const theater = theaterResource.data;

  if (theaterResource.loading) return <LoadingBlock label="Loading venue" />;
  if (theaterResource.error) {
    return <ErrorState error={theaterResource.error} onRetry={theaterResource.refetch} />;
  }
  if (!theater) return null;

  return (
    <>
      <PageHeader
        title={theater.name}
        description={[theater.addressLine1, theater.addressLine2, theater.cityLabel]
          .filter(Boolean)
          .join(', ')}
        actions={
          <>
            <Button as={Link} to="/theaters" variant="secondary">
              <ArrowLeft className="size-4" aria-hidden="true" />
              All theaters
            </Button>
            <Button as={Link} to={`/theaters/${theater._id}/edit`} variant="secondary">
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={theater.status} />
          <Badge>
            <MapPin className="size-3" aria-hidden="true" />
            {theater.cityLabel}, {theater.state}
          </Badge>
          {theater.location?.coordinates ? (
            <Badge tone="info">Mapped</Badge>
          ) : (
            <Badge tone="neutral">No coordinates</Badge>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1.618fr_1fr]">
        <div className="space-y-5">
          <ScreensCard
            theater={theater}
            namespace={namespace}
            resource={screensResource}
            toast={toast}
          />
          <ImagesCard
            theater={theater}
            namespace={namespace}
            toast={toast}
            onChange={theaterResource.setData}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <div className="p-5">
              <DetailList>
                <DetailRow label="Slug">
                  <code className="font-mono text-xs">{theater.slug}</code>
                </DetailRow>
                <DetailRow label="Address">
                  {[theater.addressLine1, theater.addressLine2].filter(Boolean).join(', ')}
                </DetailRow>
                <DetailRow label="City">{theater.cityLabel}</DetailRow>
                <DetailRow label="State">{theater.state}</DetailRow>
                <DetailRow label="Pincode">{theater.pincode}</DetailRow>
                <DetailRow label="Phone">{theater.contactPhone || null}</DetailRow>
                <DetailRow label="Email">{theater.contactEmail || null}</DetailRow>
                <DetailRow label="Coordinates">
                  {theater.location?.coordinates
                    ? `${theater.location.coordinates[1]}, ${theater.location.coordinates[0]}`
                    : null}
                </DetailRow>
                <DetailRow label="Created">{dateTime(theater.createdAt)}</DetailRow>
              </DetailList>
            </div>
          </Card>

          {theater.amenities?.length > 0 && (
            <Card>
              <CardHeader title="Amenities" />
              <div className="flex flex-wrap gap-1.5 p-5">
                {theater.amenities.map((amenity) => (
                  <Badge key={amenity}>{amenity}</Badge>
                ))}
              </div>
            </Card>
          )}

          {isSuperAdmin && (
            <ManagersCard theater={theater} toast={toast} onChange={theaterResource.setData} />
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function ScreensCard({ theater, namespace, resource, toast }) {
  const [adding, setAdding] = useState(false);

  const screens = resource.data ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={`Screens · ${count(screens.length)}`}
        description="A screen needs an active seat layout before shows can run in it."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add screen
          </Button>
        }
      />

      {resource.loading ? (
        <LoadingBlock label="Loading screens" />
      ) : resource.error ? (
        <div className="p-5">
          <ErrorState error={resource.error} onRetry={resource.refetch} />
        </div>
      ) : screens.length === 0 ? (
        <EmptyState
          icon={MonitorPlay}
          title="No screens yet"
          description="Add a screen, then build its seat layout."
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              Add the first screen
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-ink-100">
          {screens.map((screen) => (
            <li key={screen._id}>
              <Link
                to={`/theaters/${theater._id}/screens/${screen._id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-ink-50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink-100">
                  <MonitorPlay className="size-4 text-ink-600" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-900">{screen.name}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {screen.formats?.join(' · ')}
                    {screen.capacity ? ` · ${pluralize(screen.capacity, 'seat')}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {screen.activeLayoutVersion ? (
                    <Badge tone="good">Layout v{screen.activeLayoutVersion}</Badge>
                  ) : (
                    <Badge tone="warn">No layout</Badge>
                  )}
                  {!screen.isActive && <Badge tone="neutral">Inactive</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <AddScreenDialog
        open={adding}
        onClose={() => setAdding(false)}
        namespace={namespace}
        theaterId={theater._id}
        toast={toast}
        onCreated={() => {
          setAdding(false);
          resource.refetch();
        }}
      />
    </Card>
  );
}

function AddScreenDialog({ open, onClose, namespace, theaterId, toast, onCreated }) {
  const [name, setName] = useState('');
  const [formats, setFormats] = useState(['2D']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggleFormat = (format) =>
    setFormats((current) =>
      current.includes(format) ? current.filter((item) => item !== format) : [...current, format],
    );

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the screen a name.');
    if (formats.length === 0) return setError('Pick at least one format.');

    setBusy(true);
    try {
      await createScreen(namespace, theaterId, { name: name.trim(), formats });
      toast.success(`Screen "${name.trim()}" added.`);
      setName('');
      setFormats(['2D']);
      onCreated();
    } catch (caught) {
      setError(caught?.message ?? 'Could not add the screen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      title="Add a screen"
      description="You will build its seat layout next."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Add screen
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-ink-800">
            {error}
          </p>
        )}
        <TextField
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Audi 1"
        />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-700">Formats</legend>
          <div className="space-y-2">
            {SCREEN_FORMATS.map((format) => (
              <Checkbox
                key={format}
                label={format}
                checked={formats.includes(format)}
                onChange={() => toggleFormat(format)}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function ImagesCard({ theater, namespace, toast, onChange }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [unavailable, setUnavailable] = useState(null);
  const [removing, setRemoving] = useState(null);

  const onPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setUnavailable(null);
    setProgress(null);

    try {
      const ticket = await requestUploadTicket({
        purpose: 'theater_image',
        resourceId: theater._id,
      });

      const problem = validateImageFile(file, ticket.constraints);
      if (problem) return toast.error(problem);

      if (isSimulatedMediaProvider(ticket)) {
        setUnavailable(true);
        return;
      }

      setProgress(0);
      const stored = await uploadToProvider({
        upload: ticket.upload,
        file,
        onProgress: setProgress,
      });

      if (!stored.publicId) return toast.error('Storage returned no id for that file.');

      const updated = await attachTheaterImage(namespace, theater._id, {
        publicId: stored.publicId,
      });
      onChange(updated);
      toast.success('Photograph added.');
    } catch (caught) {
      toast.fromError(caught, 'Could not add that photograph.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const doRemove = async () => {
    try {
      const updated = await removeTheaterImage(namespace, theater._id, removing);
      onChange(updated);
      toast.success('Photograph removed.');
      setRemoving(null);
    } catch (caught) {
      toast.fromError(caught);
    }
  };

  return (
    <Card>
      <CardHeader
        title={`Photographs · ${count(theater.images?.length ?? 0)}`}
        description="Up to 12. Shown to customers on the venue's page."
        actions={
          <label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={onPick}
              className="hidden"
              disabled={busy || (theater.images?.length ?? 0) >= 12}
            />
            <Button
              as="span"
              variant="secondary"
              size="sm"
              loading={busy}
              className="cursor-pointer"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {progress === null ? 'Add' : `${progress}%`}
            </Button>
          </label>
        }
      />

      <div className="p-5">
        {unavailable && (
          <div
            className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-xs text-ink-700"
            role="alert"
          >
            <p className="font-medium">Image storage is not configured</p>
            <p className="mt-0.5">
              The backend is running its in-memory media provider, which cannot accept an upload.
              Set <code className="font-mono">MEDIA_PROVIDER=cloudinary</code> with credentials to
              store photographs.
            </p>
          </div>
        )}

        {(theater.images?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-ink-400">
            <ImageOff className="size-5" aria-hidden="true" />
            <p className="text-sm">No photographs yet</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {theater.images.map((image) => (
              <li key={image.publicId} className="group relative">
                <div className="aspect-video overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                  <img
                    src={image.url}
                    alt={image.caption ?? ''}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </div>
                {image.caption && (
                  <p className="mt-1 truncate text-xs text-ink-500">{image.caption}</p>
                )}
                <IconButton
                  variant="danger"
                  size="xs"
                  icon={Trash2}
                  label="Remove this photograph"
                  onClick={() => setRemoving(image.publicId)}
                  className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={doRemove}
        title="Remove this photograph?"
        description="It will be deleted from storage as well. This cannot be undone."
        confirmLabel="Remove"
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * Who may operate this venue.
 *
 * Assignment is the second of the two grants a show runner needs — approval
 * alone gives them nothing. The picker offers active show runners only; the
 * server checks again, so a runner suspended a second ago is still refused.
 */
function ManagersCard({ theater, toast, onChange }) {
  const [assigning, setAssigning] = useState(false);
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  // Every runner, so a manager who has since been suspended still has a name.
  const runners = useResource(
    useCallback(({ signal }) => fetchShowRunners({ limit: 100 }, { signal }), []),
    [],
  );

  const byUser = new Map(
    (runners.data?.items ?? []).map((runner) => [String(runner.userId?._id), runner]),
  );
  const managerIds = (theater.managers ?? []).map(String);

  const candidates = (runners.data?.items ?? []).filter(
    (runner) => runner.status === 'active' && !managerIds.includes(String(runner.userId?._id)),
  );

  const submit = async () => {
    setError(null);
    if (!userId) return setError('Pick a show runner.');
    if (reason.trim().length < 5) return setError('Record why, in at least five characters.');

    setBusy(true);
    try {
      const updated = await assignManager(theater._id, { userId, reason: reason.trim() });
      onChange(updated);
      toast.success('Venue assigned.');
      setUserId('');
      setReason('');
      setAssigning(false);
      runners.refetch();
    } catch (caught) {
      setError(caught?.message ?? 'Could not assign this venue.');
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async () => {
    try {
      const updated = await removeManager(theater._id, removingId);
      onChange(updated);
      toast.success('Assignment removed.');
      setRemovingId(null);
    } catch (caught) {
      toast.fromError(caught);
    }
  };

  const removing = removingId ? byUser.get(String(removingId)) : null;

  return (
    <Card>
      <CardHeader
        title={`Managers · ${count(managerIds.length)}`}
        description="Show runners who may operate this venue."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setAssigning(true)}>
            <UserPlus className="size-3.5" aria-hidden="true" />
            Assign
          </Button>
        }
      />
      <div className="p-5">
        {managerIds.length === 0 ? (
          <p className="text-sm text-ink-500">
            Nobody manages this venue yet, so no show runner can schedule in it.
          </p>
        ) : (
          <ul className="space-y-2">
            {managerIds.map((managerId) => {
              const runner = byUser.get(managerId);
              return (
                <li
                  key={managerId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-900">
                      {runner?.businessName ?? 'Unknown account'}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {runner?.userId?.email ?? managerId}
                      {runner && runner.status !== 'active' ? ` · ${runner.status}` : ''}
                    </p>
                  </div>
                  <IconButton
                    variant="danger-quiet"
                    size="xs"
                    icon={UserMinus}
                    label={`Remove ${runner?.businessName ?? 'this manager'}`}
                    onClick={() => setRemovingId(managerId)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={assigning}
        onClose={busy ? undefined : () => setAssigning(false)}
        title="Assign this venue"
        description="The show runner gains access to this theater only."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssigning(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Assign
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <p className="rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-ink-800">
              {error}
            </p>
          )}
          <Select
            label="Show runner"
            required
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder={runners.loading ? 'Loading…' : 'Pick a show runner'}
            options={candidates.map((runner) => ({
              value: String(runner.userId?._id),
              label: `${runner.businessName} · ${runner.userId?.email ?? ''}`,
            }))}
            hint={
              !runners.loading && candidates.length === 0
                ? 'No active show runner is available. Approve an application first.'
                : undefined
            }
          />
          <TextField
            label="Reason"
            required
            hint="Recorded in the audit log."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Approved operator for this venue"
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removingId)}
        onClose={() => setRemovingId(null)}
        onConfirm={doRemove}
        title="Remove this assignment?"
        description={`${removing?.businessName ?? 'They'} lose access to this venue immediately. Shows already scheduled are unaffected.`}
        confirmLabel="Remove"
      />
    </Card>
  );
}
