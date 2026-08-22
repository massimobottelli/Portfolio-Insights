import { randomUUID } from 'node:crypto';
import { db } from '../database.js';
import { TARGETABLE_ASSET_TYPES } from '../config/assetTypes.js';
import { calculateCashBalance, calculatePositions } from './analyticsModel.js';
import { correctedQuantity } from '../utils/domainHelpers.js';

/**
 * Ottiene il catalogo asset type dalla tabella DB.
 * @returns {Array<{id: string, name: string, is_targetable: number}>}
 */
export function getAssetTypes() {
  return db
    .prepare('SELECT id, name, is_targetable FROM asset_types ORDER BY is_targetable DESC, name ASC')
    .all();
}

/**
 * Ottiene il target di allocazione configurato.
 * @returns {{tolerance: number, targets: Array<{assetType: string, targetPercent: number}>}}
 */
export function getAllocationTargets() {
  const rows = db
    .prepare(`
      SELECT at.name AS asset_type, alt.target_percent, alt.tolerance
      FROM allocation_targets alt
      JOIN asset_types at ON at.id = alt.asset_type_id
      ORDER BY at.name ASC
    `)
    .all();

  // La tolerance è globale: la prendiamo dal primo record (o default 5)
  const tolerance = rows.length > 0 ? rows[0].tolerance : 5.0;

  return {
    tolerance,
    targets: rows.map(r => ({
      assetType: r.asset_type,
      targetPercent: r.target_percent
    }))
  };
}

/**
 * Salva il target di allocazione (transazionale).
 * @param {number} tolerance - Soglia di tolleranza globale (> 0)
 * @param {Array<{assetType: string, targetPercent: number}>} targets - Target per categoria
 * @returns {{tolerance: number, targets: Array<{assetType: string, targetPercent: number}>}}
 */
