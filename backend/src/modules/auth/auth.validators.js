import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

/**
 * Deliberately strict: 10 characters minimum, no composition rules. Length
 * beats character classes, and rules that force a symbol mostly produce
 * "Password1!".
 */
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters');

const phone = z
  .string()
  .trim()
  .regex(/^[+]?[\d\s-]{7,20}$/, 'Enter a valid phone number')
  .optional();

/**
 * `role` and `accountStatus` are absent on purpose. Zod strips unknown keys, so
 * a registration payload carrying "role": "super_admin" loses it here — before
 * any code could read it.
 */
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email,
  password,
  phone,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128),
  newPassword: password,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(32, 'Invalid reset token').max(128),
  newPassword: password,
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone,
    preferredCity: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });
