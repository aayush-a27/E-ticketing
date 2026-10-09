import { api, unwrap, idempotencyKey } from './api.js';

/**
 * Creates a gateway order. The amount is decided entirely by the server from
 * the booking; this call sends no figure at all.
 */
export async function createPaymentOrder(bookingId, { key } = {}) {
  const response = await api.post(
    `/me/bookings/${bookingId}/payments`,
    {},
    { headers: { 'Idempotency-Key': key ?? idempotencyKey() } },
  );
  return unwrap(response);
}

/**
 * Hands the gateway's callback to the server for verification.
 *
 * The browser never decides that a payment succeeded — this response does, and
 * it reflects the signature check the server performed.
 */
export async function verifyPayment(bookingId, { orderId, paymentId, signature }) {
  const response = await api.post(`/me/bookings/${bookingId}/payments/verify`, {
    orderId,
    paymentId,
    signature,
  });
  return unwrap(response);
}

export async function fetchPayments(bookingId, { signal } = {}) {
  const response = await api.get(`/me/bookings/${bookingId}/payments`, { signal });
  return unwrap(response).payments;
}

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let scriptPromise = null;

/** Loads the gateway script once, on demand rather than on every page. */
export function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      scriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

/**
 * True when the server is running the simulated gateway. The checkout page
 * says so plainly rather than pretending a payment can be taken — there is no
 * fake success path in this app.
 */
export function isSimulatedGateway(publicKey) {
  return !publicKey || !String(publicKey).startsWith('rzp_');
}
