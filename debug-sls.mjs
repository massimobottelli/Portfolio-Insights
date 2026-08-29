import { DatabaseSync } from 'node:sqlite';
import { solveIRR } from './utils/irrEngine.js';

const db = new DatabaseSync('db/portfolio.db');
const ASSET_ID = '2a2fd106-e8ed-44c4-8092-02f2bbba9054'; // .SLS

console.log('=== DEBUG .SLS ===\n');

// Step 1: Orders
const orders = db.prepare(`SELECT operation_date, euro_amount FROM market_orders WHERE asset_id = ? ORDER BY operation_date ASC`).all(ASSET_ID);
console.log('Step 1 - Orders:', orders.length);
orders.forEach(o => console.log('   ', o.operation_date, '+/-', o.euro_amount));

// Step 2: Dividends + Coupons
const dividends = db.prepare(`SELECT operation_date, euro_amount FROM cash_movements WHERE asset_id = ? AND movement_type = 'DIVIDEND'`).all(ASSET_ID);
const coupons = db.prepare(`SELECT operation_date, euro_amount FROM cash_movements WHERE asset_id = ? AND movement_type = 'INTEREST'`).all(ASSET_ID);
console.log('\nStep 2 - Dividends:', dividends.length, 'Coupons:', coupons.length);

// Step 3: Combine & aggregate
const allFlows = [...orders, ...dividends, ...coupons];
allFlows.sort((a, b) => a.operation_date.localeCompare(b.operation_date));

const flowMap = {};
for (const f of allFlows) {
  flowMap[f.operation_date] = (flowMap[f.operation_date] || 0) + f.euro_amount;
}

const flows = Object.entries(flowMap).map(([date, amount]) => ({
  date,
  amount: parseFloat(amount.toFixed(2))
}));

console.log('\nStep 3 - Aggregated flows:', flows.length);
flows.forEach(f => console.log('   ', f.date, f.amount));

// Step 4: Price info
const priceInfo = db.prepare(`SELECT current_price, extraction_date FROM asset_prices WHERE asset_id = ? ORDER BY extraction_date DESC LIMIT 1`).get(ASSET_ID);
const qtyRaw = db.prepare("SELECT SUM(CASE WHEN type = 'SELL' THEN -quantity ELSE quantity END) AS net_qty FROM market_orders WHERE asset_id = ?").get(ASSET_ID)?.net_qty;
console.log('\nStep 4 - Net qty:', qtyRaw);
console.log('         Price info:', JSON.stringify(priceInfo));

// Step 5: Add current value
let finalFlows = flows;
if (priceInfo && priceInfo.current_price !== null && qtyRaw > 0) {
  const currentValue = parseFloat((qtyRaw * priceInfo.current_price).toFixed(2));
  console.log('\nStep 5 - Current value:', currentValue, '(qty', qtyRaw, '* price', priceInfo.current_price, ')');
  
  const lastFlowDate = flows[flows.length - 1].date;
  const extractDate = priceInfo.extraction_date.split(' ')[0].replace(/\//g, '-');
  console.log('       Last flow date:', lastFlowDate);
  console.log('       Extract date:  ', extractDate);
  console.log('       last < extract?', lastFlowDate < extractDate);
  
  if (lastFlowDate < extractDate) {
    finalFlows.push({ date: extractDate, amount: currentValue });
    console.log('       -> Added as NEW last flow');
  } else {
    finalFlows[finalFlows.length - 1] = {
      date: lastFlowDate,
      amount: parseFloat((finalFlows[finalFlows.length - 1].amount + currentValue).toFixed(2))
    };
    console.log('       -> Added to EXISTING last flow (old=', flows[flows.length - 1].amount, ', new=', finalFlows[finalFlows.length - 1].amount, ')');
  }
} else {
  console.log('\nStep 5 - SKIPPED: priceInfo=', !!priceInfo, 'price=', priceInfo?.current_price, 'qty=', qtyRaw);
}

console.log('\nFinal flows:', finalFlows.length);
finalFlows.forEach(f => console.log('  ', f.date, f.amount));

// Step 6: Solve IRR
try {
  const irr = solveIRR(finalFlows);
  console.log('\n=== IRR =', irr === null ? 'NULL' : (irr * 100).toFixed(4) + '%', '===');
} catch(e) {
  console.log('\nError:', e.message);
}

db.close();