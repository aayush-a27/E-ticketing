import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Clapperboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button } from '../components/common/Button.jsx';
import { TextField } from '../components/common/TextField.jsx';
import { ERROR_CODES } from '../services/api.js';

export default function LoginPage() {
  const { login, isAuthenticated, checking } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);

  // Where the customer was heading before being asked to sign in.
  const destination = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search ?? ''}`
    : '/';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '' } });

  if (!checking && isAuthenticated) return <Navigate to={destination} replace />;

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await login(values);
      toast.success('Welcome back');
      navigate(destination, { replace: true });
    } catch (error) {
      if (error.code === ERROR_CODES.VALIDATION_FAILED) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          setError(field, { message });
        }
        return;
      }
      setFormError(error.message);
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
        <div className="mb-8 text-center">
          <Clapperboard className="mx-auto mb-3 size-8 text-amber-brand" aria-hidden="true" />
          <h1 className="text-3xl text-ivory">Welcome back</h1>
          <p className="mt-2 text-sm text-ivory-muted">Sign in to book and manage your tickets.</p>
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
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register('email', {
              required: 'Enter your email',
              pattern: { value: /^\S+@\S+\.\S+$/, message: 'Enter a valid email address' },
            })}
          />

          <div>
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              error={errors.password?.message}
              {...register('password', { required: 'Enter your password' })}
            />
            <p className="mt-2 text-right text-sm">
              <Link to="/forgot-password" className="text-ivory-muted hover:text-amber-bright hover:underline">
                Forgot password?
              </Link>
            </p>
          </div>

          <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
            Sign in
          </Button>

          <p className="text-center text-sm text-ivory-muted">
            New to CineReserve?{' '}
            <Link
              to="/register"
              state={location.state}
              className="text-amber-bright hover:underline"
            >
              Create an account
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
