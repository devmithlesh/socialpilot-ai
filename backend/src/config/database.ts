import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

// Global singleton to prevent multiple connections in development (hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // The default 5s interactive-transaction timeout is too tight for a remote
    // (pooled) database; approval and versioning logic need several round trips.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  });

if (config.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
