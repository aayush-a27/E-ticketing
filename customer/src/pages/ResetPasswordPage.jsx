import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { CheckCircle2, KeyRound, TriangleAlert } from 'lucide-react';
import { resetPassword } from '../services/authService.js';
import { Button } from '../components/common/Button.jsx';
import { TextField } from '../components/common/TextField.jsx';
import { ERROR_CODES } from '../services/api.js';

/**
 * Sets a new password from the emailed link.
 *
 * The token is single-use and expires in 30 minutes; the server stores only
 * its hash. A successful reset also signs the account out everywhere, so a
 * session someone else might hold stops working too — the page says so, and
 * sends the customer to sign in afresh.
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { newPassword: '', confirm: '' } });

  const onSubmit = async ({ newPassword }) => {
    setFormError(null);
    try {
      await resetPassword({ token, newPassword });
      setDone(true);
    } catch (error) {
      if (error.code === ERROR_CODES.VALIDATION_FAILED && error.fieldErrors.newPassword) {
        setError('newPassword', { message: error.fieldErrors.newPassword });
        return;
      }
      setFormError(
        error.code === ERROR_CODES.RATE_LIMITED
          ? 'Too many attempts. Wait a few minutes and try again.'
          : error.message,
      );
    }
  };

  // A link with no token, or one too short to be real, cannot work.
  const linkBroken = token.length < 32;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md"
      >
        {done ? (
          <div className="card-surface p-6 text-center" role="status">
            <CheckCircle2 className="mx-auto mb-3 size-8 text-status-good" aria-hidden="true" />
            <h1 className="text-2xl text-ivory">Password changed</h1>
            <p className="mt-3 text-sm text-ivory-dim">
              You have been signed out on every device. Sign in with your new password.
            </p>
            <Button as={Link} to="/login" className="mt-6">
              Sign in
            </Button>
          </div>
        ) : linkBroken ? (
          <div className="card-surface p-6 text-center" role="alert">
            <TriangleAlert className="mx-auto mb-3 size-8 text-status-bad" aria-hidden="true" />
            <h1 className="text-2xl text-ivory">This link is incomplete</h1>
            <p className="mt-3 text-sm text-ivory-dim">
              Open the link from your email again, or ask for a new one.
            </p>
            <Button as={Link} to="/forgot-password" className="mt-6">
              Get a new link
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <KeyRound className="mx-auto mb-3 size-8 text-amber-brand" aria-hidden="true" />
              <h1 className="text-3xl text-ivory">Choose a new password</h1>
              <p className="mt-2 text-sm text-ivory-muted">At least 10 characters.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="card-surface space-y-5 p-6" noValidate>
              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-status-bad/40 bg-status-bad/10 px-4 py-3 text-sm text-status-bad"
                >
                  {formError}
                  {/expired|invalid/i.test(formError) && (
                    <>
                      {' '}
                      <Link to="/forgot-password" className="underline">
                        Get a new link
                      </Link>
                      .
                    </>
                  )}
                </div>
              )}

              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                autoFocus
                error={errors.newPassword?.message}
                {...register('newPassword', {
                  required: 'Choose a new password',
                  minLength: { value: 10, message: 'Use at least 10 characters' },
                  maxLength: { value: 128, message: 'Use at most 128 characters' },
                })}
              />

              <TextField
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                error={errors.confirm?.message}
                {...register('confirm', {
                  validate: (value) => value === watch('newPassword') || 'The passwords do not match',
                })}
              />

              <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
                Set new password
              </Button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
