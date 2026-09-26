import { clearDatabase } from '../models/importModel.js';
import { exportDatabase, restoreDatabase } from '../models/backupModel.js';
import { clearAnalyticsCache } from '../models/analyticsModel.js';

/**
 * DELETE /api/database/clear
 * Svuota completamente il database cancellando tutti i dati importati.
 * Richiede conferma esplicita nel body della richiesta.
 */
export function clearAllData(req, res) {
  try {
    if (!req.body.confirm) {
      return res.status(400).json({
        error: 'Conferma richiesta',
        details: 'Per cancellare tutti i dati inviare { "confirm": true }'
      });
    }

    const { deleted } = clearDatabase();
    clearAnalyticsCache();

    res.json({
      success: true,
      deleted
    });
  } catch (error) {
    console.error('Errore nella cancellazione del database:', error);
    res.status(500).json({ error: 'Errore durante la cancellazione del database' });
  }
}

/**
 * GET /api/database/export
 * Esporta il database completo come file JSON scaricabile.
 */
export function exportDatabaseHandler(req, res) {
  try {
    const backup = exportDatabase();

    // Imposta gli header per il download del file
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="portfolio-insights-backup-${date}.json"`);

    res.json(backup);
  } catch (error) {
    console.error('Errore nell\'esportazione del database:', error);
    res.status(500).json({ error: 'Errore durante l\'esportazione del database' });
  }
}

/**
 * POST /api/database/restore
 * Ripristina il database da un file JSON di backup.
 * L'operazione è distruttiva: richiede conferma esplicita.
 */
export function restoreDatabaseHandler(req, res) {
  try {
    if (!req.body.confirm) {
      return res.status(400).json({
        error: 'Conferma richiesta',
        details: 'Per ripristinare il database inviare { "confirm": true, "backup": {...} }'
      });
    }

    const backup = req.body.backup;
    if (!backup) {
      return res.status(400).json({
        error: 'Backup mancante',
        details: 'Il campo "backup" è richiesto nel body della richiesta'
      });
    }

    const restored = restoreDatabase(backup);
    clearAnalyticsCache();

    res.json({
      success: true,
      restored
    });
  } catch (error) {
    console.error('Errore nel ripristino del database:', error);
    // Errori di validazione del backup → 400, altri errori → 500
    if (error.message && (
      error.message.includes('non valido') ||
      error.message.includes('non supportata') ||
      error.message.includes('mancanti') ||
      error.message.includes('privo')
    )) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Errore durante il ripristino del database' });
  }
}
