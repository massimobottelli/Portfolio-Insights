import { Router } from 'express';
import { listAssets, getAsset, getAssetByIsinHandler } from '../controllers/assetController.js';

const router = Router();

// GET /api/assets — Lista completa degli asset
router.get('/', listAssets);

// GET /api/assets/by-isin/:isin — Singolo asset per ISIN
// Nota: questa rotta DEVE essere registrata prima di '/:id',
// altrimenti Express la interpreterebbe come GET /api/assets/by-isin
router.get('/by-isin/:isin', getAssetByIsinHandler);

// GET /api/assets/:id — Singolo asset per ID
router.get('/:id', getAsset);

export default router;