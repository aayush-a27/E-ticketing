import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Clapperboard, LogOut, Menu, Search, Ticket, User, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { CitySelector } from './CitySelector.jsx';
import { Button } from '../common/Button.jsx';
import { initials } from '../../utils/format.js';

const NAV_LINKS = [
  { to: '/movies', label: 'Movies' },
  { to: '/shows', label: "What's on" },
];

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState('');
  const accountRef = useRef(null);

  // Any navigation closes whatever was open.
  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const onPointerDown = (event) => {
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [accountOpen]);

  const onSearch = (event) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    navigate(`/movies?search=${encodeURIComponent(term)}`);
    setQuery('');
  };

  const onLogout = async () => {
    await logout();
    toast.success('Signed out');
    navigate('/');
  };

  const linkClass = ({ isActive }) =>
    [
      'relative text-sm font-medium transition-colors',
      isActive ? 'text-amber-bright' : 'text-ivory-dim hover:text-ivory',
    ].join(' ');

  return (
    <header className="sticky top-0 z-50 border-b border-slate-line/70 bg-midnight/85 backdrop-blur-xl">
      <nav className="page-shell flex h-16 items-center gap-4" aria-label="Main">
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="CineReserve home">
          <Clapperboard className="size-6 text-amber-brand" aria-hidden="true" />
          <span className="font-display text-lg font-semibold tracking-tight text-ivory">
            CineReserve
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </div>

        <form onSubmit={onSearch} className="ml-auto hidden max-w-xs flex-1 lg:block" role="search">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ivory-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search movies"
              aria-label="Search movies"
              className="neu-inset h-10 w-full rounded-full pl-10 pr-4 text-sm text-ivory placeholder:text-ivory-muted/60"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <div className="hidden sm:block">
            <CitySelector />
          </div>

          {isAuthenticated ? (
            <div className="relative hidden md:block" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((value) => !value)}
                className="neu neu-pressable flex size-10 items-center justify-center rounded-full text-sm font-semibold text-amber-bright"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label="Account menu"
              >
                {initials(user?.name ?? '')}
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="card-surface absolute right-0 mt-2 w-56 overflow-hidden p-1.5 shadow-2xl"
                >
                  <div className="border-b border-slate-line px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-ivory">{user?.name}</p>
                    <p className="truncate text-xs text-ivory-muted">{user?.email}</p>
                  </div>

                  <Link
                    to="/my-bookings"
                    role="menuitem"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ivory-dim transition hover:bg-charcoal-soft hover:text-ivory"
                  >
                    <Ticket className="size-4" aria-hidden="true" />
                    My bookings
                  </Link>
                  <Link
                    to="/profile"
                    role="menuitem"
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ivory-dim transition hover:bg-charcoal-soft hover:text-ivory"
                  >
                    <User className="size-4" aria-hidden="true" />
                    Profile
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-ivory-dim transition hover:bg-charcoal-soft hover:text-status-bad"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button as={Link} to="/login" variant="ghost" size="sm">
                Sign in
              </Button>
              <Button as={Link} to="/register" size="sm">
                Sign up
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="neu neu-pressable flex size-10 items-center justify-center rounded-full text-ivory md:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div
          id="mobile-menu"
          className="border-t border-slate-line bg-midnight-raised px-4 py-4 md:hidden"
        >
          <form onSubmit={onSearch} className="mb-4" role="search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ivory-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search movies"
                aria-label="Search movies"
                className="neu-inset h-11 w-full rounded-full pl-10 pr-4 text-sm text-ivory"
              />
            </div>
          </form>

          <div className="mb-4 sm:hidden">
            <CitySelector />
          </div>

          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  [
                    'rounded-lg px-3 py-3 text-sm font-medium transition',
                    isActive
                      ? 'bg-charcoal-soft text-amber-bright'
                      : 'text-ivory-dim hover:bg-charcoal-soft hover:text-ivory',
                  ].join(' ')
                }
              >
                {link.label}
              </NavLink>
            ))}

            {isAuthenticated ? (
              <>
                <NavLink
                  to="/my-bookings"
                  className="rounded-lg px-3 py-3 text-sm font-medium text-ivory-dim transition hover:bg-charcoal-soft hover:text-ivory"
                >
                  My bookings
                </NavLink>
                <NavLink
                  to="/profile"
                  className="rounded-lg px-3 py-3 text-sm font-medium text-ivory-dim transition hover:bg-charcoal-soft hover:text-ivory"
                >
                  Profile
                </NavLink>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-lg px-3 py-3 text-left text-sm font-medium text-status-bad transition hover:bg-charcoal-soft"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="mt-3 flex gap-2">
                <Button as={Link} to="/login" variant="outline" className="flex-1">
                  Sign in
                </Button>
                <Button as={Link} to="/register" className="flex-1">
                  Sign up
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
