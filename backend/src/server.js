import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { transactionsAvailable } from './utils/withTransaction.js';
import { logger } from './utils/logger.js';

async function start() {
  await connectDatabase();

  // Reported at startup rather than discovered at the first booking.
  const transactions = await transactionsAvailable();
  if (!transactions) {
    logger.warn(
      'MongoDB is NOT a replica set. Multi-document writes are not atomic and seat ' +
        'holds (Phase 4) will refuse to run. Use Atlas, or locally: ' +
        'mongod --replSet rs0 && mongosh --eval "rs.initiate()"',
    );
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, transactions },
      `CineReserve API listening on http://localhost:${env.PORT}`,
    );
  });

  // Finish in-flight requests, then close the database. A hard exit mid-write
  // is how half-applied changes happen.
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async (error) => {
      if (error) logger.error({ err: error }, 'Error while closing HTTP server');
      try {
        await disconnectDatabase();
      } catch (dbError) {
        logger.error({ err: dbError }, 'Error while closing database connection');
      }
      process.exit(error ? 1 : 0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after 10s grace period');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception, exiting');
    process.exit(1);
  });
}

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
