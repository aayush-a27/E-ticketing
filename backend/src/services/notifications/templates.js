import { NOTIFICATION_TYPES } from '../../constants/index.js';
import { env } from '../../config/env.js';

const templates = {
  [NOTIFICATION_TYPES.WELCOME]: ({ name }) => ({
    subject: 'Welcome to CineReserve',
    body: `Hi ${name},\n\nYour CineReserve account is ready. Browse what is showing near you and book in a few taps.\n\n— CineReserve`,
  }),

  [NOTIFICATION_TYPES.PASSWORD_RESET]: ({ name, token }) => ({
    subject: 'Reset your CineReserve password',
    body: `Hi ${name},\n\nUse the link below to set a new password. It expires in 30 minutes and works once.\n\n${env.APP_PUBLIC_URL}/reset-password?token=${token}\n\nIf you did not ask for this, ignore this message — your password has not changed.\n\n— CineReserve`,
  }),

  [NOTIFICATION_TYPES.PASSWORD_CHANGED]: ({ name }) => ({
    subject: 'Your CineReserve password was changed',
    body: `Hi ${name},\n\nYour password was just changed and every signed-in device has been logged out.\n\nIf this was not you, reset your password immediately.\n\n— CineReserve`,
  }),

  [NOTIFICATION_TYPES.APPLICATION_SUBMITTED]: ({ name, businessName }) => ({
    subject: 'We received your show runner application',
    body: `Hi ${name},\n\nYour application for ${businessName} is with our team. We will email you once it has been reviewed.\n\n— CineReserve`,
  }),

  [NOTIFICATION_TYPES.APPLICATION_APPROVED]: ({ name, businessName }) => ({
    subject: 'Your show runner application is approved',
    body: `Hi ${name},\n\n${businessName} is approved on CineReserve. Sign in to the admin panel to get started.\n\nYour next step is to request the venue you operate — shows can be scheduled once a theater is assigned to your account.\n\n— CineReserve`,
  }),

  [NOTIFICATION_TYPES.APPLICATION_REJECTED]: ({ name, reason }) => ({
    subject: 'About your show runner application',
    body: `Hi ${name},\n\nWe are not able to approve your application at this time.\n\nReason: ${reason}\n\nYour CineReserve account is unaffected and you can still book tickets. You are welcome to apply again with updated details.\n\n— CineReserve`,
  }),

  [NOTIFICATION_TYPES.SHOW_RUNNER_SUSPENDED]: ({ name, reason }) => ({
    subject: 'Your show runner access has changed',
    body: `Hi ${name},\n\nShow runner access for your account has been suspended.\n\nReason: ${reason}\n\nExisting bookings at your venues are unaffected. Contact support to discuss reinstatement.\n\n— CineReserve`,
  }),
};

export function renderTemplate(type, data = {}) {
  const template = templates[type];
  if (!template) throw new Error(`Unknown notification template: ${type}`);
  return template(data);
}
