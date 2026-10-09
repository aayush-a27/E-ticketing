import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '../config/env.js';

/**
 * A ticket token is opaque and signed. It carries a booking id and a random
 * nonce — never a name, an email or a seat list — so a photographed QR code
 * reveals nothing about the customer and cannot be altered into another
 * booking's ticket.
 *
 * Format: <bookingId>.<nonce>.<hmac>
 */
export function createTicketToken(bookingId) {
  const nonce = crypto.randomBytes(12).toString('hex');
  const body = `${bookingId}.${nonce}`;
  return `${body}.${sign(body)}`;
}

export function verifyTicketToken(token) {
  if (typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [bookingId, nonce, signature] = parts;
  if (!/^[0-9a-fA-F]{24}$/.test(bookingId)) return null;

  const expected = sign(`${bookingId}.${nonce}`);
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  return { bookingId, nonce };
}

function sign(body) {
  return crypto.createHmac('sha256', env.TICKET_TOKEN_SECRET).update(body).digest('hex');
}

/**
 * The QR image, as a data URL the client can print or show at the gate. The
 * encoded value is the token alone, so the scanner posts it straight to the
 * validation endpoint.
 */
export async function renderTicketQr(token) {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });
}
