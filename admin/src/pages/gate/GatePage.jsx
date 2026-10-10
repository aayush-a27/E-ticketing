import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Keyboard,
  ShieldOff,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { validateTicket } from '../../services/platformService.js';
import { ERROR_CODES } from '../../services/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader, PageHeader } from '../../components/ui/Layout.jsx';
import { dateTime, timeOnly } from '../../utils/format.js';

/** Ignore the same code for this long after it was read, so one QR is one scan. */
const REPEAT_GUARD_MS = 4000;

/**
 * What the door attendant typed or pasted. Ten letters and digits, with or
 * without the hyphen, is the entry code printed under the QR; anything long
 * is the QR's own signed token, pasted. The server re-checks either way.
 */
function readInput(raw) {
  const trimmed = raw.trim();
  const compact = trimmed.toUpperCase().replace(/[\s-]/g, '');
  if (/^[A-Z0-9]{10}$/.test(compact)) return { code: compact };
  if (trimmed.length >= 32) return { token: trimmed };
  return null;
}

/** Shows a code as it is printed on the ticket while it is being typed. */
function formatAsTyped(value) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Long input is a pasted token; leave it exactly as it was.
  if (value.length > 12) return value;
  return compact.length > 5 ? `${compact.slice(0, 5)}-${compact.slice(5, 10)}` : compact;
}

/**
 * Turns the API's answer into what the person at the door needs: admit or
 * not, and why, in a form readable at arm's length.
 */
function outcomeFrom(result, error) {
  if (result) {
    return {
      tone: 'good',
      Icon: CheckCircle2,
      title: 'Admit',
      detail: result,
    };
  }

  const code = error?.code;
  if (code === ERROR_CODES.TICKET_ALREADY_USED) {
    const when = error.details?.find((item) => item.field === 'admittedAt')?.message;
    return {
      tone: 'bad',
      Icon: XCircle,
      title: 'Already used',
      message: when ? `This ticket was scanned in at ${timeOnly(when)} (${dateTime(when)}).` : error.message,
    };
  }
  if (code === 'TICKET_NOT_YET_VALID') {
    const startAt = error.details?.find((item) => item.field === 'startAt')?.message;
    return {
      tone: 'warn',
      Icon: Clock,
      title: 'Too early',
      message: startAt
        ? `This ticket is for the show at ${dateTime(startAt)}. It has not been used — it will work closer to the time.`
        : error.message,
    };
  }
  if (code === 'TICKET_SHOW_ENDED') {
    return { tone: 'bad', Icon: XCircle, title: 'Show is over', message: error.message };
  }
  if (code === ERROR_CODES.NOT_THEATER_MANAGER) {
    return {
      tone: 'bad',
      Icon: ShieldOff,
      title: 'Not this venue',
      message: 'This ticket is for a theater you do not manage.',
    };
  }
  if (code === ERROR_CODES.TICKET_INVALID) {
    return { tone: 'bad', Icon: XCircle, title: 'Not valid', message: error.message };
  }
  if (code === ERROR_CODES.RATE_LIMITED) {
    return {
      tone: 'warn',
      Icon: TriangleAlert,
      title: 'Slow down',
      message: 'Too many scans in a short time. Wait a moment and scan again.',
    };
  }
  return {
    tone: 'warn',
    Icon: TriangleAlert,
    title: 'Could not check',
    message: `${error?.message ?? 'Something went wrong.'} The ticket has not been marked used — scan it again.`,
  };
}

const TONES = {
  good: 'border-good/40 bg-good-soft text-good',
  warn: 'border-warn/40 bg-warn-soft text-warn',
  bad: 'border-bad/40 bg-bad-soft text-bad',
};

/**
 * The door.
 *
 * Reads a ticket's QR code with the device camera, or takes it pasted, and
 * asks the server. Decoding a QR code proves nothing on its own: the token is
 * a signed string, and only the server can check the signature, the booking's
 * state, the venue and the time — and record admission so the same ticket
 * cannot get two people in. A scan that fails for a reason other than "already
 * used" never marks the ticket.
 *
 * Needs a network connection. Nothing here works offline, and nothing claims
 * to.
 */
