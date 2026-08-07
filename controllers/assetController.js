import { getAllAssets, getAssetByIsin, getAssetById, updateAssetType } from '../models/assetModel.js';
import { ASSET_TYPES } from '../config/assetTypes.js';

/**
 * GET /api/assets
 * Restituisce la lista completa di tutti gli asset.
 */
export function listAssets(req, res) {
  try {
    const assets = getAllAssets();
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero degli asset', details: error.message });
  }
}

/**
 * GET /api/assets/:id
 * Restituisce un singolo asset per ID interno.
 */
export function getAsset(req, res) {
  try {
    const { id } = req.params;
    const asset = getAssetById(id);
    if (!asset) {
      return res.status(404).json({ error: 'Asset non trovato' });
    }
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero dell\'asset', details: error.message });
  }
}

/**
 * GET /api/assets/by-isin/:isin
 * Restituisce un singolo asset per ISIN.
 */
export function getAssetByIsinHandler(req, res) {
  try {
    const { isin } = req.params;
    const asset = getAssetByIsin(isin);
    if (!asset) {
      return res.status(404).json({ error: 'Asset non trovato' });
    }
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero dell\'asset', details: error.message });
  }
}

/**
 * PATCH /api/assets/:id/type
 * Aggiorna il tipo di un asset.
 * Body: { assetType: string }
 */
export function updateAssetTypeHandler(req, res) {
  try {
    const { id } = req.params;
    const { assetType } = req.body;

    if (!assetType || typeof assetType !== 'string' || assetType.trim().length === 0) {
      return res.status(400).json({ error: 'Il campo assetType è obbligatorio' });
    }

    const validTypes = ASSET_TYPES;
    const normalizedType = assetType.toUpperCase().trim();
    if (!validTypes.includes(normalizedType)) {
      return res.status(400).json({
        error: `Tipo non valido. Valori accettati: ${validTypes.join(', ')}`
      });
    }

    const asset = updateAssetType(id, normalizedType);
    if (!asset) {
      return res.status(404).json({ error: 'Asset non trovato' });
    }
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'aggiornamento del tipo', details: error.message });
  }
}
