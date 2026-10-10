import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES } from '../../constants/index.js';
import { logger } from '../../utils/logger.js';

/**
 * A payment provider creates orders, proves that a payment really happened,
 * and sends money back.
 *
 *   isConfigured()
 *   createOrder({ amountPaise, currency, receipt, notes }) -> { orderId, ... }
 *   verifyPaymentSignature({ orderId, paymentId, signature }) -> boolean
 *   verifyWebhookSignature({ rawBody, signature }) -> boolean
 *   fetchPayment(paymentId) -> { id, status, amountPaise, method } | null
 *   capture({ paymentId, amountPaise, currency }) -> { status }
 *   refund({ paymentId, amountPaise, notes }) -> { refundId, status }
 *
 * Signature checks are the only thing that proves a payment. A browser
 * callback is a hint; this is the evidence.
 */

export const razorpayProvider = {
  name: 'razorpay',

  isConfigured() {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  },

  async client() {
    // Imported lazily so the package is only needed when actually used.
    const { default: Razorpay } = await import('razorpay');
    return new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  },

  publicKey() {
    return env.RAZORPAY_KEY_ID;
  },

  async createOrder({ amountPaise, currency = 'INR', receipt, notes }) {
    const client = await this.client();
    try {
      // Razorpay counts in the smallest currency unit, which is what we store.
      const order = await client.orders.create({
        amount: amountPaise,
        currency,
        receipt,
        notes,
        payment_capture: 1,
      });
      return {
        orderId: order.id,
        amountPaise: order.amount,
        currency: order.currency,
        status: order.status,
      };
    } catch (error) {
      logger.error({ err: describeRazorpayError(error) }, 'Razorpay order creation failed');
      throw new ApiError(
        502,
        ERROR_CODES.PAYMENT_PROVIDER_ERROR,
        'The payment service could not start this payment. Please try again.',
      );
    }
  },

  verifyPaymentSignature({ orderId, paymentId, signature }) {
    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return timingSafeEqual(expected, signature);
  },

  verifyWebhookSignature({ rawBody, signature }) {
    if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    return timingSafeEqual(expected, signature);
  },

  async fetchPayment(paymentId) {
    const client = await this.client();
    try {
      const payment = await client.payments.fetch(paymentId);
      return {
        id: payment.id,
        orderId: payment.order_id,
        status: payment.status,
        amountPaise: payment.amount,
        method: payment.method,
      };
    } catch (error) {
      // The signature already binds this payment to our order, whose amount
      // Razorpay enforces, so a failed lookup does not block confirmation —
      // but it is logged rather than swallowed.
      logger.warn({ err: describeRazorpayError(error), paymentId }, 'Razorpay payment lookup failed');
      return null;
    }
  },

  /**
   * Razorpay keeps money only once a payment is captured. An authorized
   * payment that is never captured is returned to the customer after a few
   * days — so a booking confirmed on authorization alone would be a ticket
   * the venue was never paid for. Whether `payment_capture` on the order is
   * honoured depends on the account's capture settings, so capture is also
   * done explicitly.
   */
  async capture({ paymentId, amountPaise, currency = 'INR' }) {
    const client = await this.client();
    try {
      const payment = await client.payments.capture(paymentId, amountPaise, currency);
      return { status: payment.status };
    } catch (error) {
      // Captured in between — by the order setting or another request — is
      // the outcome we wanted.
      const current = await this.fetchPayment(paymentId);
      if (current?.status === 'captured') return { status: 'captured' };
      logger.error({ err: describeRazorpayError(error), paymentId }, 'Razorpay capture failed');
      throw new ApiError(
        502,
        ERROR_CODES.PAYMENT_PROVIDER_ERROR,
        'The payment was authorised but could not be completed. You have not been charged; please try again.',
      );
    }
  },

  async refund({ paymentId, amountPaise, notes }) {
    const client = await this.client();
    const refund = await client.payments.refund(paymentId, {
      amount: amountPaise,
      notes,
      speed: 'normal',
    });
    return { refundId: refund.id, status: refund.status };
  },
};

