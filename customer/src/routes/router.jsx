import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '../layouts/RootLayout.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import HomePage from '../pages/HomePage.jsx';

/**
 * Only the home page is in the initial bundle. Everything else is split, so
 * the first paint does not carry the seat map or the checkout flow with it.
 */
const MoviesPage = lazy(() => import('../pages/MoviesPage.jsx'));
const MovieDetailPage = lazy(() => import('../pages/MovieDetailPage.jsx'));
const ShowsPage = lazy(() => import('../pages/ShowsPage.jsx'));
const SeatSelectionPage = lazy(() => import('../pages/SeatSelectionPage.jsx'));
const CheckoutPage = lazy(() => import('../pages/CheckoutPage.jsx'));
const TicketPage = lazy(() => import('../pages/TicketPage.jsx'));
const MyBookingsPage = lazy(() => import('../pages/MyBookingsPage.jsx'));
const ProfilePage = lazy(() => import('../pages/ProfilePage.jsx'));
const PartnerPage = lazy(() => import('../pages/PartnerPage.jsx'));
const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const ForgotPasswordPage = lazy(() => import('../pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage.jsx'));
const RegisterPage = lazy(() => import('../pages/RegisterPage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/movies', element: <MoviesPage /> },
      // By slug, which is what the public catalog exposes and what makes a
      // shared link readable.
      { path: '/movies/:slug', element: <MovieDetailPage /> },
      { path: '/shows', element: <ShowsPage /> },
      { path: '/shows/:showId/seats', element: <SeatSelectionPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      // The address the reset email links to: APP_PUBLIC_URL/reset-password.
      { path: '/reset-password', element: <ResetPasswordPage /> },

      {
        element: <ProtectedRoute />,
        children: [
          { path: '/checkout', element: <CheckoutPage /> },
          { path: '/bookings/:bookingId/ticket', element: <TicketPage /> },
          { path: '/my-bookings', element: <MyBookingsPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/partner', element: <PartnerPage /> },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
