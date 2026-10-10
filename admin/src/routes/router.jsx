import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute.jsx';
import { ROLES } from '../context/AuthContext.jsx';
import { FullPageLoader, LoadingBlock } from '../components/ui/States.jsx';

/**
 * Routes are split per page, so opening the console downloads the shell and
 * the page being viewed rather than every screen in the product.
 */
const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const DashboardPage = lazy(() => import('../pages/DashboardPage.jsx'));
const MoviesPage = lazy(() => import('../pages/movies/MoviesPage.jsx'));
const MovieFormPage = lazy(() => import('../pages/movies/MovieFormPage.jsx'));
const MovieDetailPage = lazy(() => import('../pages/movies/MovieDetailPage.jsx'));
const TheatersPage = lazy(() => import('../pages/theaters/TheatersPage.jsx'));
const TheaterFormPage = lazy(() => import('../pages/theaters/TheaterFormPage.jsx'));
const TheaterDetailPage = lazy(() => import('../pages/theaters/TheaterDetailPage.jsx'));
const ScreenDetailPage = lazy(() => import('../pages/theaters/ScreenDetailPage.jsx'));
const ShowsPage = lazy(() => import('../pages/shows/ShowsPage.jsx'));
const ShowFormPage = lazy(() => import('../pages/shows/ShowFormPage.jsx'));
const ShowDetailPage = lazy(() => import('../pages/shows/ShowDetailPage.jsx'));
const BookingsPage = lazy(() => import('../pages/bookings/BookingsPage.jsx'));
const BookingDetailPage = lazy(() => import('../pages/bookings/BookingDetailPage.jsx'));
const FinancePage = lazy(() => import('../pages/finance/FinancePage.jsx'));
const RefundsPage = lazy(() => import('../pages/finance/RefundsPage.jsx'));
const GatePage = lazy(() => import('../pages/gate/GatePage.jsx'));
const ApplicationsPage = lazy(() => import('../pages/platform/ApplicationsPage.jsx'));
const ApplicationDetailPage = lazy(() => import('../pages/platform/ApplicationDetailPage.jsx'));
const ShowRunnersPage = lazy(() => import('../pages/platform/ShowRunnersPage.jsx'));
const VenueRequestsPage = lazy(() => import('../pages/platform/VenueRequestsPage.jsx'));
const UsersPage = lazy(() => import('../pages/platform/UsersPage.jsx'));
const UserDetailPage = lazy(() => import('../pages/platform/UserDetailPage.jsx'));
const AuditLogPage = lazy(() => import('../pages/platform/AuditLogPage.jsx'));
const SettingsPage = lazy(() => import('../pages/platform/SettingsPage.jsx'));
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

      /**
       * The catalogue is platform-wide, so these are super-admin only. The
       * guard matches the API: /admin/movies refuses a show runner, and
       * sending them to a page that cannot load is worse than not offering it.
       */
      {
        path: 'movies',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <MoviesPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'movies/new',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <MovieFormPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'movies/:id',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <MovieDetailPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'movies/:id/edit',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <MovieFormPage />
            </Page>
          </ProtectedRoute>
        ),
      },

      /**
       * Venues are open to both roles. A show runner reaches only the theaters
       * assigned to them: gate 4 resolves the id in the URL against the
       * database, so changing it yields a refusal, not another venue.
       *
       * Creating a theater is the exception — venues are assigned, never
       * self-served, so that one route is super-admin only.
       */
      {
        path: 'theaters',
        element: (
          <Page>
            <TheatersPage />
          </Page>
        ),
      },
      {
        path: 'theaters/new',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <TheaterFormPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'theaters/:theaterId',
        element: (
          <Page>
            <TheaterDetailPage />
          </Page>
        ),
      },
      {
        path: 'theaters/:theaterId/edit',
        element: (
          <Page>
            <TheaterFormPage />
          </Page>
        ),
      },
      {
        path: 'theaters/:theaterId/screens/:screenId',
        element: (
          <Page>
            <ScreenDetailPage />
          </Page>
        ),
      },

      /**
       * Scheduling. Both roles reach these; the server scopes a show runner to
       * their own venues and refuses a screen they do not manage.
       */
      {
        path: 'shows',
        element: (
          <Page>
            <ShowsPage />
          </Page>
        ),
      },
      {
        path: 'shows/new',
        element: (
          <Page>
            <ShowFormPage />
          </Page>
        ),
      },
      {
        path: 'shows/:showId',
        element: (
          <Page>
            <ShowDetailPage />
          </Page>
        ),
      },
      {
        path: 'shows/:showId/edit',
        element: (
          <Page>
            <ShowFormPage />
          </Page>
        ),
      },

      /**
       * Operations, for both roles. Every one of these reads data the server
       * has already scoped: a show runner's bookings, money and refunds are
       * their venues' only, and the gate admits only at venues they manage.
       */
      {
        path: 'bookings',
        element: (
          <Page>
            <BookingsPage />
          </Page>
        ),
      },
      {
        path: 'bookings/:bookingId',
        element: (
          <Page>
            <BookingDetailPage />
          </Page>
        ),
      },
      {
        path: 'finance',
        element: (
          <Page>
            <FinancePage />
          </Page>
        ),
      },
      {
        path: 'refunds',
        element: (
          <Page>
            <RefundsPage />
          </Page>
        ),
      },
      {
        path: 'gate',
        element: (
          <Page>
            <GatePage />
          </Page>
        ),
      },
      {
        path: 'venue-requests',
        element: (
          <Page>
            <VenueRequestsPage />
          </Page>
        ),
      },

      /**
       * Platform administration. Super admin only, matching the API, which
       * refuses everyone else regardless of what is rendered here.
       */
      {
        path: 'applications',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <ApplicationsPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'applications/:id',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <ApplicationDetailPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'show-runners',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <ShowRunnersPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <UsersPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'users/:id',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <UserDetailPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'audit',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <AuditLogPage />
            </Page>
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute roles={[ROLES.SUPER_ADMIN]}>
            <Page>
              <SettingsPage />
            </Page>
          </ProtectedRoute>
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
