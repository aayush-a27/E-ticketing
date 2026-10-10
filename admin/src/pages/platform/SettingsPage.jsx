import { useCallback, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useResource } from '../../hooks/useResource.js';
import { useToast } from '../../context/ToastContext.jsx';
import { fetchSettings, updateSettings } from '../../services/platformService.js';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader, PageHeader } from '../../components/ui/Layout.jsx';
import { ConfirmDialog } from '../../components/ui/Dialog.jsx';
import { Checkbox, Select, TextField } from '../../components/ui/Field.jsx';
import { ErrorState, LoadingBlock } from '../../components/ui/States.jsx';
import { dateTime } from '../../utils/format.js';

/*
 * The form works in the units people think in — percent and rupees — and the
 * API stores basis points and integer paise. These are the only conversions,
 * and they round once, here, so a value never drifts by a paisa through
 * repeated saves.
 */
const toPercent = (basisPoints) => (basisPoints ?? 0) / 100;
const toBasisPoints = (percent) => Math.round(Number(percent) * 100);
const toRupees = (paise) => (paise ?? 0) / 100;
const toPaise = (rupees) => Math.round(Number(rupees) * 100);

const isNumber = (value) => value !== '' && value !== null && Number.isFinite(Number(value));

/**
 * Fees, tax, the cancellation policy and seat-hold limits. Super admin only.
 *
 * Each section is saved on its own, behind a confirmation, because each one
 * changes what customers pay or get back. A change applies to bookings made
 * afterwards: every booking stores the price breakdown it was quoted, so
 * nothing already sold is repriced. Every save is written to the audit log
 * with the section as it was before and after.
 */
export default function SettingsPage() {
  const { data: settings, error, loading, refetch, setData } = useResource(
    useCallback(({ signal }) => fetchSettings({ signal }), []),
    [],
  );

  if (loading) return <LoadingBlock label="Loading settings" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!settings) return null;

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Changes apply to bookings made from now on. Bookings already made keep the prices they were quoted."
      />
      {settings.updatedAt && (
        <p className="-mt-3 mb-5 text-xs text-ink-500">Last changed {dateTime(settings.updatedAt)}.</p>
      )}

      <div className="space-y-5">
        <FeesSection settings={settings} onSaved={setData} />
        <TaxSection settings={settings} onSaved={setData} />
        <CancellationSection settings={settings} onSaved={setData} />
        <HoldSection settings={settings} onSaved={setData} />
      </div>
    </>
  );
}

/** Shared save-with-confirmation plumbing for one section. */
function useSectionSave(onSaved, successMessage) {
  const toast = useToast();
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    try {
      const saved = await updateSettings(pending);
      onSaved(saved);
      toast.success(successMessage);
      setPending(null);
    } catch (caught) {
      toast.fromError(caught, 'Could not save these settings.');
    } finally {
      setSaving(false);
    }
  };

  return { pending, setPending, saving, confirm };
}

