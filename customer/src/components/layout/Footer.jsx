import { Link } from 'react-router-dom';
import { Clapperboard } from 'lucide-react';

export function Footer() {
  return (
    <footer className="no-print mt-auto border-t border-slate-line bg-midnight-raised">
      <div className="page-shell py-12">
        {/* φ: the brand column takes roughly 1.618 of each link column. */}
        <div className="grid gap-10 md:grid-cols-[1.618fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <Clapperboard className="size-5 text-amber-brand" aria-hidden="true" />
              <span className="font-display text-base font-semibold text-ivory">CineReserve</span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ivory-muted">
              Find what is showing near you and book your seat in a few taps.
            </p>
          </div>

          <nav aria-label="Browse">
            <h2 className="mb-3 font-sans text-xs font-semibold uppercase tracking-wider text-ivory-muted">
              Browse
            </h2>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/movies" className="text-ivory-dim transition hover:text-amber-bright">
                  All movies
                </Link>
              </li>
              <li>
                <Link to="/shows" className="text-ivory-dim transition hover:text-amber-bright">
                  What&rsquo;s on
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Account">
            <h2 className="mb-3 font-sans text-xs font-semibold uppercase tracking-wider text-ivory-muted">
              Account
            </h2>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link to="/my-bookings" className="text-ivory-dim transition hover:text-amber-bright">
                  My bookings
                </Link>
              </li>
              <li>
                <Link to="/profile" className="text-ivory-dim transition hover:text-amber-bright">
                  Profile
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 border-t border-slate-line pt-6">
          <p className="text-xs text-ivory-muted">
            &copy; {new Date().getFullYear()} CineReserve. A portfolio project.
          </p>
        </div>
      </div>
    </footer>
  );
}
