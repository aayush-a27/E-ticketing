import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { requestContext } from './middleware/requestContext.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { publicLimiter } from './middleware/rateLimiter.js';
import { v1Router } from './routes/v1.js';
import { webhooksRouter } from './modules/payments/webhooks.routes.js';
import { ApiError } from './utils/ApiError.js';

export function createApp() {
  const app = express();

  // Behind a proxy (Render, Railway, nginx) this is what makes req.ip the real
  // client address, which rate limiting depends on.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and server-to-server calls arrive without an Origin.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        callback(ApiError.forbidden(`Origin ${origin} is not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(requestContext);

  /**
   * Mounted before the JSON parser on purpose. A webhook signature is computed
   * over the exact bytes the gateway sent; parsing and reserializing the body
   * would change them and every signature would fail.
   */
  app.use('/api/v1/webhooks', webhooksRouter);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    const state = mongoose.connection.readyState;
    const healthy = state === 1;
    res.status(healthy ? 200 : 503).json({
      data: {
        status: healthy ? 'ok' : 'degraded',
        database: ['disconnected', 'connected', 'connecting', 'disconnecting'][state] ?? 'unknown',
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  });

  app.use('/api/v1', publicLimiter, v1Router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
