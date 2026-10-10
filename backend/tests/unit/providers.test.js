import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The real Razorpay and Cloudinary providers, with test credentials and the
 * network calls replaced. Nothing here reaches either service.
 *
 * The signature tests compute the expected value independently, from each
 * provider's documented formula, rather than calling our own code twice — so
 * they would catch our implementation drifting from what the service checks.
 */

const sdk = vi.hoisted(() => ({
  options: null,
  ordersCreate: vi.fn(),
  paymentsFetch: vi.fn(),
  paymentsCapture: vi.fn(),
  paymentsRefund: vi.fn(),
}));

vi.mock('razorpay', () => ({
  default: class Razorpay {
    constructor(options) {
      sdk.options = options;
      this.orders = { create: sdk.ordersCreate };
      this.payments = {
        fetch: sdk.paymentsFetch,
        capture: sdk.paymentsCapture,
        refund: sdk.paymentsRefund,
      };
    }
  },
}));

const KEYS = vi.hoisted(() => ({
  RAZORPAY_KEY_ID: 'rzp_test_1234567890abcd',
  RAZORPAY_KEY_SECRET: 'razorpay-test-secret',
  RAZORPAY_WEBHOOK_SECRET: 'razorpay-webhook-secret',
  CLOUDINARY_CLOUD_NAME: 'demo-cloud',
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: 'cloudinary-test-secret',
}));

vi.mock('../../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, env: Object.freeze({ ...actual.env, ...KEYS }) };
});

const { razorpayProvider } = await import('../../src/services/payments/providers.js');
const { cloudinaryProvider } = await import('../../src/services/media/providers.js');
const { v2: cloudinary } = await import('cloudinary');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Razorpay', () => {
  it('creates an order in paise with our receipt and notes', async () => {
    sdk.ordersCreate.mockResolvedValue({
      id: 'order_ABC123',
      amount: 64000,
      currency: 'INR',
      status: 'created',
    });

    const order = await razorpayProvider.createOrder({
      amountPaise: 64000,
      currency: 'INR',
      receipt: 'CRTUKWB55W',
      notes: { bookingId: 'b1', reference: 'CRTUKWB55W' },
    });

    expect(sdk.options).toEqual({
      key_id: KEYS.RAZORPAY_KEY_ID,
      key_secret: KEYS.RAZORPAY_KEY_SECRET,
    });
    expect(sdk.ordersCreate).toHaveBeenCalledWith({
      amount: 64000,
      currency: 'INR',
      receipt: 'CRTUKWB55W',
      notes: { bookingId: 'b1', reference: 'CRTUKWB55W' },
      payment_capture: 1,
    });
    expect(order).toEqual({ orderId: 'order_ABC123', amountPaise: 64000, currency: 'INR', status: 'created' });
  });

  it('reports a failed order as a payment error without leaking the gateway message', async () => {
    sdk.ordersCreate.mockRejectedValue({
      statusCode: 401,
      error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' },
    });

    await expect(
      razorpayProvider.createOrder({ amountPaise: 100, currency: 'INR', receipt: 'X', notes: {} }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'PAYMENT_PROVIDER_ERROR' });
    await expect(
      razorpayProvider.createOrder({ amountPaise: 100, currency: 'INR', receipt: 'X', notes: {} }),
    ).rejects.not.toMatchObject({ message: expect.stringContaining('Authentication') });
  });

  it('accepts exactly the checkout signature Razorpay documents', () => {
    // Razorpay: signature = HMAC_SHA256(order_id + "|" + razorpay_payment_id, key_secret)
    const orderId = 'order_ABC123';
    const paymentId = 'pay_XYZ789';
    const signature = crypto
      .createHmac('sha256', KEYS.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(razorpayProvider.verifyPaymentSignature({ orderId, paymentId, signature })).toBe(true);
    expect(
      razorpayProvider.verifyPaymentSignature({ orderId, paymentId: 'pay_OTHER', signature }),
    ).toBe(false);
    expect(
      razorpayProvider.verifyPaymentSignature({ orderId, paymentId, signature: 'a'.repeat(64) }),
    ).toBe(false);
    expect(razorpayProvider.verifyPaymentSignature({ orderId, paymentId, signature: 'short' })).toBe(
      false,
    );
  });

  it('accepts exactly the webhook signature Razorpay documents', () => {
    // Razorpay: X-Razorpay-Signature = HMAC_SHA256(raw request body, webhook secret)
    const rawBody = Buffer.from('{"event":"payment.captured","payload":{}}');
    const signature = crypto
      .createHmac('sha256', KEYS.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    expect(razorpayProvider.verifyWebhookSignature({ rawBody, signature })).toBe(true);
    // One changed byte in the body invalidates it.
    const tampered = Buffer.from('{"event":"payment.captured","payload":{ }}');
    expect(razorpayProvider.verifyWebhookSignature({ rawBody: tampered, signature })).toBe(false);
  });

  it('captures an authorized payment for the full amount', async () => {
    sdk.paymentsCapture.mockResolvedValue({ id: 'pay_1', status: 'captured' });

    const result = await razorpayProvider.capture({
      paymentId: 'pay_1',
      amountPaise: 64000,
      currency: 'INR',
    });

    expect(sdk.paymentsCapture).toHaveBeenCalledWith('pay_1', 64000, 'INR');
    expect(result.status).toBe('captured');
  });

  it('treats "already captured" as success', async () => {
    sdk.paymentsCapture.mockRejectedValue({
      statusCode: 400,
      error: { description: 'This payment has already been captured' },
    });
    sdk.paymentsFetch.mockResolvedValue({ id: 'pay_1', status: 'captured', amount: 64000 });

    await expect(
      razorpayProvider.capture({ paymentId: 'pay_1', amountPaise: 64000, currency: 'INR' }),
    ).resolves.toEqual({ status: 'captured' });
  });

  it('refuses to pretend a failed capture worked', async () => {
    sdk.paymentsCapture.mockRejectedValue({ statusCode: 500, error: { description: 'Server error' } });
    sdk.paymentsFetch.mockResolvedValue({ id: 'pay_1', status: 'authorized', amount: 64000 });

    await expect(
      razorpayProvider.capture({ paymentId: 'pay_1', amountPaise: 64000, currency: 'INR' }),
    ).rejects.toMatchObject({ statusCode: 502, code: 'PAYMENT_PROVIDER_ERROR' });
  });

  it('maps a fetched payment, and survives a failed lookup', async () => {
    sdk.paymentsFetch.mockResolvedValueOnce({
      id: 'pay_1',
      order_id: 'order_1',
      status: 'captured',
      amount: 64000,
      method: 'upi',
    });
    expect(await razorpayProvider.fetchPayment('pay_1')).toEqual({
      id: 'pay_1',
      orderId: 'order_1',
      status: 'captured',
      amountPaise: 64000,
      method: 'upi',
    });

    sdk.paymentsFetch.mockRejectedValueOnce({ statusCode: 404, error: { description: 'Not found' } });
    expect(await razorpayProvider.fetchPayment('pay_missing')).toBeNull();
  });

  it('refunds in paise', async () => {
    sdk.paymentsRefund.mockResolvedValue({ id: 'rfnd_1', status: 'processed' });

    const refund = await razorpayProvider.refund({ paymentId: 'pay_1', amountPaise: 32000, notes: {} });

    expect(sdk.paymentsRefund).toHaveBeenCalledWith('pay_1', {
      amount: 32000,
      notes: {},
      speed: 'normal',
    });
    expect(refund).toEqual({ refundId: 'rfnd_1', status: 'processed' });
  });
});

