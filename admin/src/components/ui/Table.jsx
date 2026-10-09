import { Skeleton } from './States.jsx';

/**
 * A plain table, wrapped so it scrolls horizontally inside its card instead of
 * widening the page. A console table has eight or nine columns and must stay
 * readable on a laptop without the whole layout acquiring a sideways scrollbar.
 */
export function Table({ children, className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }) {
  return (
    <thead className="border-b border-ink-200 bg-ink-50/70">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({ children, align = 'left', className = '', ...props }) {
  const alignment = { left: 'text-left', right: 'text-right', center: 'text-center' }[align];
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 ${alignment} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function TBody({ children }) {
  return <tbody className="divide-y divide-ink-100">{children}</tbody>;
}

export function TR({ children, onClick, className = '', ...props }) {
  const interactive = typeof onClick === 'function';
  return (
    <tr
      onClick={onClick}
      // A clickable row is reachable and operable by keyboard, not mouse-only.
      tabIndex={interactive ? 0 : undefined}
      role={interactive ? 'button' : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick(event);
              }
            }
          : undefined
      }
      className={[
        'transition-colors',
        interactive ? 'cursor-pointer hover:bg-ink-50 focus-visible:bg-ink-50' : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TD({ children, align = 'left', className = '', ...props }) {
  const alignment = { left: 'text-left', right: 'text-right', center: 'text-center' }[align];
  return (
    <td className={`px-4 py-3 text-ink-800 ${alignment} ${className}`} {...props}>
      {children}
    </td>
  );
}

/** Rows of shimmer, shaped like the table that is coming. */
export function TableSkeleton({ columns = 5, rows = 6 }) {
  return (
    <TBody>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <td key={column} className="px-4 py-3.5">
              <Skeleton className={`h-3.5 ${column === 0 ? 'w-32' : 'w-20'}`} />
            </td>
          ))}
        </tr>
      ))}
    </TBody>
  );
}

/** A full-width cell for an empty or failed table body. */
export function TableMessage({ columns, children }) {
  return (
    <TBody>
      <tr>
        <td colSpan={columns} className="px-4 py-12">
          {children}
        </td>
      </tr>
    </TBody>
  );
}
