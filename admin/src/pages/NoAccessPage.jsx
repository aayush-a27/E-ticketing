import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { humanize } from '../utils/format.js';

/**
 * Where an authenticated account that has no console lands.
 *
 * Almost always a customer who signed in at the wrong address. The page says
 * so plainly instead of implying a mistake or hinting that some other way in
 * exists — becoming a show runner goes through an application a platform
 * administrator reviews, and nothing here can shortcut that.
 */
export default function NoAccessPage() {
  const { user, isAuthenticated, logout, showRunner } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  const suspendedRunner = showRunner && showRunner.status !== 'active';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-900 px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-white p-7 text-center shadow-overlay">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-bad-soft">
          <ShieldOff className="size-5 text-bad" aria-hidden="true" />
        </div>

        <h1 className="text-lg font-semibold text-ink-900">
          {suspendedRunner ? 'Your operating access is paused' : 'This console is not for your account'}
        </h1>

        {suspendedRunner ? (
          <p className="mt-2 text-sm text-ink-600">
            Your show-runner access is {humanize(showRunner.status).toLowerCase()}. A platform
            administrator has to reinstate it before you can manage shows again.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-600">
            {isAuthenticated ? (
              <>
                You are signed in as{' '}
                <span className="font-medium text-ink-900">{user?.email}</span>, which is a{' '}
                {humanize(user?.role).toLowerCase()} account. The operations console is for
                platform administrators and approved show runners.
              </>
            ) : (
              'Sign in with a platform administrator or show-runner account to continue.'
            )}
          </p>
        )}

        <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2.5 text-xs text-ink-600">
          To browse films and book tickets, use the CineReserve customer site. To run a venue here,
          submit a show-runner application from your customer account — a platform administrator
          reviews each one.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {isAuthenticated && (
            <Button variant="secondary" onClick={onSignOut} loading={signingOut}>
              Sign out
            </Button>
          )}
          <Button as={Link} to="/login">
            Back to sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
