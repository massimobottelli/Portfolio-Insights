# Performance & Risk — Task Tracking

Checklist per tracciare l'avanzamento delle fasi di implementazione.

## Fase 0 — Baseline e analisi del codice
**Obiettivo:** Verificare che tutto funzioni PRIMA di qualsiasi cambiamento. Test, build, lint esistenti passano. TWR esistente identificato. Semantica cash flow documentata.

- [x] Fase 0 — Baseline e analisi del codice ✅

**Esito dettagliato:**
- **Snapshot in DB:** 805 record, periodo 2024-06-05 → 2026-08-18 (~2 anni)
- **Build frontend:** `npm run build:all` ✅ PASSA (2.34s, 2614 modules)
- **TypeScript:** `npm run typecheck` ✅ PASSA (zero errori)
- **Test esistenti:** ❌ Nessuno nel progetto (né Jest, Vitest, Mocha; solo test dipendenze terze party)
- **Linter:** ❌ Nessuno configurato
- **TWR identificato:** `calculateTWR()` in `analyticsModel.js` linee ~501-629
- **Semantica cash flow:** DEPOSIT/WITHDRAWAL/OTHER = flussi esterni reali; DIVIDEND/INTEREST/COMMISSION/TAX/STAMP_DUTY = già inclusi nel portfolio_value
- **Movement type in DB:** COMMISSION✅, DEPOSIT✅, DIVIDEND✅, INTEREST✅, OTHER✅, STAMP_DUTY✅, TAX✅, WITHDRAWAL❌ (supportato ma nessun record)
- **Endpoint analytics:** 7 endpoint (`/dashboard`, `/portfolio`, `/allocation`, `/history`, `/twr`, `/rates`, `/asset/:id`)
- **Schema snapshots:** 6 colonne (`id`, `snapshot_date`, `portfolio_value`, `available_cash`, `invested_capital`, `import_session_id`)
- **Problemi rilevati:** Nessun test suite (critico per Fase 1), nessun linter
- **File creati:** `docs/FASE0-BASELINE.md` (report completo), `docs/PAR_TASKS.md` (aggiornato)


## Fase 1 — Canonical Daily Return Series
**Obiettivo:** Costruire la serie canonica dei rendimenti giornalieri da `daily_portfolio_snapshots` + `cash_movements`. Il TWR calcolato dalla serie deve essere identico a `calculateTWR()` esistente.

- [x] Fase 1 — Canonical Daily Return Series ✅

**Esito dettagliato:**
- **File creati:**
  - `models/performanceModel.js` — motore principale con `buildReturnSeries({ from, to })` e `twrFromReturns(returns)`
  - `models/__tests__/performanceModel.test.js` — 18 test unit/integration
  - `vitest.config.js` — configurazione Vitest
- **Costanti centralizzate:** `ANNUALIZATION_FACTOR = Math.sqrt(365)`
- **Cash flow semantics:** DEPOSIT → negativo, WITHDRAWAL → positivo, OTHER → come da DB; DIVIDEND/INTEREST/COMMISSION/TAX/STAMP_DUTY esclusi
- **Algoritmo TWR:** Sub-periodi delimitati da flussi esterni; `periodReturn` su flusso = sub-period return; `periodReturn` senza flusso = day-to-day incrementale
- **Regression test:** `twrFromReturns(buildReturnSeries())` matches `calculateTWR().twrTotal` entro tolleranza 4 decimali ✅
- **Test risultati:** 18/18 passati ✅
  - 7 test `twrFromReturns` (pure function)
  - 3 test no-flow (crescita, declino, unchanged)
  - 3 test con deposit/witdrawal
  - 4 test edge cases (single point, same-day flow, multi-movement, date filter)
  - 1 regression test vs calculateTWR()
- **Build frontend:** ✅ PASSA
- **DB schema:** nessuna modifica ✅

---

## TO DO:

## Fase 2 — Cumulative Performance + CAGR
**Obiettivo:** Calcolare cumulative return, cumulative performance series e CAGR usando esclusivamente la serie della Fase 1.

