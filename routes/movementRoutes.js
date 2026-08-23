import { Router } from 'express';
import { listMovements, listMovementSymbols, deleteMovementHandler } from '../controllers/movementController.js';

const router = Router();

// GET /api/movements — Lista movimenti di cassa con filtri e ordinamento
router.get('/', listMovements);

// GET /api/movements/symbols — Lista ticker distinti per dropdown filtro
router.get('/symbols', listMovementSymbols);

// DELETE /api/movements/:id — Elimina un singolo movimento di cassa
router.delete('/:id', deleteMovementHandler);

export default router;