describe('Cloudinary', () => {
  it('signs exactly the parameters the console posts, the way Cloudinary checks them', () => {
    const signed = cloudinaryProvider.signUpload({
      folder: 'cinereserve/movies/posters',
      publicId: 'new-3f1c2b9a-0d4e-4f5a-9b8c-7d6e5f4a3b2c',
    });

    // What admin/src/services/catalogService.js puts in the upload form,
    // besides the file itself.
    const posted = {
      api_key: signed.apiKey,
      timestamp: String(signed.timestamp),
      folder: signed.folder,
      public_id: signed.public_id,
      allowed_formats: signed.allowed_formats,
    };

    // Cloudinary: sort every parameter except file, cloud_name, resource_type
    // and api_key; join as key=value with &; append the API secret; SHA-1.
    const toSign = Object.entries(posted)
      .filter(([key]) => key !== 'api_key')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const expected = crypto
      .createHash('sha1')
      .update(toSign + KEYS.CLOUDINARY_API_SECRET)
      .digest('hex');

    expect(signed.signature).toBe(expected);
    expect(signed.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
    expect(signed.apiKey).toBe(KEYS.CLOUDINARY_API_KEY);
    // The secret never leaves the server.
    expect(JSON.stringify(signed)).not.toContain(KEYS.CLOUDINARY_API_SECRET);
  });

  it('looks an upload up before trusting it, and reports a missing one as absent', async () => {
    const resource = vi.spyOn(cloudinary.api, 'resource');
    resource.mockResolvedValueOnce({
      public_id: 'cinereserve/movies/posters/new-1',
      secure_url: 'https://res.cloudinary.com/demo-cloud/image/upload/v1/cinereserve/movies/posters/new-1.jpg',
      width: 1000,
      height: 1500,
      format: 'jpg',
      bytes: 204800,
    });

    const asset = await cloudinaryProvider.getAsset('cinereserve/movies/posters/new-1');
    expect(asset.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(asset.publicId).toBe('cinereserve/movies/posters/new-1');

    resource.mockRejectedValueOnce({ error: { http_code: 404, message: 'Resource not found' } });
    expect(await cloudinaryProvider.getAsset('never-uploaded')).toBeNull();

    resource.mockRestore();
  });
});
