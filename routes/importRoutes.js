import { Router } from 'express';
import { importFile, listSessions, clearAllData } from '../controllers/importController.js';

const router = Router();

// POST /api/import — Importa un file CSV Directa
router.post('/', importFile);

// GET /api/import/sessions — Storico delle sessioni di import
router.get('/sessions', listSessions);

// DELETE /api/import/clear — Svuota completamente il database
router.delete('/clear', clearAllData);

export default router;
