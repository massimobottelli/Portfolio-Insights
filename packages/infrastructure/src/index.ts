// Infrastructure package — database access, repositories, Prisma
// Only this layer knows about persistence details

export { createPrismaClient } from './prisma';
export type { AssetRepository } from './repositories/asset-repository';
export type { MarketOrderRepository } from './repositories/market-order-repository';
export type { CashMovementRepository } from './repositories/cash-movement-repository';
export type { ImportSessionRepository } from './repositories/import-session-repository';