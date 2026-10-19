import { createApp } from './app';
import { config } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/database';
import { startSchedulers } from './jobs/scheduler';

async function main() {
  // Verify database connection before accepting traffic
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (err) {
    const error = err as Error & { code?: string };
    // Never log DATABASE_URL or credentials that might appear in a driver error.
    const host = (() => {
      try {
        return new URL(config.DATABASE_URL).host;
      } catch {
        return 'unparseable';
      }
    })();
    const reason = error.message
      .replaceAll(config.DATABASE_URL, '[DATABASE_URL]')
      .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1[redacted]@');
    logger.error(`Failed to connect to database: ${reason} (host: ${host})`, {
      error: error.message,
      code: error.code,
      host,
    });
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info(`SocialPilot AI backend running`, {
      port: config.PORT,
      environment: config.NODE_ENV,
      aiAvailable: !!config.GEMINI_API_KEY,
      linkedInConfigured: !!(config.LINKEDIN_CLIENT_ID && config.LINKEDIN_CLIENT_SECRET),
      instagramConfigured: !!(config.INSTAGRAM_APP_ID && config.INSTAGRAM_APP_SECRET),
    });
  });

  const stopSchedulers = startSchedulers();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    stopSchedulers();
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Server closed');
      process.exit(0);
    });

    // Force shutdown after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: (err as Error).message });
  process.exit(1);
});
