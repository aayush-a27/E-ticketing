import { Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { LoadingBlock } from '../components/common/States.jsx';

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* First stop for keyboard users, before the whole nav. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-amber-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-midnight"
      >
        Skip to content
      </a>

      <Navbar />

      <main id="main" className="flex-1">
        <Suspense fallback={<LoadingBlock label="Loading page" />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />
      <ScrollRestoration />
    </div>
  );
}
