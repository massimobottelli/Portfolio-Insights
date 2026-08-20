/**
 * Diagnostic script: compares TWR (analyticsModel) vs cumulativeReturn + CAGR (performanceModel)
 * to find the source of discrepancies.
 */

import { calculateTWR } from '../models/analyticsModel.js';
import {
  buildReturnSeries,
  calculateCumulativePerformance,
  calculateCAGR,
} from '../models/performanceModel.js';

console.log('=== DIAGNOSTIC: TWR vs CAGR ===\n');

// 1. TWR from analyticsModel (Dashboard)
const twrResult = calculateTWR();
console.log('--- TWR (analyticsModel.js - Dashboard) ---');
console.log('TWR Total:', (twrResult.twrTotal * 100).toFixed(4) + '%');
console.log('TWR YTD:', (twrResult.twrYTD * 100).toFixed(4) + '%');
console.log('TWR History length:', twrResult.twrHistory.length);
if (twrResult.twrHistory.length > 0) {
  console.log('First TWR entry:', twrResult.twrHistory[0]);
  console.log('Last TWR entry:', twrResult.twrHistory[twrResult.twrHistory.length - 1]);
}

// 2. Return series from performanceModel (Performance page) — NO filter (simulates 'all')
const series = buildReturnSeries({});
console.log('\n--- Return Series (performanceModel.js - Performance page, no filter) ---');
console.log('Series length:', series.length);
if (series.length > 0) {
  console.log('First date:', series[0].date);
  console.log('Last date:', series[series.length - 1].date);
  const elapsedDays = (new Date(series[series.length - 1].date) - new Date(series[0].date)) / (1000 * 60 * 60 * 24);
  console.log('Elapsed days:', elapsedDays);
  console.log('Years:', (elapsedDays / 365.2425).toFixed(4));
}

// 3. Cumulative performance
const cumulativePerf = calculateCumulativePerformance(series);
console.log('\n--- Cumulative Performance ---');
console.log('Cumulative Return:', (cumulativePerf.cumulativeReturn * 100).toFixed(4) + '%');
if (cumulativePerf.points.length > 0) {
  console.log('First point:', cumulativePerf.points[0]);
  console.log('Last point:', cumulativePerf.points[cumulativePerf.points.length - 1]);
}

// 4. CAGR
const cagr = calculateCAGR(series);
console.log('\n--- CAGR ---');
console.log('CAGR:', cagr.cagr !== null ? (cagr.cagr * 100).toFixed(4) + '%' : 'null');
console.log('Years:', cagr.years);
console.log('Period < 1 year:', cagr.periodLessThanOneYear);

// 5. Manual CAGR verification
if (cumulativePerf.cumulativeReturn > -1 && cagr.years && cagr.years > 0) {
  const manualCagr = Math.pow(1 + cumulativePerf.cumulativeReturn, 1 / cagr.years) - 1;
  console.log('\n--- Manual CAGR Verification ---');
  console.log('Manual CAGR:', (manualCagr * 100).toFixed(4) + '%');
  console.log('Matches reported CAGR:', Math.abs(manualCagr - cagr.cagr) < 0.0001);
}

// 6. What CAGR WOULD be if cumulativeReturn were 13.75% over 2.2 years
console.log('\n--- Expected CAGR for reference ---');
const expectedCagr_13p75_2y = Math.pow(1 + 0.1375, 1 / 2.2) - 1;
console.log('If TWR=13.75% over 2.2 years, CAGR should be:', (expectedCagr_13p75_2y * 100).toFixed(4) + '%');

// 7. What cumulativeReturn would give CAGR=29.1% over 2.2 years
const years = cagr.years || 2.2;
const impliedCumulativeReturn = Math.pow(1 + 0.291, 1 / years) - 1;
console.log('If CAGR=29.1% over', years.toFixed(2), 'years, cumulativeReturn would be:', (impliedCumulativeReturn * 100).toFixed(4) + '%');