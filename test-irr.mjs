import { db } from './database.js';
import { calculateAssetIRR, buildAssetCashFlows } from './models/analyticsModel.js';
import { solveIRR } from './utils/irrEngine.js';
import { correctedQuantity } from './utils/domainHelpers.js';

const assetId = '6235d507-c53f-4fb5-88ec-2218ef4d73b7'; // VUAA

console.log('=== Step-by-step IRR calculation ===');

// Step 1: Cash flows
let flows = buildAssetCashFlows(assetId);
console.log('Step 1 - Cash flows:', flows?.length || 0, 'flows');
if (flows && flows.length > 0) {
  console.log('  First flow:', JSON.stringify(flows[0]));
  console.log('  Last flow:', JSON.stringify(flows[flows.length - 1]));
}

if (!flows || flows.length === 0) {
  console.log('ABORT: no cash flows');
  process.exit(1);
}

// Step 2: Price info & quantity
const priceInfo = db.prepare(`
  SELECT current_price, extraction_date FROM asset_prices WHERE asset_id = ? ORDER BY extraction_date DESC LIMIT 1
`).get(assetId);
console.log('Step 2 - Price info:', JSON.stringify(priceInfo));

const qtyRaw = db.prepare("SELECT SUM(CASE WHEN type = 'SELL' THEN -quantity ELSE quantity END) AS net_qty FROM market_orders WHERE asset_id = ?").get(assetId)?.net_qty;
console.log('Step 2 - Raw qty:', qtyRaw);

const displayQty = correctedQuantity('VANGUARD S&P 500 UCITS ETF ACC', 'VUAA', qtyRaw);
console.log('Step 2 - Display qty (corrected):', displayQty);

// Step 3: Check position open
if (!qtyRaw || qtyRaw <= 0) {
  console.log('ABORT: closed position or no qty');
  process.exit(1);
}
console.log('Step 3 - Position is OPEN (netQty > 0)');

// Step 4: Add current value as final positive flow
if (priceInfo && priceInfo.current_price !== null && displayQty > 0) {
  const currentValue = parseFloat((displayQty * priceInfo.current_price).toFixed(2));
  console.log('Step 4 - Current value:', currentValue);
  
  const lastFlowDate = flows[flows.length - 1].date;
  const extractDate = priceInfo.extraction_date.split(' ')[0].replace(/\//g, '-');
  console.log('Step 4 - Last flow date:', lastFlowDate, '| Extract date:', extractDate);
  
  if (lastFlowDate < extractDate) {
    flows.push({ date: extractDate, amount: currentValue });
  } else {
    flows[flows.length - 1] = {
      date: lastFlowDate,
      amount: parseFloat((flows[flows.length - 1].amount + currentValue).toFixed(2))
    };
  }
  console.log('Step 4 - Total flows after adding current value:', flows.length);
  console.log('Step 4 - Final flow:', JSON.stringify(flows[flows.length - 1]));
}

if (flows.length < 2) {
  console.log('ABORT: less than 2 flows');
  process.exit(1);
}

// Step 5: Solve IRR
console.log('Step 5 - Calling solveIRR...');
const irr = solveIRR(flows);
console.log('Step 5 - IRR result:', irr);
console.log('Step 5 - Is finite?', Number.isFinite(irr));
console.log('Step 5 - Is > -1?', irr > -1);

if (irr === null || irr <= -1 || !Number.isFinite(irr)) {
  console.log('ABORT: invalid IRR');
  process.exit(1);
}

// Step 6: Build result
const firstDate = flows[0].date;
const lastDate = flows[flows.length - 1].date;
const days = (new Date(lastDate) - new Date(firstDate)) / (1000 * 60 * 60 * 24);
const years = days / 365.2425;

const result = {
  irr: parseFloat(irr.toFixed(6)),
  years: Math.max(parseFloat(years.toFixed(4)), 0),
  firstDate,
  lastDate
};

console.log('Step 6 - Final result:', JSON.stringify(result));

// Now call the actual function
console.log('\n=== Call to calculateAssetIRR(id) ===');
const irrResult = calculateAssetIRR(assetId);
console.log('calculateAssetIRR returned:', JSON.stringify(irrResult));
console.log('Type:', typeof irrResult);
console.log('Keys:', Object.keys(irrResult ?? {}));