export default function GatePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const busyRef = useRef(false);
  const lastRef = useRef({ token: null, at: 0 });

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [manual, setManual] = useState('');
  const [history, setHistory] = useState([]);

  const submit = useCallback(async (ticket) => {
    if (!ticket || busyRef.current) return;
    const key = ticket.token ?? ticket.code;

    const now = Date.now();
    if (lastRef.current.token === key && now - lastRef.current.at < REPEAT_GUARD_MS) return;
    lastRef.current = { token: key, at: now };

    busyRef.current = true;
    setChecking(true);
    try {
      const result = await validateTicket(ticket);
      const next = outcomeFrom(result, null);
      setOutcome(next);
      setHistory((current) => [{ ...next, at: new Date() }, ...current].slice(0, 12));
      return next;
    } catch (error) {
      const next = outcomeFrom(null, error);
      setOutcome(next);
      setHistory((current) => [{ ...next, at: new Date() }, ...current].slice(0, 12));
      return next;
    } finally {
      busyRef.current = false;
      setChecking(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const width = video.videoWidth;
      const height = video.videoHeight;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(video, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      const code = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
      if (code?.data) submit({ token: code.data });
    }

    frameRef.current = requestAnimationFrame(scanFrame);
  }, [submit]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'This browser cannot use a camera here. Cameras need HTTPS, or localhost during development.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      setCameraError(
        error?.name === 'NotAllowedError'
          ? 'Camera permission was refused. Allow it in the browser’s site settings, or paste the ticket code below.'
          : error?.name === 'NotFoundError'
            ? 'No camera was found on this device. Paste the ticket code below instead.'
            : 'The camera could not be started. Paste the ticket code below instead.',
      );
      stopCamera();
    }
  }, [scanFrame, stopCamera]);

  // Release the camera when leaving the page.
  useEffect(() => stopCamera, [stopCamera]);

  const Icon = outcome?.Icon;

  return (
    <>
      <PageHeader
        title="Gate"
        description="Scan the ticket's QR code, or type its entry code. The server decides; a ticket is marked used only when it admits someone."
      />

      <div className="grid gap-5 lg:grid-cols-[1.618fr_1fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader
              title="Camera"
              actions={
                cameraOn ? (
                  <Button variant="secondary" size="sm" onClick={stopCamera}>
                    <CameraOff className="size-3.5" aria-hidden="true" />
                    Stop
                  </Button>
                ) : (
                  <Button size="sm" onClick={startCamera}>
                    <Camera className="size-3.5" aria-hidden="true" />
                    Start scanning
                  </Button>
                )
              }
            />
            <div className="relative bg-ink-950">
              <video
                ref={videoRef}
                className={`aspect-video w-full object-cover ${cameraOn ? '' : 'hidden'}`}
                playsInline
                muted
                aria-label="Camera preview"
              />
              {!cameraOn && (
                <div className="flex aspect-video flex-col items-center justify-center gap-2 px-6 text-center text-ink-400">
                  <Camera className="size-7" aria-hidden="true" />
                  <p className="text-sm">The camera is off.</p>
                </div>
              )}
              {cameraOn && (
                <div
                  className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/70"
                  aria-hidden="true"
                />
              )}
              <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
            </div>
            {cameraError && (
              <p className="border-t border-ink-200 bg-warn-soft px-4 py-3 text-sm text-ink-800" role="alert">
                {cameraError}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Enter the code"
              description="No camera, or a screen that will not scan? Type the entry code printed under the customer's QR."
            />
            <form
              className="space-y-3 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                const ticket = readInput(manual);
                if (!ticket) {
                  setOutcome({
                    tone: 'warn',
                    Icon: TriangleAlert,
                    title: 'Check the code',
                    message: 'An entry code is 10 letters and digits, like 7KQ4M-XP9TD.',
                  });
                  return;
                }
                lastRef.current = { token: null, at: 0 };
                // Cleared only when someone is let in, so a typo can be fixed
                // rather than retyped from the start.
                submit(ticket).then((next) => {
                  if (next?.tone === 'good') setManual('');
                });
              }}
            >
              <label htmlFor="entry-code" className="block text-sm font-medium text-ink-700">
                Entry code
              </label>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  id="entry-code"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={manual}
                  onChange={(event) => setManual(formatAsTyped(event.target.value))}
                  placeholder="XXXXX-XXXXX"
                  aria-describedby="entry-code-hint"
                  className="h-12 min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-4 text-center text-xl font-semibold uppercase tracking-[0.2em] text-ink-900 transition-colors placeholder:font-normal placeholder:tracking-[0.2em] placeholder:text-ink-300 hover:border-ink-300 focus:border-brand"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                <Button type="submit" size="lg" loading={checking} disabled={!manual.trim()} className="h-12">
                  <Keyboard className="size-4" aria-hidden="true" />
                  Check
                </Button>
              </div>
              <p id="entry-code-hint" className="text-xs text-ink-500">
                Upper or lower case, with or without the dash. Each code works once, and only at
                the right venue and time — exactly like the QR.
              </p>
            </form>
          </Card>
        </div>

        <div className="space-y-5">
          <div
            className={`rounded-xl border-2 p-6 ${outcome ? TONES[outcome.tone] : 'border-ink-200 bg-white text-ink-500'}`}
            role="status"
            aria-live="assertive"
          >
            {checking ? (
              <p className="text-lg font-semibold text-ink-700">Checking…</p>
            ) : !outcome ? (
              <p className="text-sm">Waiting for a ticket.</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Icon className="size-9 shrink-0" aria-hidden="true" />
                  <p className="text-3xl font-bold tracking-tight">{outcome.title}</p>
                </div>
                {outcome.detail ? (
                  <dl className="mt-4 space-y-1.5 text-ink-900">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-500">Seats</dt>
                      <dd className="text-2xl font-semibold">{outcome.detail.seats.join(', ')}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-500">Film</dt>
                      <dd className="text-sm">{outcome.detail.movieTitle}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-500">Screen</dt>
                      <dd className="text-sm">
                        {outcome.detail.screenName}
                        {outcome.detail.theaterName ? ` · ${outcome.detail.theaterName}` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-500">Show</dt>
                      <dd className="text-sm">{dateTime(outcome.detail.startAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-500">Reference</dt>
                      <dd className="font-mono text-sm">{outcome.detail.reference}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-ink-800">{outcome.message}</p>
                )}
              </>
            )}
          </div>

          <Card>
            <CardHeader title="This session" description="Cleared when you leave the page." />
            {history.length === 0 ? (
              <p className="p-5 text-sm text-ink-500">No scans yet.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {history.map((item, index) => (
                  <li key={`${item.at.getTime()}-${index}`} className="flex items-center gap-3 px-5 py-2.5">
                    <item.Icon
                      className={`size-4 shrink-0 ${item.tone === 'good' ? 'text-good' : item.tone === 'warn' ? 'text-warn' : 'text-bad'}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                      {item.title}
                      {item.detail ? ` · ${item.detail.seats.join(', ')}` : ''}
                    </span>
                    <span className="shrink-0 text-xs text-ink-500">{timeOnly(item.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
