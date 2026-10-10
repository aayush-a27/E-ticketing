import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { KeyRound, MailCheck } from 'lucide-react';
import { requestPasswordReset } from '../services/authService.js';
import { Button } from '../components/common/Button.jsx';
import { TextField } from '../components/common/TextField.jsx';
import { ERROR_CODES } from '../services/api.js';

/**
 * Asks for a reset link.
 *
 * The answer is the same whether or not the address has an account — saying
 * otherwise would let anyone check who is registered. The page reflects that
 * honestly: "if an account exists", not "we sent it".
 */
export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState(null);
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '' } });

  const onSubmit = async ({ email }) => {
    setFormError(null);
    try {
      await requestPasswordReset(email.trim());
      setSentTo(email.trim());
    } catch (error) {
      setFormError(
        error.code === ERROR_CODES.RATE_LIMITED
          ? 'Too many requests. Wait a few minutes and try again.'
          : error.message,
      );
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md"
      >
        {sentTo ? (
          <div className="card-surface p-6 text-center" role="status">
            <MailCheck className="mx-auto mb-3 size-8 text-amber-brand" aria-hidden="true" />
            <h1 className="text-2xl text-ivory">Check your email</h1>
            <p className="mt-3 text-sm text-ivory-dim">
              If an account exists for <span className="text-ivory">{sentTo}</span>, a link to set a
              new password is on its way. It works once and expires in 30 minutes.
            </p>
            <p className="mt-3 text-xs text-ivory-muted">
              Nothing after a few minutes? Check your spam folder, or try again.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="secondary" onClick={() => setSentTo(null)}>
                Try another address
              </Button>
              <Button as={Link} to="/login">
                Back to sign in
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <KeyRound className="mx-auto mb-3 size-8 text-amber-brand" aria-hidden="true" />
              <h1 className="text-3xl text-ivory">Forgot your password?</h1>
              <p className="mt-2 text-sm text-ivory-muted">
                Enter your email and we will send you a link to set a new one.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="card-surface space-y-5 p-6" noValidate>
              {formError && (
                <div
                  role="alert"
                  className="rounded-xl border border-status-bad/40 bg-status-bad/10 px-4 py-3 text-sm text-status-bad"
                >
                  {formError}
                </div>
              )}

              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register('email', {
                  required: 'Enter your email',
                  pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
                })}
              />

              <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
                Send reset link
              </Button>

              <p className="text-center text-sm text-ivory-muted">
                Remembered it?{' '}
                <Link to="/login" className="text-amber-bright hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
