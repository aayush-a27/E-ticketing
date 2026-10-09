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

/**
 * Creates an ordinary customer account. There is deliberately no role field
 * here — the server assigns `customer` and ignores anything else in the body.
 */
export default function RegisterPage() {
  const { register: createAccount, isAuthenticated, checking } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);

  const destination = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search ?? ''}`
    : '/';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { name: '', email: '', password: '', phone: '' } });

  if (!checking && isAuthenticated) return <Navigate to={destination} replace />;

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await createAccount({
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone?.trim() || undefined,
      });
      toast.success('Your account is ready');
      navigate(destination, { replace: true });
    } catch (error) {
      if (error.code === ERROR_CODES.EMAIL_IN_USE) {
        setError('email', { message: 'That email is already registered' });
        return;
      }
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
          <h1 className="text-3xl text-ivory">Create your account</h1>
          <p className="mt-2 text-sm text-ivory-muted">
            It takes a moment, and your tickets stay in one place.
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
            label="Name"
            autoComplete="name"
            placeholder="Your name"
            error={errors.name?.message}
            {...register('name', {
              required: 'Enter your name',
              minLength: { value: 2, message: 'Enter your full name' },
            })}
          />

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

          <TextField
            label="Phone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            hint="Optional, for booking updates"
            error={errors.phone?.message}
            {...register('phone', {
              pattern: {
                value: /^[+]?[\d\s-]{7,20}$/,
                message: 'Enter a valid phone number',
              },
            })}
          />

          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
            hint="Length matters more than symbols. A short phrase works well."
            error={errors.password?.message}
            {...register('password', {
              required: 'Choose a password',
              minLength: { value: 10, message: 'Use at least 10 characters' },
            })}
          />

          <Button type="submit" loading={isSubmitting} className="w-full" size="lg">
            Create account
          </Button>

          <p className="text-center text-sm text-ivory-muted">
            Already have an account?{' '}
            <Link to="/login" state={location.state} className="text-amber-bright hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
