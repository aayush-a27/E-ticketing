import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, LayoutGrid, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import {
  activateLayout,
  createLayout,
  fetchLayout,
  fetchLayouts,
  fetchScreens,
  updateScreen,
} from '../../services/venueService.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Card,
  CardHeader,
  DetailList,
  DetailRow,
  PageHeader,
} from '../../components/ui/Layout.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog.jsx';
import { Checkbox, TextField } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { LayoutBuilder, LayoutPreview } from '../../components/layouts/LayoutBuilder.jsx';
import { count, dateTime, pluralize } from '../../utils/format.js';
import { SCREEN_FORMATS } from '../../utils/constants.js';

/**
 * One screen and its seat layouts.
 *
 * Layouts are versioned and never edited in place. A show pins the version it
 * was scheduled against, so its seat inventory and its sold tickets keep
 * meaning something after the room is rearranged. Building a new layout
 * creates a new version; switching which one is active is a separate, guarded
 * step the server refuses while upcoming shows still depend on the current one.
 */
export default function ScreenDetailPage() {
  const { theaterId, screenId } = useParams();
  const { namespace } = useAuth();
  const toast = useToast();

  const [building, setBuilding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [activating, setActivating] = useState(null);
  const [viewing, setViewing] = useState(null);

  /**
   * The screen comes from the theater's screen list: there is no endpoint that
   * returns one screen on its own, and inventing one would mean adding a
   * backend route for a page that already has the data it needs.
   */
  const screensResource = useResource(
    useCallback(
      ({ signal }) => fetchScreens(namespace, theaterId, { signal }),
      [namespace, theaterId],
    ),
    [namespace, theaterId],
  );

  const layoutsResource = useResource(
    useCallback(
      ({ signal }) => fetchLayouts(namespace, screenId, { signal }),
      [namespace, screenId],
    ),
    [namespace, screenId],
  );

  const screen = screensResource.data?.find((item) => item._id === screenId);

  if (screensResource.loading) return <LoadingBlock label="Loading screen" />;
  if (screensResource.error) {
    return <ErrorState error={screensResource.error} onRetry={screensResource.refetch} />;
  }
  if (!screen) {
    return (
      <>
        <PageHeader title="Screen not found" />
        <EmptyState
          icon={LayoutGrid}
          title="No such screen at this venue"
          description="It may have been removed, or the link may be wrong."
          action={
            <Button as={Link} to={`/theaters/${theaterId}`} size="sm">
              Back to the venue
            </Button>
          }
        />
      </>
    );
  }

  const layouts = layoutsResource.data ?? [];

  const onBuild = async (payload) => {
    setSubmitting(true);
    try {
      const layout = await createLayout(namespace, screenId, payload);
      toast.success(
        payload.activate
          ? `Version ${layout.version} saved and made active.`
          : `Version ${layout.version} saved. It is not active yet.`,
      );
      setBuilding(false);
      layoutsResource.refetch();
      screensResource.refetch();
    } catch (caught) {
      toast.fromError(caught, 'Could not save that layout.');
    } finally {
      setSubmitting(false);
    }
  };

  const onActivate = async () => {
    setSubmitting(true);
    try {
      await activateLayout(namespace, screenId, activating);
      toast.success(`Version ${activating} is now active.`);
      setActivating(null);
      layoutsResource.refetch();
      screensResource.refetch();
    } catch (caught) {
      // The usual refusal is LAYOUT_IN_USE, whose message names how many
      // upcoming shows still depend on the current version.
      toast.fromError(caught, 'Could not switch the active layout.');
    } finally {
      setSubmitting(false);
    }
  };

  if (building) {
    return (
      <>
        <PageHeader
          title={`New seat layout · ${screen.name}`}
          description={
            layouts.length > 0
              ? `This becomes version ${(layouts[0]?.version ?? 0) + 1}. Earlier versions are kept, because shows already scheduled depend on them.`
              : 'The first layout for this screen.'
          }
          actions={
            <Button variant="secondary" onClick={() => setBuilding(false)} disabled={submitting}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Cancel
            </Button>
          }
        />
        <LayoutBuilder
          screen={screen}
          onSubmit={onBuild}
          onCancel={() => setBuilding(false)}
          submitting={submitting}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={screen.name}
        description="Screen settings and seat layouts."
        actions={
          <>
            <Button as={Link} to={`/theaters/${theaterId}`} variant="secondary">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to venue
            </Button>
            <Button variant="secondary" onClick={() => setEditingSettings(true)}>
              Settings
            </Button>
            <Button variant="brand" onClick={() => setBuilding(true)}>
              <Plus className="size-4" aria-hidden="true" />
              New layout
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {screen.activeLayoutVersion ? (
            <Badge tone="good" dot>
              Active layout v{screen.activeLayoutVersion}
            </Badge>
          ) : (
            <Badge tone="warn" dot>
              No active layout — shows cannot run
            </Badge>
          )}
          {screen.isActive ? <Badge tone="good">In service</Badge> : <Badge>Out of service</Badge>}
          {screen.formats?.map((format) => (
            <Badge key={format} tone="info">
              {format}
            </Badge>
          ))}
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.618fr]">
        <Card>
          <CardHeader title="Screen" />
          <div className="p-5">
            <DetailList>
              <DetailRow label="Name">{screen.name}</DetailRow>
              <DetailRow label="Formats">{screen.formats?.join(', ')}</DetailRow>
              <DetailRow label="Capacity">
                {screen.capacity ? pluralize(screen.capacity, 'seat') : null}
              </DetailRow>
              <DetailRow label="Active layout">
                {screen.activeLayoutVersion ? `Version ${screen.activeLayoutVersion}` : null}
              </DetailRow>
              <DetailRow label="In service">{screen.isActive ? 'Yes' : 'No'}</DetailRow>
              <DetailRow label="Created">{dateTime(screen.createdAt)}</DetailRow>
            </DetailList>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title={`Seat layouts · ${count(layouts.length)}`}
            description="Newest first. Earlier versions stay so existing shows keep their seat map."
          />

          {layoutsResource.loading ? (
            <LoadingBlock label="Loading layouts" />
          ) : layoutsResource.error ? (
            <div className="p-5">
              <ErrorState error={layoutsResource.error} onRetry={layoutsResource.refetch} />
            </div>
          ) : layouts.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="No seat layout yet"
              description="A screen needs a layout before any show can be scheduled in it."
              action={
                <Button size="sm" onClick={() => setBuilding(true)}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  Build the first layout
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {layouts.map((layout) => {
                const isActive = layout.version === screen.activeLayoutVersion;
                return (
                  <li
                    key={layout._id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium text-ink-900">
                        Version {layout.version}
                        {isActive && (
                          <Badge tone="good" dot>
                            Active
                          </Badge>
                        )}
                        {layout.retiredAt && !isActive && <Badge>Retired</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {pluralize(layout.seatCount, 'seat')} · {pluralize(layout.rowCount, 'row')}{' '}
                        · {layout.categories?.map((category) => category.name).join(', ')}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        Created {dateTime(layout.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setViewing(layout.version)}
                      >
                        View
                      </Button>
                      {!isActive && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setActivating(layout.version)}
                        >
                          <Check className="size-3.5" aria-hidden="true" />
                          Activate
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <SettingsDialog
        open={editingSettings}
        onClose={() => setEditingSettings(false)}
        screen={screen}
        namespace={namespace}
        toast={toast}
        onSaved={() => {
          setEditingSettings(false);
          screensResource.refetch();
        }}
      />

      <LayoutViewDialog
        version={viewing}
        onClose={() => setViewing(null)}
        namespace={namespace}
        screenId={screenId}
      />

      <ConfirmDialog
        open={Boolean(activating)}
        onClose={() => setActivating(null)}
        onConfirm={onActivate}
        loading={submitting}
        variant="brand"
        title={`Make version ${activating} active?`}
        description="New shows will use this seat map. Shows already scheduled keep the version they were created with, and the server refuses this change while upcoming published shows still use the current one."
        confirmLabel="Activate"
      />
    </>
  );
}

function SettingsDialog({ open, onClose, screen, namespace, toast, onSaved }) {
  const [name, setName] = useState(screen.name);
  const [formats, setFormats] = useState(screen.formats ?? ['2D']);
  const [isActive, setIsActive] = useState(screen.isActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the screen a name.');
    if (formats.length === 0) return setError('Pick at least one format.');

    setBusy(true);
    try {
      await updateScreen(namespace, screen._id, { name: name.trim(), formats, isActive });
      toast.success('Screen updated.');
      onSaved();
    } catch (caught) {
      setError(caught?.message ?? 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      title="Screen settings"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Save
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
        />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-700">Formats</legend>
          <div className="space-y-2">
            {SCREEN_FORMATS.map((format) => (
              <Checkbox
                key={format}
                label={format}
                checked={formats.includes(format)}
                onChange={() =>
                  setFormats((current) =>
                    current.includes(format)
                      ? current.filter((item) => item !== format)
                      : [...current, format],
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <Checkbox
          label="In service"
          hint="Taking a screen out of service stops new shows being scheduled in it. Shows already scheduled are unaffected."
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
      </div>
    </Dialog>
  );
}

function LayoutViewDialog({ version, onClose, namespace, screenId }) {
  const { data: layout, error, loading } = useResource(
    useCallback(
      ({ signal }) =>
        version ? fetchLayout(namespace, screenId, version, { signal }) : null,
      [namespace, screenId, version],
    ),
    [version],
    { enabled: Boolean(version) },
  );

  return (
    <Dialog
      open={Boolean(version)}
      onClose={onClose}
      title={`Seat layout · version ${version}`}
      description={
        layout
          ? `${pluralize(layout.seatCount, 'bookable seat')} across ${pluralize(layout.rowCount, 'row')}.`
          : undefined
      }
      size="xl"
    >
      {loading ? (
        <LoadingBlock label="Loading layout" />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <LayoutPreview layout={layout} />
      )}
    </Dialog>
  );
}
