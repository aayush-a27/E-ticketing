import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, Lock, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import { createShow, fetchShow, updateShow } from '../../services/showService.js';
import { fetchPublishedMovies } from '../../services/catalogService.js';
import { fetchLayout, fetchScreens, fetchTheaters } from '../../services/venueService.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader, PageHeader } from '../../components/ui/Layout.jsx';
import { Select, TextField } from '../../components/ui/Field.jsx';
import { ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { dateTime, money, pluralize, toDateTimeInput } from '../../utils/format.js';

/**
 * Scheduling a show, and editing one.
 *
 * The constraints are real and the server owns all of them: the film must be
 * published, the screen must have an active seat layout, the format must be
 * one the screen supports, every seat category in that layout must be priced,
 * and the screen must be free for the whole run. What this form does is make
 * those requirements visible before the request, and show the computed end
 * time so a clash is obvious rather than discovered in a rejection.
 *
 * The overlap check itself stays in the database. Two people scheduling the
 * same screen at the same moment are separated there, not here.
 *
 * Once a single ticket is sold, the server freezes the start time, the
 * pricing, the format, the language and the cleanup gap — those are the terms
 * someone has already paid against. This form locks exactly those fields and
 * says why, rather than offering an edit that would be refused.
 */
export default function ShowFormPage() {
  const { showId } = useParams();
  const isEditing = Boolean(showId);
  const { namespace } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const existing = useResource(
    useCallback(
      ({ signal }) => (isEditing ? fetchShow(namespace, showId, { signal }) : null),
      [namespace, showId, isEditing],
    ),
    [namespace, showId],
    { enabled: isEditing },
  );

  const theaters = useResource(
    useCallback(
      ({ signal }) => fetchTheaters(namespace, { limit: 100, status: 'active' }, { signal }),
      [namespace],
    ),
    [namespace],
  );

  const movies = useResource(
    useCallback(({ signal }) => fetchPublishedMovies({}, { signal }), []),
    [],
  );

  if (isEditing && existing.loading) return <LoadingBlock label="Loading show" />;
  if (isEditing && existing.error) return <ErrorState error={existing.error} />;
  if (theaters.loading || movies.loading) return <LoadingBlock label="Loading venues and films" />;

  return (
    <ShowForm
      key={existing.data?._id ?? 'new'}
      show={existing.data}
      isEditing={isEditing}
      namespace={namespace}
      navigate={navigate}
      toast={toast}
      theaters={theaters.data?.items ?? []}
      movies={movies.data?.items ?? []}
      presetTheaterId={searchParams.get('theaterId') ?? ''}
    />
  );
}

function ShowForm({
  show,
  isEditing,
  namespace,
  navigate,
  toast,
  theaters,
  movies,
  presetTheaterId,
}) {
  /**
   * The five fields the server freezes once a ticket exists. They are the
   * terms a customer has already paid against, so they stop being editable
   * rather than becoming a warning.
   */
  const soldSeats = isEditing ? (show.bookedSeatCount ?? 0) : 0;
  const locked = soldSeats > 0;

  // A show's screen and film can never move: its seat inventory is already
  // generated against that screen's layout version.
  const lockedTheaterId = isEditing ? (show.theaterId?._id ?? show.theaterId) : presetTheaterId;

  const [theaterId, setTheaterId] = useState(lockedTheaterId ?? '');
  const [screenId, setScreenId] = useState(isEditing ? (show.screenId?._id ?? show.screenId) : '');
  const [movieId, setMovieId] = useState(isEditing ? (show.movieId?._id ?? show.movieId) : '');
  const [startAt, setStartAt] = useState(
    isEditing ? toDateTimeInput(show.startAt) : toDateTimeInput(Date.now() + 86_400_000),
  );
  const [language, setLanguage] = useState(isEditing ? show.language : '');
  const [format, setFormat] = useState(isEditing ? show.format : '');
  const [cleanupMinutes, setCleanupMinutes] = useState(15);
  const [bookingOpensAt, setBookingOpensAt] = useState(
    isEditing ? toDateTimeInput(show.bookingOpensAt) : '',
  );
  const [bookingClosesAt, setBookingClosesAt] = useState(
    isEditing ? toDateTimeInput(show.bookingClosesAt) : '',
  );
  const [prices, setPrices] = useState(() =>
    isEditing
      ? Object.fromEntries(show.pricing.map((item) => [item.category, item.basePaise / 100]))
      : {},
  );
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const screens = useResource(
    useCallback(
      ({ signal }) => (theaterId ? fetchScreens(namespace, theaterId, { signal }) : []),
      [namespace, theaterId],
    ),
    [theaterId],
    { enabled: Boolean(theaterId), initialData: [] },
  );

  const screen = (screens.data ?? []).find((item) => item._id === screenId);
  const movie = movies.find((item) => item.id === movieId);

  /**
   * The categories to price come from the layout the show will actually use —
   * the screen's active version for a new show, the version this show was
   * pinned to when editing one. Pricing a category the layout does not have is
   * refused by the server, so the choices have to come from the layout itself.
   */
  const layoutVersion = isEditing ? show.layoutVersion : screen?.activeLayoutVersion;

  const layout = useResource(
    useCallback(
      ({ signal }) =>
        screenId && layoutVersion
          ? fetchLayout(namespace, screenId, layoutVersion, { signal })
          : null,
      [namespace, screenId, layoutVersion],
    ),
    [screenId, layoutVersion],
    { enabled: Boolean(screenId && layoutVersion) },
  );

  const categories = useMemo(() => {
    const names = [...(layout.data?.categories?.map((category) => category.name) ?? [])];
    // Editing: keep any category this show was priced with even if the layout
    // has since changed, so saving cannot silently drop a price.
    if (isEditing) {
      for (const item of show.pricing) {
        if (!names.includes(item.category)) names.push(item.category);
      }
    }
    return names;
  }, [layout.data, isEditing, show]);

  // Changing the venue invalidates the chosen screen.
  useEffect(() => {
    if (isEditing) return;
    setScreenId('');
  }, [theaterId, isEditing]);

  // Default format and language to something valid rather than leaving the
  // operator to discover an unsupported combination on submit.
  useEffect(() => {
    if (isEditing || !screen) return;
    setFormat((current) =>
      screen.formats?.includes(current) ? current : (screen.formats?.[0] ?? ''),
    );
  }, [screen, isEditing]);

  useEffect(() => {
    if (isEditing || !movie) return;
    setLanguage((current) =>
      movie.languages?.includes(current) ? current : (movie.languages?.[0] ?? ''),
    );
  }, [movie, isEditing]);

  const runtimeMinutes = isEditing ? show.movieId?.runtimeMinutes : movie?.runtimeMinutes;

  const endsAt = useMemo(() => {
    if (!startAt || !runtimeMinutes) return null;
    return new Date(
      new Date(startAt).getTime() + (runtimeMinutes + Number(cleanupMinutes || 0)) * 60_000,
    );
  }, [startAt, runtimeMinutes, cleanupMinutes]);

  const problems = useMemo(() => {
    const found = [];

    if (!isEditing) {
      if (!theaterId) found.push('Pick a venue.');
      if (!screenId) found.push('Pick a screen.');
      if (!movieId) found.push('Pick a film.');
      if (screen && !screen.activeLayoutVersion) {
        found.push(`"${screen.name}" has no active seat layout, so no show can run in it.`);
      }
      if (screen && !screen.isActive) found.push(`"${screen.name}" is out of service.`);
    }

    // Everything below is frozen once a ticket is sold, so it cannot be wrong.
    if (!locked) {
      if (!startAt) found.push('Set a start time.');
      else if (new Date(startAt).getTime() <= Date.now()) {
        found.push('A show must start in the future.');
      }
      if (!language) found.push('Pick a language.');
      if (!format) found.push('Pick a format.');
      if (screen && format && !screen.formats?.includes(format)) {
        found.push(`${screen.name} does not support ${format}.`);
      }
      if (categories.length === 0 && screenId) {
        found.push('This screen has no seat categories to price.');
      }
      for (const category of categories) {
        const value = prices[category];
        if (value === '' || value === undefined || value === null) {
          found.push(`Price the ${category} seats.`);
        } else if (Number(value) < 0) {
          found.push(`${category} cannot be negative.`);
        } else if (Number(value) > 10_000) {
          found.push(`${category} is over the ten-thousand-rupee limit.`);
        }
      }
    }

    if (bookingOpensAt && bookingClosesAt && bookingOpensAt >= bookingClosesAt) {
      found.push('Booking must close after it opens.');
    }
    const effectiveStart = locked ? toDateTimeInput(show.startAt) : startAt;
    if (bookingOpensAt && effectiveStart && bookingOpensAt > effectiveStart) {
      found.push('Booking cannot open after the show starts.');
    }
    if (bookingClosesAt && effectiveStart && bookingClosesAt > effectiveStart) {
      found.push('Booking cannot close after the show starts.');
    }

    return found;
  }, [
    isEditing,
    locked,
    theaterId,
    screenId,
    movieId,
    screen,
    startAt,
    language,
    format,
    categories,
    prices,
    bookingOpensAt,
    bookingClosesAt,
    show,
  ]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitError(null);
    setBusy(true);

    /** Rupees in the form, integer paise on the wire. */
    const pricing = categories.map((category) => ({
      category,
      basePaise: Math.round(Number(prices[category]) * 100),
    }));

    try {
      if (isEditing) {
        /**
         * Only what actually changed is sent. The server refuses a frozen
         * field even when its value is unchanged, because it refuses on the
         * field being present at all — so sending the whole form would make
         * every edit of a selling show fail.
         */
        const payload = {};

        if (!locked) {
          const originalStart = toDateTimeInput(show.startAt);
          if (startAt !== originalStart) payload.startAt = new Date(startAt).toISOString();
          if (language !== show.language) payload.language = language;
          if (format !== show.format) payload.format = format;

          const originalPricing = JSON.stringify(
            show.pricing.map((item) => [item.category, item.basePaise]).sort(),
          );
          const nextPricing = JSON.stringify(
            pricing.map((item) => [item.category, item.basePaise]).sort(),
          );
          if (originalPricing !== nextPricing) payload.pricing = pricing;
        }

        const originalOpens = toDateTimeInput(show.bookingOpensAt);
        const originalCloses = toDateTimeInput(show.bookingClosesAt);
        if (bookingOpensAt !== originalOpens && bookingOpensAt) {
          payload.bookingOpensAt = new Date(bookingOpensAt).toISOString();
        }
        if (bookingClosesAt !== originalCloses && bookingClosesAt) {
          payload.bookingClosesAt = new Date(bookingClosesAt).toISOString();
        }

        if (Object.keys(payload).length === 0) {
          setSubmitError('Nothing has changed.');
          return;
        }

        const updated = await updateShow(namespace, show._id, payload);
        toast.success('Show updated.');
        navigate(`/shows/${updated._id}`, { replace: true });
      } else {
        const payload = {
          movieId,
          screenId,
          startAt: new Date(startAt).toISOString(),
          language,
          format,
          pricing,
          cleanupMinutes: Number(cleanupMinutes),
        };
        if (bookingOpensAt) payload.bookingOpensAt = new Date(bookingOpensAt).toISOString();
        if (bookingClosesAt) payload.bookingClosesAt = new Date(bookingClosesAt).toISOString();

        const created = await createShow(namespace, payload);
        toast.success('Show scheduled as a draft. Publish it to open booking.');
        navigate(`/shows/${created._id}`, { replace: true });
      }
    } catch (caught) {
      // SHOW_OVERLAP, SHOW_NOT_EDITABLE and PRICING_INCOMPLETE all arrive with
      // a message worth showing verbatim: each names the actual obstacle.
      setSubmitError(caught?.message ?? 'Could not save the show.');
    } finally {
      setBusy(false);
    }
  };

  const backTo = isEditing ? `/shows/${show._id}` : '/shows';

  return (
    <>
      <PageHeader
        title={isEditing ? 'Edit show' : 'Schedule a show'}
        description={
          isEditing
            ? 'The venue, screen and film cannot change: seat inventory is already generated against this screen’s layout.'
            : 'Created as a draft. Booking opens only once you publish it.'
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
          className="mb-5 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3.5 py-3"
          role="alert"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
          <p className="text-sm text-ink-800">{submitError}</p>
        </div>
      )}

      {locked && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3.5 py-3">
          <Lock className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 text-sm text-ink-800">
            <p className="font-medium">
              {pluralize(soldSeats, 'seat')} sold, so most of this show is settled.
            </p>
            <p className="mt-1">
              The start time, pricing, format and language are the terms those customers paid
              against, and the server will not let them change. Only the booking window is still
              editable. To move or reprice this show you would have to cancel it, which refunds
              everyone who holds a ticket.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-5">
        <Card>
          <CardHeader title="Where and what" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Select
              label="Venue"
              required
              disabled={isEditing}
              value={theaterId}
              onChange={(event) => setTheaterId(event.target.value)}
              placeholder="Pick a venue"
              options={theaters.map((theater) => ({
                value: theater._id,
                label: `${theater.name} · ${theater.cityLabel}`,
              }))}
              hint={
                theaters.length === 0
                  ? 'No active venue is available to you.'
                  : isEditing
                    ? 'Fixed once the show exists.'
                    : undefined
              }
            />

            <Select
              label="Screen"
              required
              disabled={isEditing || !theaterId}
              value={screenId}
              onChange={(event) => setScreenId(event.target.value)}
              placeholder={theaterId ? 'Pick a screen' : 'Pick a venue first'}
              options={(screens.data ?? []).map((item) => ({
                value: item._id,
                label: `${item.name}${item.activeLayoutVersion ? '' : ' — no seat layout'}`,
                disabled: !item.activeLayoutVersion || !item.isActive,
              }))}
              hint={
                isEditing
                  ? `Seat layout version ${show.layoutVersion}, pinned when the show was created.`
                  : screen && !screen.activeLayoutVersion
                    ? 'Build a seat layout for this screen first.'
                    : screen
                      ? `Seat layout version ${screen.activeLayoutVersion} · ${screen.formats?.join(', ')}`
                      : undefined
              }
            />

            <Select
              label="Film"
              required
              disabled={isEditing}
              className="sm:col-span-2"
              value={movieId}
              onChange={(event) => setMovieId(event.target.value)}
              placeholder="Pick a published film"
              options={
                isEditing
                  ? [{ value: movieId, label: show.movieId?.title ?? 'This film' }]
                  : movies.map((item) => ({
                      value: item.id,
                      label: `${item.title} · ${item.runtimeMinutes} min · ${item.certification}`,
                    }))
              }
              hint={
                movies.length === 0 && !isEditing
                  ? 'No published film is available. Publish one first.'
                  : isEditing
                    ? 'Fixed once the show exists.'
                    : 'Only published films can be scheduled.'
              }
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="When"
            description={locked ? 'Settled by the tickets already sold.' : undefined}
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextField
              label="Starts at"
              type="datetime-local"
              required
              disabled={locked}
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              hint={locked ? 'Locked — tickets are sold.' : 'Your local time.'}
            />

            {!isEditing && (
              <TextField
                label="Cleanup after the film"
                type="number"
                value={cleanupMinutes}
                onChange={(event) => setCleanupMinutes(event.target.value)}
                hint="Minutes before the screen is free again."
              />
            )}

            <div className="sm:col-span-2">
              <div className="flex items-start gap-2 rounded-lg bg-ink-50 px-3.5 py-3">
                <Info className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden="true" />
                <div className="min-w-0 text-sm text-ink-700">
                  {isEditing && locked ? (
                    <p>
                      Runs {dateTime(show.startAt)} to {dateTime(show.endAt)}.
                    </p>
                  ) : endsAt ? (
                    <p>
                      The screen will be occupied until{' '}
                      <span className="font-medium text-ink-900">{dateTime(endsAt)}</span> —{' '}
                      {runtimeMinutes} minutes of film plus {cleanupMinutes || 0} of cleanup. The
                      server refuses an overlapping show on the same screen.
                    </p>
                  ) : (
                    <p>Pick a film and a start time to see when the screen frees up.</p>
                  )}
                </div>
              </div>
            </div>

            <Select
              label="Language"
              required
              disabled={locked}
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder={movie || isEditing ? 'Pick a language' : 'Pick a film first'}
              options={(
                (isEditing ? show.movieId?.languages : movie?.languages) ??
                (isEditing ? [show.language] : [])
              ).map((item) => ({ value: item, label: item }))}
              hint={locked ? 'Locked — tickets are sold.' : undefined}
            />

            <Select
              label="Format"
              required
              disabled={locked}
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              placeholder={screen || isEditing ? 'Pick a format' : 'Pick a screen first'}
              options={(screen?.formats ?? (isEditing ? [show.format] : [])).map((item) => ({
                value: item,
                label: item,
              }))}
              hint={locked ? 'Locked — tickets are sold.' : screen ? 'Only what this screen supports.' : undefined}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Booking window"
            description="Optional. Leave both empty to let booking run from publication until the show starts."
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextField
              label="Booking opens"
              type="datetime-local"
              value={bookingOpensAt}
              onChange={(event) => setBookingOpensAt(event.target.value)}
            />
            <TextField
              label="Booking closes"
              type="datetime-local"
              value={bookingClosesAt}
              onChange={(event) => setBookingClosesAt(event.target.value)}
              hint="Often a few minutes before the film starts."
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Pricing"
            description="Per seat, before convenience fees and tax. Those are added at checkout from the platform's own settings."
          />
          <div className="p-5">
            {layout.loading ? (
              <LoadingBlock label="Loading seat categories" />
            ) : categories.length === 0 ? (
              <p className="text-sm text-ink-500">
                Pick a screen with an active seat layout to see its categories.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {categories.map((category) => {
                    const seatsInCategory = layout.data?.seats?.filter(
                      (seat) =>
                        seat.category === category &&
                        (seat.kind ?? 'seat') === 'seat' &&
                        seat.isActive !== false,
                    ).length;
                    return (
                      <TextField
                        key={category}
                        label={category}
                        type="number"
                        step="0.01"
                        required
                        disabled={locked}
                        prefix="₹"
                        value={prices[category] ?? ''}
                        onChange={(event) =>
                          setPrices((current) => ({ ...current, [category]: event.target.value }))
                        }
                        hint={
                          locked
                            ? 'Locked — tickets are sold.'
                            : seatsInCategory
                              ? pluralize(seatsInCategory, 'seat')
                              : 'In this layout'
                        }
                      />
                    );
                  })}
                </div>

                {!locked && categories.some((category) => prices[category]) && (
                  <p className="mt-4 text-xs text-ink-500">
                    Stored as integer paise:{' '}
                    {categories
                      .filter(
                        (category) =>
                          prices[category] !== undefined && prices[category] !== '',
                      )
                      .map(
                        (category) =>
                          `${category} ${money(Math.round(Number(prices[category]) * 100))}`,
                      )
                      .join(' · ')}
                  </p>
                )}
              </>
            )}
          </div>
        </Card>

        {problems.length > 0 && (
          <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
            <p className="text-sm font-medium text-ink-900">Before this can be saved</p>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-ink-600">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {isEditing && <Badge>Layout version {show.layoutVersion}</Badge>}
          <Button as={Link} to={backTo} variant="secondary">
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={problems.length > 0}>
            {isEditing ? 'Save changes' : 'Schedule as draft'}
          </Button>
        </div>
      </form>
    </>
  );
}