- [x] Fase 2 — Cumulative Performance + CAGR ✅

**Esito dettagliato:**
- **Funzioni aggiunte a `models/performanceModel.js`:**
  - `calculateCumulativePerformance(returnSeries)` → restituisce `{ points: [{ date, value }], cumulativeReturn }`
  - `calculateCAGR(returnSeries)` → restituisce `{ cagr, years, periodLessThanOneYear }`
- **Formula CAGR:** `years = elapsedDays / 365.2425`, `CAGR = (1 + cumulativeTWR) ^ (1/years) - 1`
- **Edge cases gestiti:** empty array, single point, same-day snapshots, cumulativeReturn ≤ -1
- **Test creati:** 18 nuovi test (6 per cumulativePerformance, 9 per CAGR, 2 integration, 1 regression update)
- **DB cleanup:** aggiunto `cleanupAllTestSessions()` con LIKE pattern per evitare dati stale tra runs
- **Test risultati:** 35/35 passati ✅
  - 6 twrFromReturns
  - 3 buildReturnSeries no-flows
  - 3 buildReturnSeries with flows
  - 1 buildReturnSeries withdrawals
  - 4 buildReturnSeries edge cases
  - 1 regression TWR
  - 6 calculateCumulativePerformance
  - 9 calculateCAGR
  - 2 Integration pipeline
- **Build frontend:** ✅ PASSA (2.29s, 2614 modules)
- **DB schema:** nessuna modifica ✅

## Fase 3 — Rendimenti mensili
**Obiettivo:** Aggregare daily returns in rendimenti mensili tramite compounding (non somma aritmetica).

- [x] Fase 3 — Rendimenti mensili ✅

**Esito dettagliato:**
- **Funzione aggiunta a `models/performanceModel.js`:**
  - `calculateMonthlyReturns(returnSeries)` → aggrega daily returns in monthly via compounding: `monthlyReturn = Π(1 + dailyReturn) - 1`
  - Raggruppamento per YYYY-MM preservando ordine cronologico
  - Restituisce `[{ year, month, return }]` ordinato
- **Test creati:** 8 nuovi test in `models/__tests__/performanceModel.test.js`
  - empty input → `[]`
  - single day in month
  - **+10% then -10% = -1%** (test critico dal design doc, compounding corretto ≠ 0%)
  - three returns (+5%, -3%, +2%) → `(1.05 × 0.97 × 1.02) - 1 = 0.03887`
  - all-negative returns (-2%, -1%, -3%) → `-0.058906`
  - multiple months in order
  - zero-return months inclusi (non filtrati)
  - integrazione con `buildReturnSeries()` su dati reali
- **Test risultati:** 43/43 passati ✅
  - 6 twrFromReturns
  - 3 buildReturnSeries no-flows
  - 3 buildReturnSeries with flows
  - 1 buildReturnSeries withdrawals
  - 4 buildReturnSeries edge cases
  - 1 regression TWR
  - 6 calculateCumulativePerformance
  - 9 calculateCAGR
  - 8 calculateMonthlyReturns (nuovi)
  - 2 Integration pipeline
- **Build frontend:** ✅ PASSA (2.25s, 2614 modules)
- **DB schema:** nessuna modifica ✅
- **DB cleanup:** test data rimosso (0 record residual) ✅

---

## Fase 4 — Rendimenti annuali + statistiche
**Obiettivo:** Calcolare rendimenti annuali, conteggio periodi positivi/negativi/flat, best/worst month e year.

- [x] Fase 4 — Rendimenti annuali + statistiche ✅

**Esito dettagliato:**
- **Funzioni aggiunte a `models/performanceModel.js`:**
  - `calculateAnnualReturns(returnSeries)` → aggrega daily returns in annual via compounding: `annualReturn = Π(1 + dailyReturn) - 1`
  - `calculateBestWorst(monthlyReturns, annualReturns)` → trova best/worst month e year (null se array vuoto)
  - `calculatePeriodStatsFromSeries(monthlyReturns, annualReturns)` → calcola positive/negative/flat counts e rates per mesi e anni
  - Funzione helper privata `calculatePeriodStats(returns)` → classifica zero come FLAT (non negativo)
