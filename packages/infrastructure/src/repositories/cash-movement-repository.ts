import type { PrismaClient } from '@prisma/client';
import type { CashMovement } from '@portfolio/domain';

/**
 * Repository interface for CashMovement persistence.
 */
export interface CashMovementRepository {
  findAll(): Promise<CashMovement[]>;
  saveMany(movements: readonly CashMovement[]): Promise<void>;
}