function SectionFooter({ problems, onSave, dirty }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-ink-200 bg-ink-50/60 px-5 py-3">
      {problems.length > 0 && <p className="mr-auto text-xs text-bad">{problems[0]}</p>}
      <Button onClick={onSave} disabled={!dirty || problems.length > 0}>
        <Save className="size-4" aria-hidden="true" />
        Save
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FeesSection({ settings, onSaved }) {
  const initial = {
    percent: String(toPercent(settings.fees?.percentBasisPoints)),
    flat: String(toRupees(settings.fees?.flatPerTicketPaise)),
    cap:
      settings.fees?.capPerBookingPaise === null || settings.fees?.capPerBookingPaise === undefined
        ? ''
        : String(toRupees(settings.fees.capPerBookingPaise)),
  };
  const [form, setForm] = useState(initial);
  const save = useSectionSave(onSaved, 'Convenience fees saved.');

  const problems = [];
  if (!isNumber(form.percent) || form.percent < 0 || form.percent > 100) problems.push('The percentage must be between 0 and 100.');
  if (!isNumber(form.flat) || form.flat < 0 || form.flat > 1000) problems.push('The per-ticket fee must be between ₹0 and ₹1,000.');
  if (form.cap !== '' && (!isNumber(form.cap) || form.cap < 0 || form.cap > 10_000)) problems.push('The cap must be between ₹0 and ₹10,000, or empty.');

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  return (
    <Card>
      <CardHeader
        title="Convenience fees"
        description="Charged on top of the ticket price. Both parts apply together."
      />
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        <TextField
          label="Percentage of ticket price"
          type="number"
          step="0.01"
          value={form.percent}
          onChange={(event) => setForm({ ...form, percent: event.target.value })}
          hint="e.g. 2.5 for 2.5%"
        />
        <TextField
          label="Flat amount per ticket"
          type="number"
          step="0.01"
          prefix="₹"
          value={form.flat}
          onChange={(event) => setForm({ ...form, flat: event.target.value })}
        />
        <TextField
          label="Cap per booking"
          type="number"
          step="0.01"
          prefix="₹"
          value={form.cap}
          onChange={(event) => setForm({ ...form, cap: event.target.value })}
          hint="Optional. Empty for no cap."
        />
      </div>
      <SectionFooter
        problems={problems}
        dirty={dirty}
        onSave={() =>
          save.setPending({
            fees: {
              percentBasisPoints: toBasisPoints(form.percent),
              flatPerTicketPaise: toPaise(form.flat),
              capPerBookingPaise: form.cap === '' ? null : toPaise(form.cap),
            },
          })
        }
      />
      <ConfirmDialog
        open={Boolean(save.pending)}
        onClose={() => save.setPending(null)}
        onConfirm={save.confirm}
        loading={save.saving}
        variant="brand"
        title="Change convenience fees?"
        description={`New bookings will be charged ${form.percent}% plus ₹${form.flat} per ticket${form.cap !== '' ? `, capped at ₹${form.cap} per booking` : ''}. Existing bookings are unaffected.`}
        confirmLabel="Save fees"
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------

function TaxSection({ settings, onSaved }) {
  const toRow = (component) => ({
    id: crypto.randomUUID(),
    name: component.name,
    rate: String(toPercent(component.rateBasisPoints)),
    above: String(toRupees(component.appliesAbovePaise)),
    appliesTo: component.appliesTo ?? 'ticket',
  });
  const initialRows = (settings.taxComponents ?? []).map(toRow);
  const [rows, setRows] = useState(initialRows);
  const save = useSectionSave(onSaved, 'Tax settings saved.');

  const strip = (list) => list.map(({ id, ...rest }) => rest);
  const dirty = JSON.stringify(strip(rows)) !== JSON.stringify(strip(initialRows));

  const problems = [];
  rows.forEach((row) => {
    if (!row.name.trim()) problems.push('Every tax component needs a name.');
    if (!isNumber(row.rate) || row.rate < 0 || row.rate > 100) problems.push(`${row.name || 'A component'}: rate must be 0–100%.`);
    if (!isNumber(row.above) || row.above < 0) problems.push(`${row.name || 'A component'}: threshold must be ₹0 or more.`);
  });
  if (new Set(rows.map((row) => row.name.trim().toLowerCase())).size !== rows.length) {
    problems.push('Two components share a name.');
  }

  const update = (id, field, value) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  return (
    <Card>
      <CardHeader
        title="Tax"
        description="No rate is assumed. Configure each component that applies — for example CGST and SGST — and the ticket price from which it applies."
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={rows.length >= 10}
            onClick={() =>
              setRows((current) => [
                ...current,
                { id: crypto.randomUUID(), name: '', rate: '0', above: '0', appliesTo: 'ticket' },
              ])
            }
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add component
          </Button>
        }
      />
      <div className="p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-500">No tax is being charged.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row, index) => (
              <li key={row.id} className="grid items-end gap-2.5 sm:grid-cols-[1.4fr_0.8fr_1fr_1.2fr_auto]">
                <TextField
                  label={index === 0 ? 'Name' : undefined}
                  value={row.name}
                  placeholder="CGST"
                  onChange={(event) => update(row.id, 'name', event.target.value)}
                />
                <TextField
                  label={index === 0 ? 'Rate %' : undefined}
                  type="number"
                  step="0.01"
                  value={row.rate}
                  onChange={(event) => update(row.id, 'rate', event.target.value)}
                />
                <TextField
                  label={index === 0 ? 'From ticket price' : undefined}
                  type="number"
                  step="0.01"
                  prefix="₹"
                  value={row.above}
                  onChange={(event) => update(row.id, 'above', event.target.value)}
                />
                <Select
                  label={index === 0 ? 'Applies to' : undefined}
                  value={row.appliesTo}
                  onChange={(event) => update(row.id, 'appliesTo', event.target.value)}
                  options={[
                    { value: 'ticket', label: 'Ticket price' },
                    { value: 'fees', label: 'Fees only' },
                    { value: 'ticket_and_fees', label: 'Ticket and fees' },
                  ]}
                />
                <IconButton
                  variant="danger-quiet"
                  icon={Trash2}
                  label={`Remove ${row.name || 'this component'}`}
                  onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-ink-500">
          The threshold is tested per ticket, after any discount. Check current rates with a tax
          professional; the platform charges exactly what is configured here.
        </p>
      </div>
      <SectionFooter
        problems={problems}
        dirty={dirty}
        onSave={() =>
          save.setPending({
            taxComponents: rows.map((row) => ({
              name: row.name.trim(),
              rateBasisPoints: toBasisPoints(row.rate),
              appliesAbovePaise: toPaise(row.above),
              appliesTo: row.appliesTo,
            })),
          })
        }
      />
      <ConfirmDialog
        open={Boolean(save.pending)}
        onClose={() => save.setPending(null)}
        onConfirm={save.confirm}
        loading={save.saving}
        variant="brand"
        title="Change tax settings?"
        description={
          rows.length === 0
            ? 'New bookings will be charged no tax at all. Existing bookings are unaffected.'
            : `New bookings will be charged: ${rows.map((row) => `${row.name} ${row.rate}%`).join(', ')}. Existing bookings are unaffected.`
        }
        confirmLabel="Save tax"
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CancellationSection({ settings, onSaved }) {
  const cancellation = settings.cancellation ?? {};
  const toRow = (rule) => ({
    id: crypto.randomUUID(),
    label: rule.label,
    hours: String(rule.minHoursBeforeShow),
    percent: String(toPercent(rule.refundPercentBasisPoints)),
    refundFees: Boolean(rule.refundFees),
  });
  const initial = {
    enabled: cancellation.enabled !== false,
    grace: String(cancellation.graceWindowMinutes ?? 0),
    rules: (cancellation.rules ?? []).map(toRow),
  };
  const [form, setForm] = useState(initial);
  const save = useSectionSave(onSaved, 'Cancellation policy saved.');

  const strip = (value) => ({ ...value, rules: value.rules.map(({ id, ...rest }) => rest) });
  const dirty = JSON.stringify(strip(form)) !== JSON.stringify(strip(initial));

  const problems = [];
  if (!isNumber(form.grace) || form.grace < 0 || form.grace > 10_080) problems.push('The grace window must be 0 to 10,080 minutes.');
  if (form.rules.length === 0) problems.push('Keep at least one rule.');
  form.rules.forEach((rule) => {
    if (!rule.label.trim()) problems.push('Every rule needs a label.');
    if (!isNumber(rule.hours) || rule.hours < 0) problems.push(`${rule.label || 'A rule'}: hours must be 0 or more.`);
    if (!isNumber(rule.percent) || rule.percent < 0 || rule.percent > 100) problems.push(`${rule.label || 'A rule'}: refund must be 0–100%.`);
  });

  const update = (id, field, value) =>
    setForm((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule)),
    }));

  const sorted = [...form.rules].sort((a, b) => Number(b.hours) - Number(a.hours));

  return (
    <Card>
      <CardHeader
        title="Cancellation and refunds"
        description="What a customer gets back when they cancel. Applied by the server at the moment they cancel."
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={form.rules.length >= 10}
            onClick={() =>
              setForm((current) => ({
                ...current,
                rules: [
                  ...current.rules,
                  { id: crypto.randomUUID(), label: '', hours: '0', percent: '0', refundFees: false },
                ],
              }))
            }
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add rule
          </Button>
        }
      />
      <div className="space-y-5 p-5">
        <Checkbox
          label="Customers may cancel"
          hint="Off means no cancellations at all, from any booking."
          checked={form.enabled}
          onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
        />

        <div className="max-w-xs">
          <TextField
            label="Grace window after booking"
            type="number"
            value={form.grace}
            onChange={(event) => setForm({ ...form, grace: event.target.value })}
            hint="Minutes. Cancelling within this window refunds in full, whatever the rules below say."
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink-700">Rules</p>
          <ul className="space-y-3">
            {form.rules.map((rule, index) => (
              <li key={rule.id} className="grid items-end gap-2.5 sm:grid-cols-[1.5fr_1fr_1fr_auto_auto]">
                <TextField
                  label={index === 0 ? 'Label' : undefined}
                  value={rule.label}
                  placeholder="A day ahead"
                  onChange={(event) => update(rule.id, 'label', event.target.value)}
                />
                <TextField
                  label={index === 0 ? 'At least hours before' : undefined}
                  type="number"
                  value={rule.hours}
                  onChange={(event) => update(rule.id, 'hours', event.target.value)}
                />
                <TextField
                  label={index === 0 ? 'Refund %' : undefined}
                  type="number"
                  step="0.01"
                  value={rule.percent}
                  onChange={(event) => update(rule.id, 'percent', event.target.value)}
                />
                <div className="pb-2.5">
                  <Checkbox
                    label="Refund fees"
                    checked={rule.refundFees}
                    onChange={(event) => update(rule.id, 'refundFees', event.target.checked)}
                  />
                </div>
                <IconButton
                  variant="danger-quiet"
                  icon={Trash2}
                  label={`Remove ${rule.label || 'this rule'}`}
                  disabled={form.rules.length <= 1}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      rules: current.rules.filter((item) => item.id !== rule.id),
                    }))
                  }
                />
              </li>
            ))}
          </ul>
        </div>

        {sorted.length > 0 && problems.length === 0 && (
          <div className="rounded-lg bg-ink-50 px-3.5 py-3 text-sm text-ink-700">
            <p className="font-medium text-ink-900">How this reads to a customer</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              {Number(form.grace) > 0 && (
                <li>Cancel within {form.grace} minutes of booking: full refund.</li>
              )}
              {sorted.map((rule) => (
                <li key={rule.id}>
                  {rule.hours} or more hours before the show: {rule.percent}% of the ticket price
                  {rule.refundFees ? ', fees included' : ', fees kept'}.
                </li>
              ))}
              {!sorted.some((rule) => Number(rule.hours) === 0) && (
                <li>Later than that: no refund.</li>
              )}
            </ul>
          </div>
        )}
      </div>
      <SectionFooter
        problems={problems}
        dirty={dirty}
        onSave={() =>
          save.setPending({
            cancellation: {
              enabled: form.enabled,
              graceWindowMinutes: Math.round(Number(form.grace)),
              rules: form.rules.map((rule) => ({
                label: rule.label.trim(),
                minHoursBeforeShow: Number(rule.hours),
                refundPercentBasisPoints: toBasisPoints(rule.percent),
                refundFees: rule.refundFees,
              })),
            },
          })
        }
      />
      <ConfirmDialog
        open={Boolean(save.pending)}
        onClose={() => save.setPending(null)}
        onConfirm={save.confirm}
        loading={save.saving}
        variant="brand"
        title="Change the refund policy?"
        description="This decides how much money customers get back. It applies to every cancellation from now on — including cancellations of bookings made before the change."
        confirmLabel="Save policy"
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------