- **Test creati:** 18 nuovi test in `models/__tests__/performanceModel.test.js`
  - `calculateAnnualReturns`: 6 test (empty, single year compounding, +10%/-10%=-1%, multi-year, all-negative, integration)
  - `calculateBestWorst`: 5 test (empty/nulls, best/worst month, best/worst year, single element, ties)
  - `calculatePeriodStatsFromSeries`: 5 test (empty stats, monthly counts, yearly counts, zero=FLAT, combined)
  - Integration pipeline: 2 test (full pipeline su dati reali, mixed periods)
- **Test risultati:** 61/61 passati ✅
  - 6 twrFromReturns
  - 3 buildReturnSeries no-flows
  - 3 buildReturnSeries with flows
  - 1 buildReturnSeries withdrawals
  - 4 buildReturnSeries edge cases
  - 1 regression TWR
  - 6 calculateCumulativePerformance
  - 9 calculateCAGR
  - 8 calculateMonthlyReturns
  - 2 Integration pipeline (Fase 2)
  - 6 calculateAnnualReturns (nuovi)
  - 5 calculateBestWorst (nuovi)
  - 5 calculatePeriodStatsFromSeries (nuovi)
  - 2 Integration pipeline Fase 4 (nuovi)
- **Build frontend:** ✅ PASSA (2.18s, 2614 modules)
- **DB schema:** nessuna modifica ✅
- **DB cleanup:** test data rimosso ✅

---

## Fase 5 — Volatilità
**Obiettivo:** Calcolare deviazione standard daily e volatilità annualizzata (× √365).

- [x] Fase 5 — Volatilità ✅

**Esito dettagliato:**
- **Funzione aggiunta a `models/performanceModel.js`:**
  - `calculateVolatility(returnSeries)` → calcola sample standard deviation dei rendimenti giornalieri con correzione di Bessel (n-1)
  - Annualizzazione: `annualized = dailyStdDev × √365` (costante `ANNUALIZATION_FACTOR` già esistente)
  - Edge cases: < 2 punti → `{ daily: null, annualized: null }`; tutti i rendimenti identici → `{ daily: 0, annualized: 0 }`
- **Export aggiornato:** funzione aggiunta al `default export` del modulo
- **Test creati:** 10 nuovi test in `models/__tests__/performanceModel.test.js`
  - empty array → nulls
  - single point → nulls
  - two-point series (calcolo manuale verificato)
  - zero volatilità (rendimenti identici)
  - constant positive returns → zero vol
  - constant negative returns → zero vol
  - deterministic 3-return dataset (con calcolo expected dinamico)
  - annualization factor verification (ratio = √365)
  - integration con buildReturnSeries su dati reali
  - alternating high volatility (+5%, -5%, +5%, -5%)
- **Test risultati:** 71/71 passati ✅
  - 6 twrFromReturns
  - 3 buildReturnSeries no-flows
  - 3 buildReturnSeries with flows
  - 1 buildReturnSeries withdrawals
  - 4 buildReturnSeries edge cases
  - 1 regression TWR
  - 6 calculateCumulativePerformance
  - 9 calculateCAGR
  - 8 calculateMonthlyReturns
  - 2 Integration pipeline (Fase 2)
  - 6 calculateAnnualReturns
  - 5 calculateBestWorst
  - 5 calculatePeriodStatsFromSeries
  - 2 Integration pipeline Fase 4
  - 10 calculateVolatility (nuovi)
- **Build frontend:** ✅ PASSA (2.39s, 2614 modules)
- **DB cleanup:** test data rimosso (7 cash movements, 46 snapshots, 1 session)
- **DB schema:** nessuna modifica ✅

## Fase 6 — Sharpe Ratio
**Obiettivo:** Calcolare Sharpe ratio con risk-free rate configurabile come parametro HTTP.

- [x] Fase 6 — Sharpe Ratio ✅

