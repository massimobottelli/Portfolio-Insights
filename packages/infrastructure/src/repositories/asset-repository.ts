import type { PrismaClient } from '@prisma/client';
import type { Asset } from '@portfolio/domain';

/**
 * Repository interface for Asset persistence.
 * Only infrastructure implements this interface — domain never depends on it.
 */
export interface AssetRepository {
  findByIsin(isin: string): Promise<Asset | null>;
  findAll(): Promise<Asset[]>;
  save(asset: Asset): Promise<void>;
}