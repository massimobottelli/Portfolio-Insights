import { getAllAssets, getAssetByIsin, getAssetById } from '../models/assetModel.js';

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