**Esito dettagliato:**
- **Funzione aggiunta a `models/performanceModel.js`:**
  - `calculateSharpe(returnSeries, annualRf)` → calcola Sharpe ratio annualizzato con risk-free rate configurabile
  - Formula: `dailyRf = (1 + annualRf/100)^(1/365) - 1`, `excessReturn = periodReturn - dailyRf`, `Sharpe = mean(excess)/stdDev × √365`
  - Edge cases: < 2 punti → null; stdDev = 0 → null (non Infinity); RF = 0% → valido
- **Endpoint individuali per debugging:**
  - `GET /api/analytics/volatility?from=&to=` → `{ daily, annualized, dataPoints }`
  - `GET /api/analytics/sharpe?from=&to=&riskFreeRate=0` → `{ sharpeRatio, dataPoints, riskFreeRate }`
  - Validazione RF: range `-100 < rate < 100`, non NaN, HTTP 400 se invalido
- **File creati:**
  - `controllers/performanceController.js` — controller con `getVolatility` e `getSharpe`
  - `routes/performanceRoutes.js` — rotte `/volatility` e `/sharpe`
- **File modificati:** `app.js` — registered `performanceRoutes` su `/api/analytics`
- **Test creati:** 9 nuovi test in `models/__tests__/performanceModel.test.js`
  - empty array → null
  - single point → null
  - RF = 0% → Sharpe calcolato correttamente (range 8-10 per dataset deterministico)
  - RF positivo riduce Sharpe (0% > 5% > 10%)
  - RF negativo aumenta Sharpe (-2% > 0% > 2%)
  - Volatilità = 0 → null (non Infinity)
  - RF = 0 esplicito → valido
  - Integrazione con buildReturnSeries su dati reali → finito e coerente
  - Date ranges diverse → Sharpe diversi
- **Test risultati:** 80/80 passati ✅
  - 6 twrFromReturns
  - 3 buildReturnSeries no-flows
  - 3 buildReturnSeries with flows
  - 1 buildReturnSeries withdrawals
  - 4 buildReturnSeries edge cases
  - 1 regression TWR
  - 6 calculateCumulativePerformance
  - 9 calculateCAGR
  - 8 calculateMonthlyReturns
  - 2 Integration pipeline (Fase 2)
  - 6 calculateAnnualReturns
  - 5 calculateBestWorst
  - 5 calculatePeriodStatsFromSeries
  - 2 Integration pipeline Fase 4
  - 10 calculateVolatility
  - 9 calculateSharpe (nuovi)
- **Build frontend:** ✅ PASSA (2.13s, 2614 modules)
- **DB cleanup:** test data rimosso (7 cash movements, 46 snapshots, 1 session)
- **DB schema:** nessuna modifica ✅

## Fase 7 — Drawdown + Recovery
**Obiettivo:** Calcolare maximum drawdown, peak/trough dates, recovery date, duration e recovery time.

- [ ] Fase 7 — Drawdown + Recovery

## Fase 8 — API aggregata + integration test
**Obiettivo:** Consolidare tutte le metriche in un unico endpoint `GET /api/analytics/performance` con integration test su dataset noto.

- [ ] Fase 8 — API aggregata + integration test

## Fase 9 — UI: Performance
**Obiettivo:** Pagina con KPI cumulative return, CAGR e grafico performance cumulativa con period filter.

- [ ] Fase 9 — UI: Performance

## Fase 10 — UI: Monthly & Annual Returns
**Obiettivo:** Grafico annual returns (bar chart) e heatmap mensile con Recharts/CSS grid.

- [ ] Fase 10 — UI: Monthly & Annual Returns

## Fase 11 — UI: Risk & Drawdown
**Obiettivo:** Sezione risk metrics (volatilità, Sharpe, drawdown) con input risk-free rate interattivo.

- [ ] Fase 11 — UI: Risk & Drawdown

## Fase 12 — Hardening
**Obiettivo:** Edge cases, regression test TWR, frontend build, lint, documentazione aggiornata.

- [ ] Fase 12 — Hardening