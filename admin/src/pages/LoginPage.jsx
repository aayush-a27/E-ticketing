import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Field.jsx';
import { ERROR_CODES } from '../services/api.js';
import { intendedDestination } from '../routes/ProtectedRoute.jsx';

/**
 * Sign-in.
 *
 * The ordinary /auth/login endpoint, the same one customers use. There is no
 * separate administrator login and no way to request a role here: the server
 * reports who this account is and the console renders accordingly. Someone
 * signing in with a customer account reaches /no-access, not a console.
 */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '' } });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const user = await login(values);

      if (user?.role === 'customer') {
        navigate('/no-access', { replace: true });
        return;
      }

      navigate(intendedDestination(location), { replace: true });
    } catch (error) {
      // Field-level messages where the server gave them, a form-level one
      // otherwise. Invalid credentials deliberately do not say which half was
      // wrong — that would confirm whether an address has an account.
      const fieldErrors = error?.fieldErrors ?? {};
      let matched = false;
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (field === 'email' || field === 'password') {
          setError(field, { type: 'server', message });
          matched = true;
        }
      }
      if (!matched) {
        setFormError(
          error?.code === ERROR_CODES.RATE_LIMITED
            ? 'Too many sign-in attempts. Wait a few minutes and try again.'
            : (error?.message ?? 'Could not sign you in.'),
        );
      }
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-ink-900">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-on-dark/15">
              <svg viewBox="0 0 32 32" className="size-5" aria-hidden="true">
                <path
                  d="M16 6l7 2.6v6.2c0 4.4-2.9 8.2-7 9.6-4.1-1.4-7-5.2-7-9.6V8.6L16 6z"
                  fill="currentColor"
                  className="text-brand-on-dark"
                />
              </svg>
            </span>
            <div>
              <h1 className="text-lg font-semibold text-white">CineReserve</h1>
              <p className="text-xs text-ink-400">Operations console</p>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-overlay">
            <h2 className="text-base font-semibold text-ink-900">Sign in</h2>
            <p className="mt-1 text-sm text-ink-500">
              For platform administrators and show runners.
            </p>

            {formError && (
              <div
                className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden="true" />
                <p className="text-sm text-ink-800">{formError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
              <TextField
                label="Email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register('email', {
                  required: 'Enter your email address',
                  pattern: { value: /\S+@\S+\.\S+/, message: 'Enter a valid email address' },
                })}
              />

              <div className="relative">
                <TextField
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••"
                  error={errors.password?.message}
                  {...register('password', { required: 'Enter your password' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2 top-[2.1rem] rounded p-1.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>

              <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-ink-400">
            Your session is held in a secure cookie this page cannot read.
            <br />
            Administrator accounts are created on the server, never from here.
          </p>
        </div>
      </div>
    </div>
  );
}
