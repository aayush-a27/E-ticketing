import { useMemo, useState } from 'react';
import { AlertCircle, Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../ui/Button.jsx';
import { Card, CardHeader } from '../ui/Layout.jsx';
import { Checkbox, Select, TextField } from '../ui/Field.jsx';
import { count, pluralize } from '../../utils/format.js';

const DEFAULT_COLORS = ['#9BA3B4', '#D4A24C', '#4CA97D', '#7B8FD4', '#C4789B'];

const ROW_LABELS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split(''); // no I or O

function emptyRow(index, category) {
  return {
    id: crypto.randomUUID(),
    label: ROW_LABELS[index] ?? `R${index + 1}`,
    seats: 10,
    category,
  };
}

/**
 * Builds a seat layout from row definitions and shows what it will look like.
 *
 * A layout is described rather than drawn seat by seat: rows, how many seats
 * each has, which price category it belongs to, and where the centre aisle
 * falls. That covers how cinema rooms are actually laid out, and it is
 * validated before anything is sent.
 *
 * Individual seats can then be switched out in the preview — a pillar, a
 * wheelchair space, a broken recliner. Those keep their position in the grid
 * but are not sold, which is what `isActive: false` means to the server.
 *
 * What this is not: a free-form canvas where seats are dragged to arbitrary
 * positions. Curved rows, boxes and staggered seating cannot be expressed
 * here. That is the remaining work, and it is noted rather than pretended.
 */
export function LayoutBuilder({ screen, onSubmit, onCancel, submitting }) {
  const [categories, setCategories] = useState([
    { id: crypto.randomUUID(), name: 'Silver', color: DEFAULT_COLORS[0] },
    { id: crypto.randomUUID(), name: 'Gold', color: DEFAULT_COLORS[1] },
  ]);

  const [rows, setRows] = useState(() => [
    emptyRow(0, 'Silver'),
    emptyRow(1, 'Silver'),
    emptyRow(2, 'Gold'),
    emptyRow(3, 'Gold'),
  ]);

  const [aisleAfter, setAisleAfter] = useState(5);
  const [activate, setActivate] = useState(!screen.activeLayoutVersion);
  // seatId -> true, for seats switched out of sale.
  const [disabled, setDisabled] = useState({});

  const categoryNames = categories.map((category) => category.name.trim()).filter(Boolean);

  const seats = useMemo(() => {
    const built = [];
    rows.forEach((row, y) => {
      const total = Number(row.seats) || 0;
      for (let number = 1; number <= total; number += 1) {
        // The aisle is a skipped grid column, which is what makes a preview
        // read as a real room rather than a solid block.
        const x = aisleAfter > 0 && number > aisleAfter ? number + 1 : number;
        const seatId = `${row.label}${number}`;
        built.push({
          seatId,
          row: row.label,
          number,
          label: seatId,
          category: row.category,
          x,
          y,
          kind: 'seat',
          isActive: !disabled[seatId],
        });
      }
    });
    return built;
  }, [rows, aisleAfter, disabled]);

  /**
   * The same checks the server runs, so a layout is not rejected after the
   * operator has spent five minutes on it. The server still decides.
   */
  const problems = useMemo(() => {
    const found = [];

    if (categoryNames.length === 0) found.push('Define at least one seat category.');
    if (new Set(categoryNames).size !== categoryNames.length) {
      found.push('Two categories share a name.');
    }
    if (rows.length === 0) found.push('Add at least one row.');

    const labels = rows.map((row) => row.label.trim().toUpperCase());
    if (new Set(labels).size !== labels.length) found.push('Two rows share a label.');
    if (labels.some((label) => !label)) found.push('Every row needs a label.');

    for (const row of rows) {
      const total = Number(row.seats);
      if (!total || total < 1) found.push(`Row ${row.label} has no seats.`);
      if (total > 100) found.push(`Row ${row.label} has more than 100 seats.`);
      if (!categoryNames.includes(row.category)) {
        found.push(`Row ${row.label} uses an undefined category.`);
      }
    }

    const ids = seats.map((seat) => seat.seatId);
    if (new Set(ids).size !== ids.length) found.push('Two seats share an id.');

    const positions = seats.map((seat) => `${seat.x}:${seat.y}`);
    if (new Set(positions).size !== positions.length) {
      found.push('Two seats share a grid position.');
    }

    if (seats.length > 2000) found.push('A layout may hold at most 2000 seats.');
    if (seats.every((seat) => !seat.isActive)) {
      found.push('At least one seat must be available for sale.');
    }

    return found;
  }, [categoryNames, rows, seats]);

  const bookable = seats.filter((seat) => seat.isActive).length;
  const widest = seats.reduce((max, seat) => Math.max(max, seat.x), 0);

  const colorFor = (name) =>
    categories.find((category) => category.name === name)?.color ?? '#cbd5e1';

  const submit = () => {
    onSubmit({
      categories: categories
        .filter((category) => category.name.trim())
        .map((category, index) => ({
          name: category.name.trim(),
          displayOrder: index + 1,
          color: category.color,
        })),
      seats,
      activate,
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Seat categories"
          description="Each one is priced separately when a show is scheduled."
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={categories.length >= 10}
              onClick={() =>
                setCategories((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    name: '',
                    color: DEFAULT_COLORS[current.length % DEFAULT_COLORS.length],
                  },
                ])
              }
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add
            </Button>
          }
        />
        <ul className="space-y-2.5 p-5">
          {categories.map((category, index) => (
            <li key={category.id} className="flex items-end gap-2.5">
              <TextField
                label={index === 0 ? 'Name' : undefined}
                className="flex-1"
                placeholder="Recliner"
                value={category.name}
                onChange={(event) =>
                  setCategories((current) =>
                    current.map((item) =>
                      item.id === category.id ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <div>
                {index === 0 && (
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">Colour</span>
                )}
                <input
                  type="color"
                  aria-label={`Colour for ${category.name || 'this category'}`}
                  value={category.color}
                  onChange={(event) =>
                    setCategories((current) =>
                      current.map((item) =>
                        item.id === category.id ? { ...item, color: event.target.value } : item,
                      ),
                    )
                  }
                  className="h-10 w-14 cursor-pointer rounded-lg border border-ink-200 bg-white p-1"
                />
              </div>
              <IconButton
                variant="danger-quiet"
                icon={Trash2}
                label={`Remove category ${category.name || index + 1}`}
                disabled={categories.length <= 1}
                onClick={() =>
                  setCategories((current) => current.filter((item) => item.id !== category.id))
                }
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Rows"
          description="Front of the room first. Row labels skip I and O, which are misread aloud."
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={rows.length >= 40}
              onClick={() =>
                setRows((current) => [
                  ...current,
                  emptyRow(current.length, categoryNames[0] ?? ''),
                ])
              }
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add row
            </Button>
          }
        />
        <div className="p-5">
          <div className="mb-4 max-w-xs">
            <TextField
              label="Aisle after seat"
              type="number"
              hint="0 for no aisle. Leaves a gap in every row at this position."
              value={aisleAfter}
              onChange={(event) => setAisleAfter(Math.max(0, Number(event.target.value) || 0))}
            />
          </div>

          <ul className="space-y-2.5">
            {rows.map((row, index) => (
              <li key={row.id} className="flex items-end gap-2.5">
                <TextField
                  label={index === 0 ? 'Label' : undefined}
                  className="w-20"
                  value={row.label}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id
                          ? { ...item, label: event.target.value.toUpperCase().slice(0, 4) }
                          : item,
                      ),
                    )
                  }
                />
                <TextField
                  label={index === 0 ? 'Seats' : undefined}
                  type="number"
                  className="w-24"
                  value={row.seats}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id ? { ...item, seats: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Select
                  label={index === 0 ? 'Category' : undefined}
                  className="flex-1"
                  value={row.category}
                  options={categoryNames.map((name) => ({ value: name, label: name }))}
                  placeholder="Pick one"
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id ? { ...item, category: event.target.value } : item,
                      ),
                    )
                  }
                />
                <IconButton
                  variant="danger-quiet"
                  icon={Trash2}
                  label={`Remove row ${row.label}`}
                  disabled={rows.length <= 1}
                  onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                />
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Preview"
          description="Click a seat to take it out of sale. It keeps its place in the room."
          actions={
            Object.keys(disabled).length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setDisabled({})}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Restore {count(Object.keys(disabled).length)}
              </Button>
            )
          }
        />
        <div className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {categories
              .filter((category) => category.name.trim())
              .map((category) => (
                <span key={category.id} className="flex items-center gap-1.5 text-xs text-ink-600">
                  <span
                    className="size-3 rounded-sm"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  {category.name}
                </span>
              ))}
            <span className="flex items-center gap-1.5 text-xs text-ink-600">
              <span
                className="size-3 rounded-sm border border-dashed border-ink-400 bg-white"
                aria-hidden="true"
              />
              Out of sale
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg bg-ink-50 p-4">
            <div className="mx-auto mb-4 h-1.5 w-2/3 min-w-40 rounded-full bg-ink-300" />
            <p className="mb-4 text-center text-[10px] uppercase tracking-widest text-ink-400">
              Screen
            </p>

            {seats.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">
                Add a row to see the room.
              </p>
            ) : (
              <div
                className="mx-auto grid w-fit gap-1"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(widest, 1)}, 1.25rem)`,
                  gridTemplateRows: `repeat(${rows.length}, 1.25rem)`,
                }}
              >
                {seats.map((seat) => (
                  <button
                    key={seat.seatId}
                    type="button"
                    onClick={() =>
                      setDisabled((current) => {
                        const next = { ...current };
                        if (next[seat.seatId]) delete next[seat.seatId];
                        else next[seat.seatId] = true;
                        return next;
                      })
                    }
                    title={`${seat.label} · ${seat.category}${seat.isActive ? '' : ' · out of sale'}`}
                    aria-label={`${seat.label}, ${seat.category}, ${
                      seat.isActive ? 'for sale' : 'out of sale'
                    }`}
                    aria-pressed={!seat.isActive}
                    className={`size-5 rounded-sm text-[8px] leading-none transition-transform hover:scale-110 ${
                      seat.isActive ? 'text-white/80' : 'border border-dashed border-ink-400'
                    }`}
                    style={{
                      gridColumn: seat.x,
                      gridRow: seat.y + 1,
                      backgroundColor: seat.isActive ? colorFor(seat.category) : '#fff',
                    }}
                  >
                    {seat.number}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="mt-3 text-sm text-ink-600">
            {pluralize(rows.length, 'row')} ·{' '}
            <span className="font-medium text-ink-900">{pluralize(bookable, 'bookable seat')}</span>
            {seats.length !== bookable && ` · ${count(seats.length - bookable)} out of sale`}
          </p>
        </div>
      </Card>

      {problems.length > 0 && (
        <div className="rounded-lg border border-bad/25 bg-bad-soft px-4 py-3" role="alert">
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
            <AlertCircle className="size-4 text-bad" aria-hidden="true" />
            Fix these before saving
          </p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-ink-700">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <div className="space-y-4 p-5">
          <Checkbox
            label="Make this the screen's active layout"
            hint={
              screen.activeLayoutVersion
                ? `Replaces version ${screen.activeLayoutVersion}. The server refuses while upcoming published shows still use it, so those shows keep meaning what they meant.`
                : 'This screen has no layout yet, so it needs one before shows can run.'
            }
            checked={activate}
            onChange={(event) => setActivate(event.target.checked)}
          />

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <Button variant="secondary" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting} disabled={problems.length > 0}>
              <Check className="size-4" aria-hidden="true" />
              Save layout
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** A read-only view of a stored layout version. */
export function LayoutPreview({ layout }) {
  const seats = layout?.seats ?? [];
  const widest = seats.reduce((max, seat) => Math.max(max, seat.x), 0);
  const tallest = seats.reduce((max, seat) => Math.max(max, seat.y), 0);

  const colorFor = (name) =>
    layout?.categories?.find((category) => category.name === name)?.color ?? '#cbd5e1';

  if (seats.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-500">This version has no seats.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {layout.categories?.map((category) => (
          <span key={category.name} className="flex items-center gap-1.5 text-xs text-ink-600">
            <span
              className="size-3 rounded-sm"
              style={{ backgroundColor: category.color ?? '#cbd5e1' }}
              aria-hidden="true"
            />
            {category.name}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg bg-ink-50 p-4">
        <div className="mx-auto mb-4 h-1.5 w-2/3 min-w-40 rounded-full bg-ink-300" />
        <p className="mb-4 text-center text-[10px] uppercase tracking-widest text-ink-400">
          Screen
        </p>
        <div
          className="mx-auto grid w-fit gap-1"
          style={{
            gridTemplateColumns: `repeat(${Math.max(widest, 1)}, 1.25rem)`,
            gridTemplateRows: `repeat(${tallest + 1}, 1.25rem)`,
          }}
        >
          {seats.map((seat) => {
            const forSale = (seat.kind ?? 'seat') === 'seat' && seat.isActive !== false;
            return (
              <span
                key={seat.seatId}
                title={`${seat.label} · ${seat.category}${forSale ? '' : ' · out of sale'}`}
                className={`flex size-5 items-center justify-center rounded-sm text-[8px] leading-none ${
                  forSale ? 'text-white/80' : 'border border-dashed border-ink-400 text-ink-400'
                }`}
                style={{
                  gridColumn: seat.x,
                  gridRow: seat.y + 1,
                  backgroundColor: forSale ? colorFor(seat.category) : '#fff',
                }}
              >
                {seat.number}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