/**
 * Simulates the gateway. Used by the test suite and by local development
 * without a Razorpay account, so the whole booking path can be exercised end
 * to end at no cost.
 *
 * It signs with the same HMAC construction as Razorpay, so the verification
 * code under test is the real one rather than a stub.
 */
export const memoryPaymentProvider = {
  name: 'memory',
  secret: 'memory-payment-secret',
  orders: new Map(),
  payments: new Map(),
  refunds: new Map(),
  // Payment ids captured explicitly, so tests can assert it happened.
  captures: [],

  isConfigured() {
    return true;
  },

  publicKey() {
    return 'memory_key_id';
  },

  async createOrder({ amountPaise, currency = 'INR', receipt, notes }) {
    const orderId = `order_mem_${crypto.randomBytes(8).toString('hex')}`;
    const order = { orderId, amountPaise, currency, receipt, notes, status: 'created' };
    this.orders.set(orderId, order);
    return order;
  },

  verifyPaymentSignature({ orderId, paymentId, signature }) {
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return timingSafeEqual(expected, signature);
  },

  verifyWebhookSignature({ rawBody, signature }) {
    const expected = crypto.createHmac('sha256', this.secret).update(rawBody).digest('hex');
    return timingSafeEqual(expected, signature);
  },

  async fetchPayment(paymentId) {
    return this.payments.get(paymentId) ?? null;
  },

  async capture({ paymentId }) {
    const payment = this.payments.get(paymentId);
    if (payment) payment.status = 'captured';
    this.captures.push(paymentId);
    return { status: 'captured' };
  },

  async refund({ paymentId, amountPaise }) {
    const refundId = `rfnd_mem_${crypto.randomBytes(8).toString('hex')}`;
    this.refunds.set(refundId, { refundId, paymentId, amountPaise, status: 'processed' });
    return { refundId, status: 'processed' };
  },

  // --- test helpers --------------------------------------------------------

  /** Pretends the customer paid, and returns what the browser would hand back. */
  __pay(orderId, { status = 'captured', method = 'card' } = {}) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Unknown order ${orderId}`);
    const paymentId = `pay_mem_${crypto.randomBytes(8).toString('hex')}`;
    this.payments.set(paymentId, {
      id: paymentId,
      orderId,
      status,
      amountPaise: order.amountPaise,
      method,
    });
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return { orderId, paymentId, signature };
  },

  __signWebhook(rawBody) {
    return crypto.createHmac('sha256', this.secret).update(rawBody).digest('hex');
  },

  __reset() {
    this.orders.clear();
    this.payments.clear();
    this.refunds.clear();
    this.captures = [];
  },
};

/**
 * The useful part of a Razorpay SDK error, for the log. The SDK rejects with
 * { statusCode, error: { code, description, ... } }; the key secret is never
 * part of it.
 */
function describeRazorpayError(error) {
  return {
    statusCode: error?.statusCode,
    code: error?.error?.code,
    description: error?.error?.description ?? error?.message,
  };
}

/** Constant-time compare that tolerates length differences. */
function timingSafeEqual(expected, received) {
  if (typeof received !== 'string' || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

const registry = new Map([
  [razorpayProvider.name, razorpayProvider],
  [memoryPaymentProvider.name, memoryPaymentProvider],
]);

export function getPaymentProvider() {
  const provider = registry.get(env.PAYMENT_PROVIDER);
  if (!provider) throw new Error(`Unknown payment provider: ${env.PAYMENT_PROVIDER}`);

  if (!provider.isConfigured()) {
    throw new ApiError(
      503,
      ERROR_CODES.PAYMENTS_NOT_CONFIGURED,
      'Payments are not configured on this server. Set the Razorpay credentials, ' +
        'or use PAYMENT_PROVIDER=memory for local development.',
    );
  }

  return provider;
}
