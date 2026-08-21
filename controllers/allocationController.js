import {
  getAssetTypes,
  getAllocationTargets,
  saveAllocationTarget,
  calculateCurrentAllocation,
  calculateDivergences,
  calculateRebalancingSuggestions,
  countUnknownAssets
} from '../models/allocationModel.js';
import { TARGETABLE_ASSET_TYPES } from '../config/assetTypes.js';

/**
 * GET /api/asset-types
 * Restituisce il catalogo asset type.
 */
export function getAssetTypesHandler(req, res) {
  try {
    const types = getAssetTypes();
    res.json({
      assetTypes: types.map(t => ({
        name: t.name,
        isTargetable: t.is_targetable === 1
      }))
    });
  } catch (error) {
    console.error('Asset types error:', error);
    res.status(500).json({ error: 'Errore nel recupero dei tipi di asset' });
  }
}

/**
 * GET /api/allocation/current
 * Restituisce l'allocazione attuale calcolata a runtime.
 */
export async function getCurrentAllocationHandler(req, res) {
  try {
    const current = await calculateCurrentAllocation();
    const unknownCount = countUnknownAssets();
    res.json({ ...current, unknownAssets: unknownCount });
  } catch (error) {
    console.error('Current allocation error:', error);
    res.status(500).json({ error: 'Errore nel calcolo dell\'allocazione attuale' });
  }
}

/**
 * GET /api/allocation/target
 * Restituisce il target configurato.
 */
export function getTargetHandler(req, res) {
  try {
    const target = getAllocationTargets();
    res.json(target);
  } catch (error) {
    console.error('Get target error:', error);
    res.status(500).json({ error: 'Errore nel recupero del target' });
  }
}

/**
 * PUT /api/allocation/target
 * Salva il target di allocazione.
 * Body: { tolerance: number, targets: [{ assetType: string, targetPercent: number }] }
 */
export function putTargetHandler(req, res) {
  try {
    const { tolerance, targets } = req.body;

    // Validazione tolerance
    if (typeof tolerance !== 'number' || isNaN(tolerance) || tolerance <= 0) {
      return res.status(400).json({ error: 'La tolerance deve essere un numero maggiore di 0' });
    }

    // Validazione targets
    if (!Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({ error: 'Il campo targets deve essere un array non vuoto' });
    }

    // Validazione: solo categorie target-abili
    for (const t of targets) {
      if (!TARGETABLE_ASSET_TYPES.includes(t.assetType)) {
        return res.status(400).json({ error: `Categoria non target-abile: ${t.assetType}` });
      }
      if (typeof t.targetPercent !== 'number' || isNaN(t.targetPercent) || t.targetPercent < 0) {
        return res.status(400).json({ error: `targetPercent non valido per ${t.assetType}` });
      }
    }

    // Validazione: somma = 100%
    const sum = targets.reduce((s, t) => s + t.targetPercent, 0);
    if (Math.abs(sum - 100) > 0.001) {
      return res.status(400).json({ error: `La somma dei target deve essere 100% (attuale: ${sum.toFixed(2)}%)` });
    }

    const saved = saveAllocationTarget(tolerance, targets);
    res.json(saved);
  } catch (error) {
    console.error('Save target error:', error);
    res.status(500).json({ error: 'Errore nel salvataggio del target' });
  }
}

/**
 * GET /api/allocation/rebalance
 * Restituisce divergenze e suggerimenti di ribilanciamento.
 */
export async function getRebalanceHandler(req, res) {
  try {
    const divergences = await calculateDivergences();
    const suggestions = await calculateRebalancingSuggestions();
    const { tolerance } = getAllocationTargets();
    res.json({ tolerance, divergences, suggestions });
  } catch (error) {
    console.error('Rebalance error:', error);
    res.status(500).json({ error: 'Errore nel calcolo del ribilanciamento' });
  }
}