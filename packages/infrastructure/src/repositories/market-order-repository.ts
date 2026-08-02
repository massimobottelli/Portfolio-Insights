import type { PrismaClient } from '@prisma/client';
import type { MarketOrder } from '@portfolio/domain';

/**
 * Repository interface for MarketOrder persistence.
 */
export interface MarketOrderRepository {
  findByAssetIsin(isin: string): Promise<MarketOrder[]>;
  findAll(): Promise<MarketOrder[]>;
  saveMany(orders: readonly MarketOrder[]): Promise<void>;
}