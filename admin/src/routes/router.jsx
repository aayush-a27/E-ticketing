import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute.jsx';
import { FullPageLoader, LoadingBlock } from '../components/ui/States.jsx';

/**
 * Routes are split per page, so opening the console downloads the shell and
 * the page being viewed rather than every screen in the product.
 */
const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const DashboardPage = lazy(() => import('../pages/DashboardPage.jsx'));
const NoAccessPage = lazy(() => import('../pages/NoAccessPage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));

/** Inside the shell, where the sidebar is already on screen. */
function Page({ children }) {
  return <Suspense fallback={<LoadingBlock />}>{children}</Suspense>;
}

/** Standalone, where there is no shell yet. */
function Standalone({ children }) {
  return <Suspense fallback={<FullPageLoader label="Loading" />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicOnlyRoute>
        <Standalone>
          <LoginPage />
        </Standalone>
      </PublicOnlyRoute>
    ),
  },
  {
    path: '/no-access',
    element: (
      <Standalone>
        <NoAccessPage />
      </Standalone>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <Page>
            <DashboardPage />
          </Page>
        ),
      },
    ],
  },
  {
    path: '*',
    element: (
      <Standalone>
        <NotFoundPage />
      </Standalone>
    ),
  },
]);
