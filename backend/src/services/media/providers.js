import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { ERROR_CODES } from '../../constants/index.js';

/**
 * A media provider signs direct browser uploads and deletes assets.
 *
 * Direct signed upload is used rather than proxying files through the API: the
 * API secret never leaves the server, large files never occupy a Node process,
 * and the signature constrains the folder and parameters so a signed request
 * cannot be repurposed to write anywhere else.
 *
 *   isConfigured()           -> boolean
 *   signUpload({folder, publicId, eager}) -> params the client posts to the provider
 *   getAsset(publicId)       -> { url, publicId, width, height, format, bytes } | null
 *   destroy(publicId)        -> boolean
 */

export const ALLOWED_FORMATS = Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'avif']);
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const cloudinaryProvider = {
  name: 'cloudinary',

  isConfigured() {
    return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  },

  configure() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  },

  signUpload({ folder, publicId }) {
    this.configure();
    const timestamp = Math.floor(Date.now() / 1000);

    // Only these parameters are signed, so the client cannot widen them.
    const params = {
      timestamp,
      folder,
      public_id: publicId,
      allowed_formats: ALLOWED_FORMATS.join(','),
    };

    const signature = cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET);

    return {
      provider: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      apiKey: env.CLOUDINARY_API_KEY,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      ...params,
      signature,
      maxBytes: MAX_UPLOAD_BYTES,
      expiresAt: new Date((timestamp + 3600) * 1000),
    };
  },

  async getAsset(publicId) {
    this.configure();
    try {
      const resource = await cloudinary.api.resource(publicId);
      return {
        url: resource.secure_url,
        publicId: resource.public_id,
        width: resource.width,
        height: resource.height,
        format: resource.format,
        bytes: resource.bytes,
      };
    } catch (error) {
      if (error?.error?.http_code === 404 || error?.http_code === 404) return null;
      throw new ApiError(
        502,
        ERROR_CODES.MEDIA_UPLOAD_FAILED,
        'Could not verify the uploaded file with the media provider',
      );
    }
  },

  async destroy(publicId) {
    this.configure();
    const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    return result?.result === 'ok' || result?.result === 'not found';
  },
};

/**
 * Used by tests and by local development without a Cloudinary account. Keeps
 * assets in a Map so the upload-then-attach flow can be exercised end to end
 * without a network call or a paid service.
 */
export const memoryProvider = {
  name: 'memory',
  store: new Map(),

  isConfigured() {
    return true;
  },

  signUpload({ folder, publicId }) {
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      provider: 'memory',
      uploadUrl: 'memory://upload',
      cloudName: 'memory',
      timestamp,
      folder,
      public_id: publicId,
      signature: crypto.createHash('sha256').update(`${folder}:${publicId}:${timestamp}`).digest('hex'),
      maxBytes: MAX_UPLOAD_BYTES,
      expiresAt: new Date((timestamp + 3600) * 1000),
    };
  },

  async getAsset(publicId) {
    return this.store.get(publicId) ?? null;
  },

  async destroy(publicId) {
    return this.store.delete(publicId);
  },

  /** Test helper: pretend the client finished an upload. */
  __seed(publicId, asset = {}) {
    const record = {
      url: `https://media.test/${publicId}.jpg`,
      publicId,
      width: 1000,
      height: 1500,
      format: 'jpg',
      bytes: 204_800,
      ...asset,
    };
    this.store.set(publicId, record);
    return record;
  },

  __reset() {
    this.store.clear();
  },
};

const registry = new Map([
  [cloudinaryProvider.name, cloudinaryProvider],
  [memoryProvider.name, memoryProvider],
]);

export function getMediaProvider() {
  const provider = registry.get(env.MEDIA_PROVIDER);
  if (!provider) throw new Error(`Unknown media provider: ${env.MEDIA_PROVIDER}`);

  if (!provider.isConfigured()) {
    throw new ApiError(
      503,
      ERROR_CODES.MEDIA_NOT_CONFIGURED,
      'Image uploads are not configured on this server. Set the Cloudinary credentials, ' +
        'or use MEDIA_PROVIDER=memory for local development.',
    );
  }

  return provider;
}