export function saveAllocationTarget(tolerance, targets) {
  // node:sqlite DatabaseSync non espone .transaction(): usiamo BEGIN/COMMIT/ROLLBACK manuali
  db.exec('BEGIN');
  try {
    // Cancella i target esistenti
    db.prepare('DELETE FROM allocation_targets').run();

    // Inserisce i nuovi target
    const insert = db.prepare(`
      INSERT INTO allocation_targets (id, asset_type_id, target_percent, tolerance)
      VALUES (?, ?, ?, ?)
    `);

    for (const t of targets) {
      const typeRow = db
        .prepare('SELECT id FROM asset_types WHERE name = ? AND is_targetable = 1')
        .get(t.assetType);
      if (!typeRow) {
        throw new Error(`Categoria non target-abile: ${t.assetType}`);
      }
      insert.run(
        randomUUID(),
        typeRow.id,
        t.targetPercent,
        tolerance
      );
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getAllocationTargets();
}

/**
 * Calcola l'allocazione attuale del portafoglio per categoria.
 *
 * Base di calcolo: totale = somma(valore mercato posizioni) + liquidità disponibile.
 * La liquidità (available_cash) viene aggiunta alla categoria CASH e al totale,
 * così il totale è coerente con il Valore Portafoglio della Dashboard.
 *
 * @returns {{totalValue: number, categories: Array<{assetType: string, value: number, percent: number}>}}
 */
export async function calculateCurrentAllocation() {
  // 1. Posizioni attive con prezzo corrente.
  // Riusa calculatePositions() di analyticsModel: la query era duplicata qui e
  // NON passava dalla cache, quindi ogni chiamata ricalcolava tutto (join +
  // conversioni ECB). Ora sfrutta la cache condivisa (TTL 5 min).
  const positions = await calculatePositions();

  // 2. Valore di mercato per posizione (con correzione BTP), convertito in EUR.
  // I prezzi sono già convertiti in EUR da calculatePositions (current_price_eur).
  // Se l'asset è in valuta estera ma il tasso ECB non è disponibile
  // (current_price_eur null), l'asset viene escluso dal totale:
  // sommarlo al cambio originale distorcerebbe l'allocazione.
  const categoryValues = {};
  let totalPositionsValue = 0;

  for (const pos of positions) {
    if (pos.current_price === null) continue;
    const isNonEurWithoutRate =
      pos.currency && pos.currency !== 'EUR' && pos.current_price_eur === null;
    if (isNonEurWithoutRate) continue;

    const qty = correctedQuantity(pos.name, pos.ticker, pos.quantity);
    const priceEUR = pos.current_price_eur ?? pos.current_price;
    const marketValue = qty * priceEUR;
    const type = pos.asset_type || 'UNKNOWN';
    categoryValues[type] = (categoryValues[type] || 0) + marketValue;
    totalPositionsValue += marketValue;
  }

  // 3. La liquidità disponibile (available_cash) viene aggiunta alla categoria CASH
  // e al totale: il portafoglio è composto da posizioni + liquidità.
  // Questo rende il totale coerente con la Dashboard (Valore Portafoglio).
  const cashBalance = calculateCashBalance();
  categoryValues['CASH'] = (categoryValues['CASH'] || 0) + cashBalance;
  const totalValue = totalPositionsValue + cashBalance;

  if (totalValue === 0) {
    return { totalValue: 0, categories: [] };
  }

  // 4. Costruisce la risposta per tutte le categorie (incluse quelle a 0)
  const allTypes = getAssetTypes();
  const categories = allTypes
    .map(t => {
      const value = categoryValues[t.name] || 0;
      return {
        assetType: t.name,
        value: parseFloat(value.toFixed(2)),
        percent: parseFloat(((value / totalValue) * 100).toFixed(2))
      };
    })
    .filter(c => c.value > 0);

  return {
    totalValue: parseFloat(totalValue.toFixed(2)),
    categories
  };
}

/**
 * Calcola le divergenze tra allocazione attuale e target.
 * @returns {Array<{assetType: string, currentPercent: number, targetPercent: number, divergencePercent: number, divergenceAmount: number}>}
 */
export async function calculateDivergences() {
  const current = await calculateCurrentAllocation();
  const target = getAllocationTargets();

  const currentMap = {};
  for (const c of current.categories) {
    currentMap[c.assetType] = c;
  }

  const targetMap = {};
  for (const t of target.targets) {
    targetMap[t.assetType] = t.targetPercent;
  }

  // Considera tutte le categorie target-abili
  return TARGETABLE_ASSET_TYPES.map(type => {
    const currentPercent = currentMap[type] ? currentMap[type].percent : 0;
    const targetPercent = targetMap[type] || 0;
    const divergencePercent = currentPercent - targetPercent;
    const divergenceAmount = (divergencePercent / 100) * current.totalValue;

    return {
      assetType: type,
      currentPercent: parseFloat(currentPercent.toFixed(2)),
      targetPercent: parseFloat(targetPercent.toFixed(2)),
      divergencePercent: parseFloat(divergencePercent.toFixed(2)),
      divergenceAmount: parseFloat(divergenceAmount.toFixed(2))
    };
  });
}

/**
 * Calcola i suggerimenti di ribilanciamento.
 * Un suggerimento compare solo se la deviazione assoluta supera la soglia di tolleranza.
 * L'importo suggerito è l'importo esatto per allinearsi al target.
 *
 * @returns {Array<{assetType: string, action: 'BUY'|'SELL', amount: number, divergencePercent: number}>}
 */
export async function calculateRebalancingSuggestions() {
  const divergences = await calculateDivergences();
  const { tolerance } = getAllocationTargets();

  return divergences
    .filter(d => Math.abs(d.divergencePercent) > tolerance)
    .map(d => ({
      assetType: d.assetType,
      action: d.divergencePercent < 0 ? 'BUY' : 'SELL',
      amount: Math.abs(d.divergenceAmount),
      divergencePercent: d.divergencePercent
    }));
}

/**
 * Conta gli asset non classificati (UNKNOWN) attualmente posseduti.
 * Esclude gli asset con quantità netta 0 (non più in portafoglio),
 * perché la pagina Portfolio mostra solo le posizioni attive.
 * @returns {number} Numero di asset UNKNOWN con posizione attiva
 */
export function countUnknownAssets() {
  const result = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT a.id
        FROM assets a
        JOIN market_orders mo ON mo.asset_id = a.id
        WHERE a.asset_type = 'UNKNOWN'
        GROUP BY a.id
        HAVING SUM(CASE WHEN mo.type = 'BUY' THEN mo.quantity ELSE -mo.quantity END) > 0
      )
    `)
    .get();
  return result ? result.count : 0;
}
