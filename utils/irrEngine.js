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
// Solver IRR — Newton-Raphson
// ──────────────────────────────────────────────

/**
 * Risolve l'IRR usando Newton-Raphson su una serie di flussi di cassa.
 *
 * Algoritmo:
 *   1. Validazione input (almeno 2 flussi, entrambi positivo e negativo presenti)
 *   2. Ordinamento cronologico
 *   3. Calcolo pesi temporali in anni decimali (t_0 → 0, t_n → durata reale)
 *   4. Iterazioni Newton-Raphson fino a convergenza (< 1e-9) o max 100 iterazioni
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

  // 5. Newton-Raphson
  let rate = 0.1; // Guess iniziale: 10%
  let iterations = 0;

  while (iterations < 100) {
    const fv = npv(weights, rate);
    const fp = npvDerivative(weights, rate);

    if (Math.abs(fp) < 1e-15) {
      return null; // Derivata quasi-zero
    }

    const nextRate = rate - fv / fp;

    if (Math.abs(nextRate - rate) < 1e-9) {
      if (nextRate > -1 && Number.isFinite(nextRate)) {
        return nextRate;
      }
      return null; // Convergenza a valore non valido
    }

    rate = nextRate;
    iterations++;
  }

  return null; // Non converge in 100 iterazioni
}

