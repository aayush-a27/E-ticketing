import { NOTIFICATION_TYPES } from '../../constants/index.js';
import { env } from '../../config/env.js';

/**
 * A showtime as the customer reads a clock in the venue's city. UTC would put
 * an 8 pm show in India at 14:30 GMT in the email.
 */
function showtime(value, timeZone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

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

  [NOTIFICATION_TYPES.BOOKING_CONFIRMED]: ({ reference, movieTitle, theaterName, startAt, seats, entryCode, timezone }) => ({
    subject: `Your tickets are confirmed — ${movieTitle}`,
    body: `Booking ${reference} is confirmed.\n\n${movieTitle}\n${theaterName}\n${showtime(startAt, timezone)}\nSeats: ${seats}\n\nShow the QR code in your booking to get in.${entryCode ? ` If it will not scan, give the staff your entry code: ${entryCode}` : ''}\n\n— CineReserve`,
  }),

  [NOTIFICATION_TYPES.PAYMENT_FAILED]: ({ reference, reason }) => ({
    subject: 'Your payment did not go through',
    body: `We could not complete the payment for booking ${reference}.\n\n${reason ?? 'The payment was declined.'}\n\nYour seats are held only while the timer runs, so try again soon or pick new seats.\n\n— CineReserve`,
  }),

  [NOTIFICATION_TYPES.BOOKING_CANCELLED]: ({ reference, refundPaise }) => ({
    subject: `Booking ${reference} cancelled`,
    body: `Booking ${reference} has been cancelled.\n\n${
      refundPaise > 0
        ? `A refund of ₹${(refundPaise / 100).toFixed(2)} is on its way and usually takes 5 to 7 working days.`
        : 'No refund is due under the cancellation policy that applied.'
    }\n\n— CineReserve`,
  }),

  [NOTIFICATION_TYPES.REFUND_COMPLETED]: ({ name, reference, amountPaise }) => ({
    subject: 'Your refund has been processed',
    body: `Hi ${name},\n\nA refund of ₹${(amountPaise / 100).toFixed(2)} for booking ${reference} has been sent to your original payment method. It usually appears within 5 to 7 working days.\n\n— CineReserve`,
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
