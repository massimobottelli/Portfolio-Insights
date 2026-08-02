import { PrismaClient } from '@prisma/client';

/**
 * Creates a new PrismaClient instance.
 * In production, a singleton pattern should be used.
 */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}