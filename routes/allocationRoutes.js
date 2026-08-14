import { Router } from 'express';
import {
  getAssetTypesHandler,
  getCurrentAllocationHandler,
  getTargetHandler,
  putTargetHandler,
  getRebalanceHandler
} from '../controllers/allocationController.js';

const router = Router();

// GET /api/asset-types — Catalogo asset type
router.get('/asset-types', getAssetTypesHandler);

// GET /api/allocation/current — Allocazione attuale
router.get('/allocation/current', getCurrentAllocationHandler);

// GET /api/allocation/target — Target configurato
router.get('/allocation/target', getTargetHandler);

// PUT /api/allocation/target — Salva target
router.put('/allocation/target', putTargetHandler);

// GET /api/allocation/rebalance — Divergenze e suggerimenti
router.get('/allocation/rebalance', getRebalanceHandler);

export default router;