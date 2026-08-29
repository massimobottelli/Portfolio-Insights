/**
 * Motore IRR (Internal Rate of Return) — Funzioni pure
 *
 * Implementa l'algoritmo di Newton-Raphson per trovare il tasso che
 * azzera il Net Present Value (NPV) di una serie di flussi di cassa.
 *
 * Design: tutte le funzioni sono pure (nessun side-effect), deterministiche,
 * e testabili senza dipendenze esterne o database.
 */

// ──────────────────────────────────────────────
// NPV base
// ──────────────────────────────────────────────

/**
 * Calcola il Net Present Value dato un array di pesi temporali e un tasso.
 *
 * @param {{ amount: number, timeWeight: number }[]} cashFlowsWithWeights
 *   Ogni elemento ha `amount` (flusso monetario) e `timeWeight` (peso temporale normalizzato).
 * @param {number} rate
 *   Tasso di sconto per il calcolo del valore attuale.
 * @returns {number} NPV calcolato.
 */
export function npv(cashFlowsWithWeights, rate) {
  return cashFlowsWithWeights.reduce(
    (sum, cf) => sum + cf.amount / Math.pow(1 + rate, cf.timeWeight),
    0
  );
}

// ──────────────────────────────────────────────
// Derivata prima di NPV
// ──────────────────────────────────────────────

/**
 * Calcola la derivata prima di NPV rispetto al rate.
 *
 * f(r) = Σ [ CF_i / (1+r)^w_i ]
 * f'(r) = Σ [ -w_i × CF_i / (1+r)^(w_i+1) ]
 *
 * @param {{ amount: number, timeWeight: number }[]} cashFlowsWithWeights
 * @param {number} rate
 * @returns {number} Derivata prima di NPV valutata al dato rate.
 */
export function npvDerivative(cashFlowsWithWeights, rate) {
  return cashFlowsWithWeights.reduce(
    (sum, cf) =>
      sum + (-cf.timeWeight * cf.amount) / Math.pow(1 + rate, cf.timeWeight + 1),
    0
  );
}

// ──────────────────────────────────────────────
// Solver IRR — Newton-Raphson con fallback bisezione
// ──────────────────────────────────────────────

/**
 * Risolve l'IRR usando Newton-Raphson su una serie di flussi di cassa.
 * Se Newton-Raphson diverge, usa il metodo di bisezione (più robusto).
 *
 * Algoritmo:
 *   1. Validazione input (almeno 2 flussi, entrambi positivo e negativo presenti)
 *   2. Ordinamento cronologico
 *   3. Calcolo pesi temporali in anni decimali (t_0 → 0, t_n → durata reale)
 *   4. Newton-Raphson per 30 iterazioni; se diverge → switch a bisezione
 *   5. Validazione risultato (rate > -1, finite)
 *
 * @param {{ date: string, amount: number }[]} cashFlows
 *   Array di oggetti `{ date, amount }` dove `date` è ISO string (YYYY-MM-DD)
 *   e `amount` è il flusso di cassa (negativo = uscita, positivo = entrata).
 * @returns {number|null} IRR annualizzato in forma decimale (es. 0,0847 = +8,47%),
 *   oppure null se irrisolvibile.
 */
export function solveIRR(cashFlows) {
  // 1. Validazione: almeno 2 flussi
  if (!cashFlows || !Array.isArray(cashFlows) || cashFlows.length < 2) {
    return null;
  }

  // 2. Ordina per data crescente (non mutare l'array originale)
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));

  // 3. Calcola timeWeights in ANNI DECIMALI (non frazioni normalizzate!)
  //    L'IRR annualizzato richiede che esponente = anni tra flusso e inizio periodo.
  //    Si usa 365.25 per gestire correttamente gli anni bisestili.
  const firstMs = new Date(sorted[0].date).getTime();
  const lastMs = new Date(sorted[sorted.length - 1].date).getTime();
  const totalDays = (lastMs - firstMs) / (1000 * 60 * 60 * 24);

  if (totalDays <= 0) {
    return null; // Tutti i flussi nella stessa data
  }

  const weights = sorted.map((cf) => ({
    amount: cf.amount,
    timeWeight:
      (new Date(cf.date).getTime() - firstMs) / (1000 * 60 * 60 * 24 * 365.25),
  }));

  // 4. Controlla che ci sia almeno un flusso positivo e uno negativo
  const hasPositive = weights.some((w) => w.amount > 0);
  const hasNegative = weights.some((w) => w.amount < 0);
  if (!hasPositive || !hasNegative) {
    return null; // Nessun flusso netto possibile
  }

  // 5. Newton-Raphson con limiti di sicurezza
  let rate = 0.1;
  let iterations = 0;
  let npvStableCount = 0;

  while (iterations < 80) {
    const fv = npv(weights, rate);
    const fp = npvDerivative(weights, rate);

    if (Math.abs(fp) < 1e-15) {
      return null; // Derivata quasi-zero
    }

    const nextRate = rate - fv / fp;

    // Se NR va fuori range accettabile o NaN, passa a bisezione
    if (nextRate <= -0.99 || nextRate >= 10 || Number.isNaN(nextRate) || !Number.isFinite(nextRate)) {
      // Bisection amplia: prova prima [-0.99, +2.0] (copre fino al 200%)
      let lo = -0.99;
      let hi = 2.0;
      let fLo = npv(weights, lo);
      let fHi = npv(weights, hi);

      // Se NPV non cambia segno, estendi l'intervallo verso l'alto
      while (fLo * fHi > 0 && hi < 50) {
        hi *= 2; // raddoppia fino a coprire rendimenti enormi
        fHi = npv(weights, hi);
        if (hi >= 50) break; // max 5000% per evitare loop infiniti
      }

      if (fLo * fHi > 0) {
        return null; // Nessuno cambio di segno anche con intervallo ampio
      }

      // Assicura che fLo < 0 e fHi > 0 (inverti se necessario)
      if (fLo > 0) {
        [lo, hi] = [hi, lo];
        [fLo, fHi] = [fHi, fLo];
      }

      // Bisection pura (200 iterazioni max per alta precisione)
      for (let bi = 0; bi < 200; bi++) {
        const mid = (lo + hi) / 2;
        const fMid = npv(weights, mid);
        if (Math.abs(fMid) < 1e-10) {
          rate = mid;
          break;
        }
        if (fLo * fMid < 0) {
          hi = mid;
        } else {
          lo = mid;
          fLo = fMid;
        }
      }
      rate = (lo + hi) / 2;

      if (rate > -1 && Number.isFinite(rate)) {
        return rate;
      }
      return null;
    }

    rate = nextRate;

    // Convergenza rapida?
    const currentFv = Math.abs(npv(weights, rate));
    if (currentFv < 1e-6 && npvStableCount >= 2) {
      if (rate > -1 && Number.isFinite(rate)) {
        return rate;
      }
      return null;
    }
    npvStableCount++;

    iterations++;
  }

  // Fallback finale
  if (Number.isFinite(rate) && rate > -1 && rate < 10) {
    if (Math.abs(npv(weights, rate)) < 1) {
      return rate;
    }
  }

  return null;
}

