import { initializeDatabase } from '../database.js';
initializeDatabase();
import { saveAllocationTarget, getAllocationTargets, calculateRebalancingSuggestions } from '../models/allocationModel.js';

// Test salvataggio valido
console.log('=== Salvataggio target valido ===');
const saved = saveAllocationTarget(5, [
  { assetType: 'BOND', targetPercent: 40 },
  { assetType: 'STOCK', targetPercent: 30 },
  { assetType: 'CASH', targetPercent: 10 },
  { assetType: 'FUND', targetPercent: 15 },
  { assetType: 'COMMODITY', targetPercent: 5 }
]);
console.log(JSON.stringify(saved, null, 2));

// Test suggerimenti dopo salvataggio
console.log('=== Suggerimenti dopo salvataggio ===');
console.log(JSON.stringify(await calculateRebalancingSuggestions(), null, 2));

// Test validazione: categoria non target-abile
console.log('=== Test categoria non target-abile ===');
try {
  saveAllocationTarget(5, [{ assetType: 'UNKNOWN', targetPercent: 100 }]);
  console.log('ERRORE: non ha lanciato eccezione');
} catch (e) {
  console.log('OK: ' + e.message);
}