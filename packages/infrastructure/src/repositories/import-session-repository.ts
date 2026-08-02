import type { PrismaClient } from '@prisma/client';
import type { ImportSession } from '@portfolio/domain';

/**
 * Repository interface for ImportSession persistence.
 */
export interface ImportSessionRepository {
  findAll(): Promise<ImportSession[]>;
  save(session: ImportSession): Promise<void>;
}