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

// --- Entry codes --------------------------------------------------------------

/**
 * Letters and digits that cannot be mistaken for one another when read off a
 * phone screen or said aloud at a busy door: no 0/O, no 1/I/L.
 */
const ENTRY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ENTRY_CODE_LENGTH = 10;

/**
 * A short code a door attendant can type when there is no camera to read the
 * QR. Ten characters from a 31-letter alphabet is about 50 bits: with the
 * gate's per-account rate limit, and only the venue's own staff able to
 * submit codes for it, guessing a live one is not a practical attack.
 *
 * Stored without the hyphen; shown with it.
 */
export function createEntryCode() {
  let code = '';
  for (let index = 0; index < ENTRY_CODE_LENGTH; index += 1) {
    code += ENTRY_CODE_ALPHABET[crypto.randomInt(ENTRY_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * What staff typed, as it is stored: upper case, spaces and hyphens removed.
 * Returns null for anything that cannot be an entry code, so a mistyped one
 * is refused without a database lookup.
 */
export function normalizeEntryCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ENTRY_CODE_LENGTH) return null;
  for (const char of code) {
    if (!ENTRY_CODE_ALPHABET.includes(char)) return null;
  }
  return code;
}

/** "7KQ4MXP9TD" -> "7KQ4M-XP9TD", the way it is printed on a ticket. */
export function formatEntryCode(code) {
  if (!code) return null;
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}