function HoldSection({ settings, onSaved }) {
  const initial = {
    ttl: String(settings.seatHold?.ttlMinutes ?? 10),
    max: String(settings.seatHold?.maxSeatsPerBooking ?? 10),
  };
  const [form, setForm] = useState(initial);
  const save = useSectionSave(onSaved, 'Seat-hold settings saved.');

  const problems = [];
  if (!isNumber(form.ttl) || form.ttl < 1 || form.ttl > 60 || !Number.isInteger(Number(form.ttl))) problems.push('Hold time must be a whole number from 1 to 60 minutes.');
  if (!isNumber(form.max) || form.max < 1 || form.max > 40 || !Number.isInteger(Number(form.max))) problems.push('Seats per booking must be a whole number from 1 to 40.');
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  return (
    <Card>
      <CardHeader
        title="Seat holds"
        description="How long seats stay reserved while a customer pays, and how many one booking may take."
      />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <TextField
          label="Hold time"
          type="number"
          value={form.ttl}
          onChange={(event) => setForm({ ...form, ttl: event.target.value })}
          hint="Minutes. Too short and people lose seats mid-payment; too long and seats sit idle."
        />
        <TextField
          label="Seats per booking"
          type="number"
          value={form.max}
          onChange={(event) => setForm({ ...form, max: event.target.value })}
        />
      </div>
      <SectionFooter
        problems={problems}
        dirty={dirty}
        onSave={() =>
          save.setPending({
            seatHold: { ttlMinutes: Number(form.ttl), maxSeatsPerBooking: Number(form.max) },
          })
        }
      />
      <ConfirmDialog
        open={Boolean(save.pending)}
        onClose={() => save.setPending(null)}
        onConfirm={save.confirm}
        loading={save.saving}
        variant="brand"
        title="Change seat-hold limits?"
        description={`New holds will last ${form.ttl} minutes and allow up to ${form.max} seats. Holds already running keep their original expiry.`}
        confirmLabel="Save"
      />
    </Card>
  );
}
