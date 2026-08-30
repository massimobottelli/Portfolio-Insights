import { Router } from 'express';
import { listOrders, listOrderSymbols, deleteOrderHandler } from '../controllers/orderController.js';

const router = Router();

// GET /api/orders — Lista ordini di mercato con filtri e ordinamento
router.get('/', listOrders);

// GET /api/orders/symbols — Lista ticker distinti per dropdown filtro
router.get('/symbols', listOrderSymbols);

// DELETE /api/orders/:id — Elimina un singolo ordine di mercato
router.delete('/:id', deleteOrderHandler);

export default router;
