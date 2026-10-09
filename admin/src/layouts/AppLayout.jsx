import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { MobileSidebar, Sidebar } from '../components/layout/Sidebar.jsx';
import { Topbar } from '../components/layout/Topbar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { humanize } from '../utils/format.js';

const COLLAPSED_KEY = 'cinereserve.console.sidebarCollapsed';

/**
 * Reads the remembered rail state.
 *
 * Wrapped because `localStorage` throws in a private window with site data
 * blocked, and a console that will not render because it could not read a
 * cosmetic preference is a worse bug than an un-remembered sidebar.
 */
function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const { operatingBlocked, showRunner } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      // A preference that cannot be stored is not worth reporting.
    }
  }, [collapsed]);

  // Moving to another page should not leave the drawer sitting open behind it.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-ink-50">
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((prev) => !prev)} />
      <MobileSidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />

        {/*
          A runner whose operating rights were suspended or revoked keeps the
          role and the session, so the console still loads. Saying so here is
          better than letting every page fail with a forbidden error and
          leaving them to guess why.
        */}
        {operatingBlocked && (
          <div
            className="flex items-start gap-2.5 border-b border-bad/25 bg-bad-soft px-4 py-3 sm:px-6"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
            <p className="text-sm text-ink-800">
              <span className="font-medium">
                Your show-runner access is {humanize(showRunner?.status).toLowerCase()}.
              </span>{' '}
              {showRunner?.statusReason
                ? showRunner.statusReason
                : 'Operational pages will be refused until a platform administrator reinstates it.'}
            </p>
          </div>
        )}

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[90rem]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
