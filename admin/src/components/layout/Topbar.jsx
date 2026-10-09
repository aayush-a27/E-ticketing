import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, ShieldCheck, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { humanize, initials } from '../../utils/format.js';
import { Badge } from '../ui/Badge.jsx';

function AccountMenu() {
  const { user, showRunner, isSuperAdmin, logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef(null);

  // Close on an outside click or Escape, which is what a menu is expected to do.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } catch (error) {
      toast.fromError(error, 'Could not sign out.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-ink-100"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">
          {initials(user?.name)}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-medium text-ink-900">{user?.name}</span>
          <span className="block truncate text-[11px] text-ink-500">
            {isSuperAdmin ? 'Platform admin' : (showRunner?.businessName ?? 'Show runner')}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-500" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-overlay"
        >
          <div className="border-b border-ink-100 px-3.5 py-3">
            <p className="truncate text-sm font-medium text-ink-900">{user?.name}</p>
            {/* The operator's own address, which is theirs to see in full. */}
            <p className="truncate text-xs text-ink-500">{user?.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={isSuperAdmin ? 'brand' : 'info'}>{humanize(user?.role)}</Badge>
              {showRunner && (
                <Badge tone={showRunner.status === 'active' ? 'good' : 'bad'}>
                  {humanize(showRunner.status)}
                </Badge>
              )}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={onSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-60"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onOpenNav }) {
  const { isSuperAdmin, showRunner } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 bg-white/90 px-3 backdrop-blur sm:px-5">
      <button
        type="button"
        onClick={onOpenNav}
        className="rounded-lg p-2 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-4.5" aria-hidden="true" />
      </button>

      {/*
        Which scope the operator is working in, stated rather than assumed.
        On this console the difference between "the platform" and "my venues"
        changes what every number on screen means.
      */}
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {isSuperAdmin ? (
          <>
            <ShieldCheck className="size-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="truncate text-ink-600">Platform-wide</span>
          </>
        ) : (
          <>
            <Store className="size-4 shrink-0 text-info" aria-hidden="true" />
            <span className="truncate text-ink-600">
              {showRunner?.businessName ?? 'Your venues'}
            </span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <AccountMenu />
      </div>
    </header>
  );
}
