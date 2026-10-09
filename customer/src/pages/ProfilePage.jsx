import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { KeyRound, LogOut, Ticket, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useCity } from '../context/CityContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { changePassword } from '../services/authService.js';
import { Button } from '../components/common/Button.jsx';
import { TextField } from '../components/common/TextField.jsx';
import { ConfirmDialog } from '../components/common/Modal.jsx';
import { ERROR_CODES } from '../services/api.js';
import { initials } from '../utils/format.js';

export default function ProfilePage() {
  const { user, updateProfile, logout } = useAuth();
  const { cities, city, setCity } = useCity();
  const toast = useToast();
  const navigate = useNavigate();
  const [signOutOpen, setSignOutOpen] = useState(false);

  const profileForm = useForm({
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      preferredCity: user?.preferredCity ?? '',
    },
  });

  const passwordForm = useForm({
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSaveProfile = async (values) => {
    try {
      await updateProfile({
        name: values.name,
        phone: values.phone?.trim() || undefined,
        preferredCity: values.preferredCity || undefined,
      });
      if (values.preferredCity && values.preferredCity !== city) {
        setCity(values.preferredCity);
      }
      toast.success('Profile updated');
    } catch (error) {
      if (error.code === ERROR_CODES.VALIDATION_FAILED) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          profileForm.setError(field, { message });
        }
        return;
      }
      toast.error(error.message);
    }
  };

  const onChangePassword = async (values) => {
    try {
      await changePassword(values);
      passwordForm.reset();
      toast.success('Password changed. Other devices have been signed out.');
    } catch (error) {
      if (error.code === ERROR_CODES.INVALID_CREDENTIALS) {
        passwordForm.setError('currentPassword', { message: 'That password is not right' });
        return;
      }
      if (error.code === ERROR_CODES.VALIDATION_FAILED) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          passwordForm.setError(field, { message });
        }
        return;
      }
      toast.error(error.message);
    }
  };

  const onSignOut = async () => {
    await logout();
    toast.success('Signed out');
    navigate('/');
  };

  return (
    <div className="page-shell max-w-3xl py-10">
      <header className="mb-8 flex items-center gap-4">
        <div className="neu flex size-16 items-center justify-center rounded-full font-display text-xl font-semibold text-amber-bright">
          {initials(user?.name ?? '')}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-2xl text-ivory sm:text-3xl">{user?.name}</h1>
          <p className="truncate text-sm text-ivory-muted">{user?.email}</p>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap gap-2.5">
        <Button as={Link} to="/my-bookings" variant="secondary">
          <Ticket className="size-4" aria-hidden="true" />
          My bookings
        </Button>
        <Button variant="ghost" onClick={() => setSignOutOpen(true)}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>

      <section className="card-surface mb-6 p-6" aria-labelledby="details-heading">
        <h2 id="details-heading" className="mb-5 flex items-center gap-2 text-lg text-ivory">
          <User className="size-4.5 text-amber-brand" aria-hidden="true" />
          Your details
        </h2>

        <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-5" noValidate>
          <TextField
            label="Name"
            autoComplete="name"
            error={profileForm.formState.errors.name?.message}
            {...profileForm.register('name', {
              required: 'Enter your name',
              minLength: { value: 2, message: 'Enter your full name' },
            })}
          />

          <TextField
            label="Phone"
            type="tel"
            autoComplete="tel"
            hint="Optional, for booking updates"
            error={profileForm.formState.errors.phone?.message}
            {...profileForm.register('phone', {
              pattern: { value: /^[+]?[\d\s-]{7,20}$/, message: 'Enter a valid phone number' },
            })}
          />

          <div>
            <label
              htmlFor="preferred-city"
              className="mb-1.5 block text-sm font-medium text-ivory-dim"
            >
              Preferred city
            </label>
            <select
              id="preferred-city"
              className="neu-inset w-full rounded-xl px-4 py-3 text-ivory"
              {...profileForm.register('preferredCity')}
            >
              <option value="" className="bg-charcoal">
                No preference
              </option>
              {cities.map((entry) => (
                <option key={entry.city} value={entry.city} className="bg-charcoal">
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" loading={profileForm.formState.isSubmitting}>
            Save changes
          </Button>
        </form>
      </section>

      <section className="card-surface p-6" aria-labelledby="password-heading">
        <h2 id="password-heading" className="mb-5 flex items-center gap-2 text-lg text-ivory">
          <KeyRound className="size-4.5 text-amber-brand" aria-hidden="true" />
          Change password
        </h2>

        <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-5" noValidate>
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={passwordForm.formState.errors.currentPassword?.message}
            {...passwordForm.register('currentPassword', {
              required: 'Enter your current password',
            })}
          />

          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters. Other devices will be signed out."
            error={passwordForm.formState.errors.newPassword?.message}
            {...passwordForm.register('newPassword', {
              required: 'Choose a new password',
              minLength: { value: 10, message: 'Use at least 10 characters' },
            })}
          />

          <Button type="submit" loading={passwordForm.formState.isSubmitting}>
            Update password
          </Button>
        </form>
      </section>

      <ConfirmDialog
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={onSignOut}
        title="Sign out?"
        description="You will need to sign in again to see your bookings."
        confirmLabel="Sign out"
        variant="danger"
      />
    </div>
  );
}
