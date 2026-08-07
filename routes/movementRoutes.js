import { Router } from 'express';
import { listMovements, listMovementSymbols } from '../controllers/movementController.js';

const router = Router();

// GET /api/movements — Lista movimenti di cassa con filtri e ordinamento
router.get('/', listMovements);

// GET /api/movements/symbols — Lista ticker distinti per dropdown filtro
router.get('/symbols', listMovementSymbols);

export default router;