/**
 * AssetTypeIRRTable - Tabella IRR per tipo asset nella pagina Performance.
 * Layout a righe raggruppate con sotto-righe indentate per singolo asset.
 */
import { useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import type { PositionItem } from "../../types";
import type { AssetTypeIRRResponse } from "../../lib/performanceApi";
import {
  formatAmount,
  formatPercent,
  gainColorClass,
  getAssetTypeStyle,
} from "../../lib/format";

const TYPE_ORDER = ["STOCK", "BOND", "COMMODITY", "FUND", "CASH"];
const getTypeOrderIndex = (type: string): number => {
  const idx = TYPE_ORDER.indexOf(type);
  return idx === -1 ? Infinity : idx;
};
interface GroupedAsset {
  asset_id: string;
  ticker: string;
  name: string;
  quantity: number;
  averagePrice: number | null;
  currentPrice: number | null;
  bookValueEUR: number | null;
  currentValueEUR: number | null;
  gainEur: number | null;
  gainPct: number | null;
}
interface AggregatedGroup {
  assetType: string;
  carico: number;
  attuale: number;
  gainEur: number;
  gainPct: number | null;
  count: number;
  irr: AssetTypeIRRResponse | null;
  assets: (Omit<GroupedAsset, "asset_type"> & { irr: IndividualAssetIRR | null })[];
}

/** IRR per singolo asset (asset_id → { irr, years }) */
interface IndividualAssetIRR {
  irr: number | null;
  years: number | null;
}

/** Helper per em-dash — evita problemi di encoding UTF-8 in JSX */
const DASH = String.fromCharCode(8212); // U+2014 EM DASH

// I BTP (Buoni del Tesoro Poliennali) sono quotati in percentuale (es. 102.50),
// quindi la quantità importata da Directa va divisa per 100 per riflettere il valore nominale effettivo.
const isBtp = (pos: PositionItem) =>
  pos.name.toLowerCase().includes('btp') || pos.ticker.toLowerCase().includes('btp');

const displayQuantity = (pos: PositionItem) => (isBtp(pos) ? pos.quantity / 100 : pos.quantity);

const calcPositionMetrics = (
  pos: PositionItem,
): Omit<GroupedAsset, "asset_type"> => {
  // Per i BTP la quantità va divisa per 100 (prezzi quotati in % del nominale).
  const qty = displayQuantity(pos);
  // Carico: prezzo medio × quantità (quantità BTP già normalizzata da displayQuantity).
  const carico = pos.average_price_eur != null
    ? pos.average_price_eur * qty
    : pos.average_price != null
      ? pos.average_price * qty
      : null;
  // Valore attuale: prezzo corrente × quantità (quantità BTP già normalizzata).
  const attuale = pos.current_price_eur != null
    ? pos.current_price_eur * qty
    : pos.current_price != null
      ? pos.current_price * qty
      : null;
  const gainEur = carico != null && attuale != null ? attuale - carico : null;
  const gainPct =
    carico != null && carico !== 0 && gainEur != null
      ? (gainEur / carico) * 100
      : null;
  return {
    asset_id: pos.asset_id,
    ticker: pos.ticker,
    name: pos.name,
    quantity: qty,
    averagePrice: pos.average_price,
    currentPrice: pos.current_price,
    bookValueEUR: carico,
    currentValueEUR: attuale,
    gainEur,
    gainPct,
  };
};
export default function AssetTypeIRRTable({
  irrs,
  positions,
  assetIrrs,
}: {
  irrs: Record<string, AssetTypeIRRResponse | null>;
  positions: PositionItem[];
  assetIrrs: Record<string, { irr: number | null; years: number | null }>;
}) {
  const navigate = useNavigate();

  const groups = useMemo(() => {
    const categoryMap = new Map<string, GroupedAsset[]>();
    for (const pos of positions) {
      const key = pos.asset_type || "UNKNOWN";
      if (!categoryMap.has(key)) categoryMap.set(key, []);
      categoryMap.get(key)!.push(calcPositionMetrics(pos));
    }
    const allTypes = new Set([...Object.keys(irrs), ...categoryMap.keys()]);
    const result: AggregatedGroup[] = [];
    for (const assetType of allTypes) {
      if (assetType === "UNKNOWN") continue;
      const assets = categoryMap.get(assetType) || [];
      if (assets.length === 0) continue;
      // Ordine uguale a Portfolio.tsx: mantengo l'ordine originale dell'API, nessun sort aggiuntivo
      const carico = assets.reduce((s, a) => s + (a.bookValueEUR ?? 0), 0);
      const attuale = assets.reduce((s, a) => s + (a.currentValueEUR ?? 0), 0);
      result.push({
        assetType,
        carico,
        attuale,
        gainEur: attuale - carico,
        gainPct: carico !== 0 ? ((attuale - carico) / carico) * 100 : null,
        count: assets.length,
        irr: irrs[assetType] ?? null,
        assets: assets.map((a) => ({
          ...a,
          irr: assetIrrs[a.asset_id] ?? null,
        })),
      });
    }
    result.sort(
      (a, b) => getTypeOrderIndex(a.assetType) - getTypeOrderIndex(b.assetType),
    );
    return result;
  }, [irrs, positions, assetIrrs]);

  console.log('[AssetTypeIRRTable] groups:', JSON.stringify(groups.map(g => ({ type: g.assetType, ids: g.assets.map(a => a.asset_id), irrPresent: g.assets.some(a => a.irr != null) }))));
  
  const sampleAsset = groups[0]?.assets?.[0];
  if (sampleAsset) {
    console.log('[AssetTypeIRRTable] SAMPLE ASSET:', JSON.stringify({ id: sampleAsset.asset_id, ticker: sampleAsset.ticker }));
    console.log('[AssetTypeIRRTable] assetIrrs for first asset:', JSON.stringify(assetIrrs[sampleAsset.asset_id]));
    console.log('[AssetTypeIRRTable] ALL assetIrrs keys:', JSON.stringify(Object.keys(assetIrrs)));
  }
  const total = useMemo(() => {
    const carico = groups.reduce((s, g) => s + g.carico, 0);
    const attuale = groups.reduce((s, g) => s + g.attuale, 0);
    return {
      carico,
      attuale,
      gainEur: attuale - carico,
      gainPct: carico !== 0 ? ((attuale - carico) / carico) * 100 : null,
      count: groups.reduce((s, g) => s + g.count, 0),
    };
  }, [groups]);
  if (groups.length === 0) return null;
  return _renderTable(groups, total, navigate);
}
function _renderTable(
  groups: AggregatedGroup[],
  total: {
    carico: number;
    attuale: number;
    gainEur: number;
    gainPct: number | null;
    count: number;
  },
  navigate: ReturnType<typeof useNavigate>,
) {
  const renderGroups = groups.map((group, gi) => {
    const style = getAssetTypeStyle(group.assetType);
    const isLastGroup = gi === groups.length - 1;
    return (
      <Fragment key={gi}>
          {/* Riga aggregata per asset type — sfondo più chiaro */}
          <tr className="bg-slate-700/20 hover:bg-slate-700/30 transition-colors">
            <td className="py-2.5 px-3 align-middle">
              <span
                className="inline-block font-medium uppercase tracking-wide"
                style={{
                  borderRadius: "6px",
                  padding: "3px 10px",
                  lineHeight: 1.2,
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.4px",
                  backgroundColor: `${style.bg}40`,
                  borderColor: style.border,
                  borderWidth: "1px",
                  color: style.text,
                }}
              >
                {group.assetType}
              </span>
            </td>
            <td className="px-3 py-2.5 text-sm text-slate-500 align-middle">
              {'—'}
            </td>
            <td className="px-3 py-2.5 text-sm text-slate-500 align-middle">
              {'—'}
            </td>
            {/* IRR aggregato per tipo */}
            {group.assets.length === 1 && group.assets[0].irr ? (
              // Unico asset nel gruppo: uso il suo IRR reale (allineato alla sottoriga)
              <td className={`px-3 py-2.5 text-sm text-right font-medium ${group.assets[0].irr.irr != null ? (group.assets[0].irr.irr >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-500"} align-middle`}>
                {group.assets[0].irr.irr != null
                  ? `${(group.assets[0].irr.irr * 100).toFixed(2).replace(".", ",")}%`
                  : DASH}
              </td>
            ) : group.irr ? (
              // Più asset nel gruppo: uso l'IRR aggregato del tipo dall'API
              <td className={`px-3 py-2.5 text-sm text-right font-medium ${group.irr.irr != null ? (group.irr.irr >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-500"} align-middle`}>
                {group.irr.irr != null
                  ? `${(group.irr.irr * 100).toFixed(2).replace(".", ",")}%`
                  : DASH}
              </td>
            ) : (
              <td className="px-3 py-2.5 text-sm text-right text-slate-500 align-middle">
                {DASH}
              </td>
            )}
            {/* Anni investiti per tipo */}
            {group.assets.length === 1 && group.assets[0].irr ? (
              <td className="px-3 py-2.5 text-sm text-right text-slate-300 align-middle">
                {group.assets[0].irr.years != null
                  ? `${group.assets[0].irr.years.toFixed(1)}`
                  : DASH}
              </td>
            ) : group.irr ? (
              <td className="px-3 py-2.5 text-sm text-right text-slate-300 align-middle">
                {group.irr.years != null
                  ? `${group.irr.years.toFixed(1)}`
                  : DASH}
              </td>
            ) : (
              <td className="px-3 py-2.5 text-sm text-right text-slate-500 align-middle">
                {DASH}
              </td>
            )}
            <td
              className={`px-3 py-2.5 text-sm text-right font-medium ${gainColorClass(group.gainPct)} align-middle`}
            >
              {formatPercent(group.gainPct)}
            </td>
            <td
              className={`px-3 py-2.5 text-sm text-right font-medium ${gainColorClass(group.gainEur)} align-middle`}
            >
              {formatAmount(group.gainEur)}
            </td>
        </tr>
        {/* Sottorighes: singolo asset per tipo */}
        {group.assets.map((asset) => (
          <tr
            key={asset.asset_id}
            className="bg-slate-800/30 hover:bg-slate-700/30 transition-colors"
          >
            <td className="py-1.5 px-3 text-sm text-transparent select-none align-middle">
              &nbsp;
            </td>
            <td className="py-1.5 px-3 pl-6 text-sm text-slate-400 align-middle">
              {asset.ticker}
            </td>
            <td className="py-1.5 px-3 text-sm min-w-[150px]" onClick={() => navigate(`/asset/${asset.asset_id}`)}>
              <span
                className="text-slate-500 hover:text-white hover:underline cursor-pointer transition-colors inline-block align-middle max-w-full"
                title={asset.name}
              >
                {asset.name}
              </span>
            </td>
            {asset.irr && (
              <td className={`px-3 py-1.5 text-sm text-right ${asset.irr.irr != null ? (asset.irr.irr >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-600"} align-middle`}>
                {asset.irr.irr != null
                  ? `${(asset.irr.irr * 100).toFixed(2).replace(".", ",")}%`
                  : DASH}
              </td>
            )}
            {!asset.irr && (
              <td className="px-3 py-1.5 text-sm text-right text-slate-600 align-middle">
                {'—'}
              </td>
            )}
            {/* Anni investiti per singolo asset */}
            <td className="px-3 py-1.5 text-sm text-right text-slate-300 align-middle">
              {asset.irr?.years != null
                ? `${asset.irr.years.toFixed(1)}`
                : DASH}
            </td>
            <td
              className={`px-3 py-1.5 text-sm text-right ${gainColorClass(
                asset.gainPct,
              )} align-middle`}
            >
              {formatPercent(asset.gainPct)}
            </td>
            <td
              className={`px-3 py-1.5 text-sm text-right ${gainColorClass(asset.gainEur)} align-middle`}
            >
              {formatAmount(asset.gainEur)}
            </td>
          </tr>
        ))}
        {!isLastGroup && (
          <tr>
            <td colSpan={7} className="py-0.5 px-3">
              <div className="border-t border-slate-700/30 mx-2" />
            </td>
          </tr>
        )}
      </Fragment>
    );
  });
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
      <div className="mb-4">
        <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider">
          Internal Rate of Return (IRR) 
        </h3>
        <p className="text-slate-400 text-xs mt-1">
          Rendimento annualizzato money-weighted per classe asset e posizione individuale
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 px-3 text-slate-400 font-medium uppercase text-xs tracking-wider min-w-[100px] align-middle">
                Tipo
              </th>
              <th className="text-left py-2 px-3 text-slate-400 font-medium uppercase text-xs tracking-wider min-w-[90px] align-middle">
                Ticker
              </th>
              <th className="text-left py-2 px-3 text-slate-400 font-medium uppercase text-xs tracking-wider min-w-[150px] align-middle">
                Nome
              </th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium uppercase text-xs tracking-wider align-middle">
                IRR
              </th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium uppercase text-xs tracking-wider align-middle whitespace-nowrap">
                Anni investiti
              </th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium uppercase text-xs tracking-wider align-middle">
                Gain/Loss %
              </th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium uppercase text-xs tracking-wider align-middle">
                Gain/Loss €
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {renderGroups}
            <tr className="border-t-2 border-slate-600 bg-slate-700/40 font-bold">
              <td className="py-3 px-3 text-sm text-white uppercase tracking-wider align-middle">
                Totale
              </td>
              <td className="px-3 py-3 text-sm text-right text-white align-middle"></td>
              <td className="px-3 py-3 text-sm text-right text-white align-middle"></td>
              <td className="px-3 py-3 text-sm text-right text-slate-500 align-middle">
                { '—' }
              </td>
              <td className="px-3 py-3 text-sm text-right text-slate-500 align-middle">
                { '—' }
              </td>
              <td
                className={`px-3 py-3 text-sm text-right ${gainColorClass(total.gainPct)} align-middle`}
              >
                {formatPercent(total.gainPct)}
              </td>
              <td
                className={`px-3 py-3 text-sm text-right ${gainColorClass(total.gainEur)} align-middle`}
              >
                {formatAmount(total.gainEur)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
