import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES } from '../../constants/index.js';

/**
 * A payment provider creates orders, proves that a payment really happened,
 * and sends money back.
 *
 *   isConfigured()
 *   createOrder({ amountPaise, currency, receipt, notes }) -> { orderId, ... }
 *   verifyPaymentSignature({ orderId, paymentId, signature }) -> boolean
 *   verifyWebhookSignature({ rawBody, signature }) -> boolean
 *   fetchPayment(paymentId) -> { id, status, amountPaise, method } | null
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
      throw new ApiError(
        502,
        ERROR_CODES.MEDIA_UPLOAD_FAILED,
        `Could not create a payment order: ${error?.error?.description ?? error.message}`,
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
    } catch {
      return null;
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
  },
};

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
