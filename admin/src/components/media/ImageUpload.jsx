import { useCallback, useRef, useState } from 'react';
import { ImageOff, Loader2, Trash2, Upload, TriangleAlert } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { ConfirmDialog } from '../ui/Dialog.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  isSimulatedMediaProvider,
  requestUploadTicket,
  uploadToProvider,
  validateImageFile,
} from '../../services/catalogService.js';

/**
 * Uploads one image straight to the media provider and reports the stored
 * public id back to the caller.
 *
 * Three steps, in this order: ask the server for a signed ticket, post the
 * file to the provider with it, then hand the provider's own public id to the
 * resource's media endpoint, which re-verifies the asset exists before storing
 * it. The file never passes through the API and the provider's secret never
 * reaches the browser.
 *
 * When the backend is running the in-memory media provider — which exists so
 * the project works with no Cloudinary account — there is nowhere to upload
 * to. This says so plainly instead of reporting a success that did not happen.
 */
export function ImageUpload({
  label,
  hint,
  purpose,
  resourceId,
  current,
  aspect = 'aspect-[2/3]',
  onUploaded,
  onRemove,
  disabled = false,
  disabledReason,
}) {
  const toast = useToast();
  const inputRef = useRef(null);
  const controllerRef = useRef(null);

  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const onPick = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      // Reset immediately so picking the same file twice still fires a change.
      event.target.value = '';
      if (!file) return;

      setBusy(true);
      setUnavailable(null);
      setProgress(null);

      try {
        const ticket = await requestUploadTicket({ purpose, resourceId });

        const problem = validateImageFile(file, ticket.constraints);
        if (problem) {
          toast.error(problem);
          return;
        }

        if (isSimulatedMediaProvider(ticket)) {
          // Nothing to upload to. Say so; do not report a stored image.
          setUnavailable(
            'The backend is running its in-memory media provider, which cannot accept an upload.',
          );
          return;
        }

        controllerRef.current = new AbortController();
        setProgress(0);

        const stored = await uploadToProvider({
          upload: ticket.upload,
          file,
          onProgress: setProgress,
          signal: controllerRef.current.signal,
        });

        if (!stored.publicId) {
          toast.error('The media provider accepted the file but returned no id.');
          return;
        }

        // The server verifies the asset with the provider before storing it.
        await onUploaded(stored.publicId);
        toast.success(`${label} updated.`);
      } catch (error) {
        if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
        toast.fromError(error, `Could not upload the ${label.toLowerCase()}.`);
      } finally {
        setBusy(false);
        setProgress(null);
        controllerRef.current = null;
      }
    },
    [label, onUploaded, purpose, resourceId, toast],
  );

  const doRemove = async () => {
    setRemoving(true);
    try {
      await onRemove();
      toast.success(`${label} removed.`);
      setConfirmRemove(false);
    } catch (error) {
      toast.fromError(error, `Could not remove the ${label.toLowerCase()}.`);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-700">{label}</p>

      <div
        className={`relative overflow-hidden rounded-lg border border-ink-200 bg-ink-50 ${aspect}`}
      >
        {current?.url ? (
          <img
            src={current.url}
            alt={`${label} preview`}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-ink-400">
            <ImageOff className="size-6" aria-hidden="true" />
            <span className="text-xs">No {label.toLowerCase()}</span>
          </div>
        )}

        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-white/85">
            <Loader2 className="size-5 animate-spin text-brand" aria-hidden="true" />
            {progress === null ? (
              <p className="text-xs text-ink-600">Preparing…</p>
            ) : (
              <>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink-200">
                  <div
                    className="h-full rounded-full bg-brand transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-ink-600" aria-live="polite">
                  {progress}%
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {hint && !unavailable && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}

      {disabled && disabledReason && (
        <p className="mt-1.5 text-xs text-ink-500">{disabledReason}</p>
      )}

      {unavailable && (
        <div
          className="mt-2 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-2.5 py-2"
          role="alert"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 text-xs text-ink-700">
            <p className="font-medium">Image storage is not configured</p>
            <p className="mt-0.5">{unavailable}</p>
            <p className="mt-1">
              Set <code className="font-mono">MEDIA_PROVIDER=cloudinary</code> on the backend with
              a cloud name, API key and secret. A free Cloudinary account is enough.
            </p>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          onChange={onPick}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
          loading={busy}
        >
          <Upload className="size-3.5" aria-hidden="true" />
          {current?.url ? 'Replace' : 'Upload'}
        </Button>
        {current?.url && onRemove && (
          <Button
            variant="danger-quiet"
            size="sm"
            onClick={() => setConfirmRemove(true)}
            disabled={disabled || busy}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={doRemove}
        loading={removing}
        title={`Remove this ${label.toLowerCase()}?`}
        description="The image will be deleted from storage as well. This cannot be undone."
        confirmLabel="Remove"
      />
    </div>
  );
}
