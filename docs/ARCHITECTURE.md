# 📁 Struttura del progetto Portfolio-Insights

È un'applicazione **full-stack** con architettura **MVC** (Model-View-Controller):

```
[React Frontend]  ←→  [Express Router]  ←→  [Controllers]  ←→  [Models / SQLite]
```

- **Backend**: Node.js + Express + SQLite nativo (`node:sqlite`, Node 22+)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Recharts
- **Testing**: Vitest (test unit e integration sulle formule finanziarie)

---

## 🗂️ File alla radice

| File | Scopo |
|---|---|
| **`server.js`** | Entry point del server. Avvia Express sulla porta 3000 e stampa in console il token API (se generato automaticamente). |
| **`app.js`** | Configurazione dell'app Express: inizializza il DB, registra i middleware (body parser differenziato: 50mb solo su `/api/import`, 1mb altrove; security headers; autenticazione; Cache-Control no-store), monta tutte le rotte API, handler 404 per rotte API sconosciute, serve la build statica del frontend con fallback SPA e error handler finale centralizzato. Disabilita anche l'header `x-powered-by`. |
| **`database.js`** | Inizializzazione del database SQLite (`db/portfolio.db`). Crea tutte le tabelle (`assets`, `market_orders`, `cash_movements`, `daily_portfolio_snapshots`, `asset_prices`, `import_sessions`, `asset_types`, `allocation_targets`), gli indici, popola il catalogo asset_types ed esegue le migrazioni (decommissioning ETF/ETC/ETN → UNKNOWN, FK da `assets.asset_type` verso `asset_types.name`). Esporta l'istanza `db` per gli altri moduli. |
| **`package.json`** | Dipendenze backend: `express` (+ `vitest` in devDependencies). Script: `start`, `dev` (hot-reload `node --watch`), `test` / `test:run` (Vitest), `typecheck` (frontend), `build:all`. |
| **`vitest.config.js`** | Configurazione Vitest: ambiente node, globals abilitati, `fileParallelism: false` (i test condividono lo stesso file SQLite e l'esecuzione parallela causava "database is locked"). |
| **`README.md`** | Documentazione completa: funzionalità, guida rapida, architettura, schema DB, metriche. |
| **`.clinerules`** | Regole di sviluppo per l'AI (convenzioni, pattern, cose da evitare). |
| **`.gitignore`** | File ignorati da git (node_modules, db/, public/assets, ecc.). |
| **`.node-version`** | Versione Node richiesta (22+). |

---

## ⚙️ `config/` — Configurazioni condivise

| File | Scopo |
|---|---|
| **`auth.js`** | Gestione del token API: legge `API_TOKEN` dall'ambiente, altrimenti genera un token casuale (256 bit) salvato in `db/.api-token` con permessi 0600. Fornisce `getApiToken()` e `isTokenValid()` (confronto timing-safe su hash SHA-256). |
| **`assetTypes.js`** | **Singola fonte della verità** per i tipi di asset: `BOND`, `STOCK`, `CASH`, `FUND`, `COMMODITY`, `UNKNOWN`. Allineata alla tabella DB `asset_types`: i primi 5 sono target-abili, `UNKNOWN` è tecnico (non target-abile). I tipi ETF, ETC, ETN sono stati decommissionati (migrati a UNKNOWN). Esporta `ASSET_TYPES` (tutti) e `TARGETABLE_ASSET_TYPES` (escluso UNKNOWN). |
| **`assetTypes.d.ts`** | Dichiarazione TypeScript per il modulo assetTypes (per il frontend che lo importa). |

---

## 🛡️ `middleware/` — Middleware Express

| File | Scopo |
|---|---|
| **`authMiddleware.js`** | Verifica l'header `Authorization: Bearer <token>` su tutte le rotte `/api` (tranne `/api/auth`). Restituisce 401 se mancante o non valido. |
| **`rateLimit.js`** | Rate limiter nativo in memoria (senza dipendenze). Limita le richieste per IP in una finestra temporale. Usato su `/api/auth/check` per proteggere il login da brute-force (5 tentativi/minuto). |
| **`errorHandler.js`** | Gestione errori centralizzata: `securityHeaders` (nosniff, anti-clickjacking, referrer policy, permissions policy — equivalente leggero di helmet senza dipendenze), `apiNotFound` (404 JSON per rotte `/api/*` sconosciute, evita che cadano nel fallback SPA) ed `errorHandler` finale (log completo solo lato server, risposta generica senza dettagli interni al client). |

---

## 🧰 `utils/` — Utility

| File | Scopo |
|---|---|
| **`csvParser.js`** | Parser CSV nativo per i report Directa. Gestisce 3 formati: **Movimenti** (`parseDirectaCSV`), **Patrimonio Totale** (`parseDirectaHistoryCSV`), **Portafoglio Corrente** (`parseDirectaPortfolioCSV`). Normalizza date (formato italiano → ISO), numeri (virgola → punto), e rileva il tipo di report (`detectFileType`). |
| **`currencyService.js`** | Servizio tassi di cambio basato su **ECB Data Portal API**. Recupera i tassi on-demand, li cachea in memoria per la giornata, e converte importi in EUR (`convertToEUR`, `getRatesForCurrencies`). |
| **`domainHelpers.js`** | Helper di dominio condivisi tra i modelli: `isBtpAsset()` e `correctedQuantity()` centralizzano la correzione BTP (quantità /100 perché Directa quota i BTP in percentuale). La stessa regola è applicata nel frontend (`Portfolio.tsx`). |

---

## 🗄️ `models/` — Accesso ai dati (SQLite)

| File | Scopo |
|---|---|
| **`assetModel.js`** | CRUD sugli asset: `getAllAssets`, `getAssetByIsin`, `getAssetById`, `updateAssetType`, `upsertAsset` (crea o aggiorna per ISIN, preservando il tipo assegnato manualmente). |
| **`analyticsModel.js`** | **Il cuore analitico**: calcola liquidità, capitale investito, posizioni correnti (BUY−SELL, con cache TTL 5 min), allocazione percentuale, storico snapshot, depositi cumulativi, dettaglio asset (con ordini aggregati per riferimento, dividendi, cedole) e **TWR** (Time-Weighted Rate of Return) con sottoperiodi delimitati dai depositi. |
| **`importModel.js`** | Operazioni di import: crea sessioni, inserisce ordini, movimenti di cassa (idempotente), snapshot giornalieri, prezzi asset, e `clearDatabase` (svuota tutto in transazione). |
| **`movementModel.js`** | Query sui movimenti di cassa con filtri (date, tipo, simbolo, ricerca) e ordinamento sicuro (whitelist colonne anti SQL injection). Fornisce anche la lista dei ticker distinti per il dropdown filtro. |
| **`allocationModel.js`** | Gestione target di allocazione: catalogo asset types dalla tabella DB, target configurati (lettura/salvataggio transazionale), allocazione attuale per categoria (riusa `calculatePositions` di analyticsModel con la cache condivisa; liquidità attribuita a CASH), divergenze attuale vs target, suggerimenti di ribilanciamento (BUY/SELL oltre soglia tolleranza), conteggio asset UNKNOWN con posizione attiva. |
| **`performanceModel.js`** | **Motore Performance & Risk**: costruisce la *canonical return series* (`buildReturnSeries`) dagli snapshot + cash flows (una sola lettura dal DB, base unica per tutte le metriche), poi calcola cumulative performance, CAGR, volatilità (√365), Sharpe ratio (risk-free configurabile), rendimenti mensili/annuali (compounding), statistiche periodi positivi/negativi/flat, best/worst mese/anno e drawdown (max DD, peak/trough/recovery, durate). |
| **`__tests__/performanceAPI.test.js`** | Test Vitest delle formule Performance & Risk: return series, CAGR, volatilità, Sharpe, rendimenti mensili/annuali, best/worst, drawdown (inclusi casi edge: serie vuota, drawdown non recuperato, trough assoluto). Simula la logica del controller su serie deterministiche. |

---

## 🎮 `controllers/` — Logica applicativa

| File | Scopo |
|---|---|
| **`assetController.js`** | Handler per: lista asset, singolo asset per ID/ISIN, aggiornamento tipo asset (con validazione contro `ASSET_TYPES`). |
| **`analyticsController.js`** | Handler per: KPI dashboard, posizioni portfolio, allocazione, storico, TWR, dettaglio asset, tassi di cambio. |
| **`importController.js`** | Handler per l'importazione: rileva il tipo di report, filtra record già presenti (incrementale), processa ogni record (ordini, movimenti, snapshot, prezzi), mappa le causali Directa in italiano ai MovementType del dominio. Gestisce anche storico sessioni e reset DB. |
| **`movementController.js`** | Handler per: lista movimenti con filtri/ordinamento, lista simboli per dropdown. |
| **`allocationController.js`** | Handler per: catalogo asset types, allocazione attuale (con conteggio UNKNOWN), target (GET/PUT con validazione somma=100% e categorie target-abili), ribilanciamento. |
| **`performanceController.js`** | Handler per: volatilità (`GET /volatility`), Sharpe (`GET /sharpe`, con validazione risk-free rate −100 < rate < 100) e endpoint aggregato (`GET /performance`) che calcola tutte le metriche dalla stessa serie canonica e sanifica l'output (mai NaN/Infinity: valori non finiti → null). |

---

## 🛣️ `routes/` — Endpoint Express

| File | Endpoint | Scopo |
|---|---|---|
| **`authRoutes.js`** | `GET /api/auth/check` | Verifica token (con rate limit). NON protetto — è il punto di ingresso per il login. |
| **`assetRoutes.js`** | `GET /api/assets`, `GET /api/assets/:id`, `GET /api/assets/by-isin/:isin`, `PATCH /api/assets/:id/type` | Gestione asset. |
| **`analyticsRoutes.js`** | `GET /api/analytics/dashboard`, `/portfolio`, `/allocation`, `/history`, `/twr`, `/rates`, `/asset/:id` | Dati analitici per le pagine. |
| **`performanceRoutes.js`** | `GET /api/analytics/volatility`, `GET /api/analytics/sharpe`, `GET /api/analytics/performance` | Metriche di performance e rischio (endpoint individuali per debugging + endpoint aggregato). Montato sullo stesso prefisso `/api/analytics`. |
| **`importRoutes.js`** | `POST /api/import`, `GET /api/import/sessions`, `DELETE /api/import/clear` | Importazione CSV e gestione DB. |
| **`movementRoutes.js`** | `GET /api/movements`, `GET /api/movements/symbols` | Movimenti di cassa. |
| **`allocationRoutes.js`** | `GET /api/asset-types`, `GET/PUT /api/allocation/target`, `GET /api/allocation/current`, `GET /api/allocation/rebalance` | Allocazione e ribilanciamento. Montato direttamente su `/api`. |

---

## 🎨 `client/` — Frontend React (TypeScript)

### Configurazione
| File | Scopo |
|---|---|
| **`package.json`** | Dipendenze: React 18, react-router-dom, recharts, lucide-react. Dev: Vite, TypeScript, Tailwind. Script: `dev`, `build` (tsc -b && vite build), `typecheck`, `preview`. |
| **`vite.config.ts`** | Config Vite (alias `@config` → `../config` per importare assetTypes dal backend). |
| **`tsconfig.json`** | Config TypeScript. |
| **`tailwind.config.js`** | Config Tailwind CSS. |
| **`postcss.config.js`** | Config PostCSS (per Tailwind). |
| **`index.html`** | HTML di ingresso per Vite. |

### `client/src/`
| File | Scopo |
|---|---|
| **`main.tsx`** | Punto di ingresso React: monta `<App />` con `BrowserRouter`. |
| **`App.tsx`** | Definizione delle rotte con `react-router-dom`. Include `ProtectedRoute` che reindirizza a `/login` se non autenticato. Tutte le pagine sono caricate con **lazy loading** (`React.lazy`) per ridurre il bundle iniziale (recharts è pesante e serve solo ad alcune pagine). |
| **`index.css`** | Stili globali + direttive Tailwind. |
| **`types.ts`** | Tipi TypeScript condivisi: `DashboardData`, `PositionItem`, `AllocationItem`, `SnapshotItem`, `TWRData`, `CashMovementItem`, `AssetDetailData`, ecc. |
| **`vite-env.d.ts`** | Tipi ambient Vite. |

### `client/src/components/`
| File | Scopo |
|---|---|
| **`Layout.tsx`** | Layout principale con sidebar collassabile (desktop) e menu mobile (hamburger). Contiene la navigazione (Dashboard, Portfolio, Allocazione, Performance, Movimenti, Import) e il logout. |
| **`ErrorBoundary.tsx`** | Error boundary React: cattura errori di rendering e mostra una schermata di errore invece di far crashare l'app. |

### `client/src/components/performance/`
Componenti della pagina Performance & Risk:

| File | Scopo |
|---|---|
| **`MonthlyReturnsChart.tsx`** | Grafico a barre dei rendimenti mensili (positivi sopra zero, negativi sotto). |
| **`MonthlyReturnsHeatmap.tsx`** | Heatmap anno × mese dei rendimenti mensili (grid CSS, nessuna nuova dipendenza). |
| **`PeriodStatistics.tsx`** | Statistiche periodi: mesi/anni positivi, negativi e flat con tassi. |
| **`RiskMetrics.tsx`** | Metriche di rischio (volatilità, Sharpe) + input risk-free rate configurabile dall'utente. |
| **`DrawdownAnalysis.tsx`** | Analisi testuale del drawdown: max DD, peak/trough/recovery, durate. |
| **`DrawdownChart.tsx`** | Grafico della curva di drawdown. |

### `client/src/hooks/`
| File | Scopo |
|---|---|
| **`useIsMobile.ts`** | Hook React che rileva se il viewport è mobile (usato dal layout responsive). |

### `client/src/lib/`
| File | Scopo |
|---|---|
| **`api.ts`** | Helper centralizzato per le chiamate API: gestisce token in localStorage, aggiunge header `Authorization: Bearer`, reindirizza a `/login` su 401, e `checkToken` per validare il token all'avvio. |
| **`format.ts`** | Helper di formattazione condivisi tra le pagine: prezzi (2-4 decimali significativi), importi, percentuali (con/senza segno), date IT, classi colore gain/loss, stili colore per asset type (condivisi da Portfolio e Allocation). |
| **`timeRange.ts`** | Filtro temporale condiviso tra Dashboard e Performance: tipo `TimeRange` ('1m'...'all'), opzioni UI e `getCutoffDate()` per calcolare la data di cutoff. |
| **`performanceApi.ts`** | Tipi TypeScript e funzione `fetchPerformanceAnalytics(timeRange, riskFreeRate)` per l'endpoint `/api/analytics/performance`. Converte il risk-free rate da decimale (stato React) a percentuale (parametro API). |
| **`performanceFormat.ts`** | Helper di formattazione specifici per la pagina Performance (percentuali firmate, date, ecc.). |

### `client/src/pages/` — Le 9 pagine dell'app
| File | Scopo |
|---|---|
| **`Login.tsx`** | Pagina di login: inserimento token, verifica via `/api/auth/check`, salvataggio in localStorage. |
| **`Dashboard.tsx`** | **La pagina principale**: KPI (Valore Portafoglio, P&L, TWR, Capitale Investito, Liquidità), grafico storico combinato (Portfolio + Investito + TWR) con filtri temporali (1M/3M/6M/1Y/YTD/All), grafico a torta dell'allocazione con legenda interattiva. |
| **`Portfolio.tsx`** | Tabella posizioni con ordinamento su ogni colonna, link alla scheda di dettaglio, dropdown per classificare manualmente il tipo asset, calcolo Gain/Loss per posizione, tabella riepilogativa per Asset Class con totali. |
| **`Allocation.tsx`** | Editor target di allocazione (percentuali per categoria + soglia tolleranza), grafico a torta in tempo reale, tabella attuale vs target con deviazioni, suggerimenti di ribilanciamento (COMPRA/VENDI). |
| **`Performance.tsx`** | Pagina Performance & Risk: KPI (rendimento cumulativo, CAGR, best/worst mese/anno), grafico rendimenti mensili, heatmap mensile, statistiche periodi, metriche di rischio con risk-free rate configurabile (default 2,20%), analisi e grafico drawdown. Le metriche sono calcolate sull'intero periodo di investimento (nessun filtro temporale). |
| **`AssetDetail.tsx`** | Scheda dettaglio di un singolo asset: KPI (prezzo, quantità, valore, P&L), dettaglio posizione (carico vs attuale), cronologia ordini, cedole (per BOND) o dividendi. |
| **`Movements.tsx`** | Elenco movimenti di cassa con filtri avanzati (intervallo date, tipo, simbolo, ricerca), ordinamento, legenda tipologie, totale importi filtrati. |
| **`ImportPage.tsx`** | Importazione CSV: istruzioni per i 3 report Directa, area upload drag&drop, storico sessioni import, reset database con conferma. |
| **`Settings.tsx`** | Pagina informativa: versione, stack tecnologico, posizione DB. |

---

## 📦 `public/` — Build statica del frontend

| File | Scopo |
|---|---|
| **`index.html`** | HTML di produzione servito da Express. |
| **`assets/`** | Chunk JS/CSS compilati da Vite (code splitting per pagina grazie al lazy loading). Generati con `npm run build` nel client. |

---

## 📚 `docs/` — Documentazione

| File | Scopo |
|---|---|
| **`API.md`** | Documentazione degli endpoint API. |
| **`ARCHITECTURE.md`** | Questo documento: struttura del progetto e flussi. |
| **`DATABASE_SCHEMA.md`** | Schema dettagliato del database. |
| **`DOMAIN_MODEL.md`** | Modello di dominio (entità, relazioni, mappature causali). |
| **`DESIGN.md`** | Decisioni di design. |
| **`PERFORMANCE AND RISK.md`** | Design document della feature Performance & Risk (implementata), con piano di implementazione a fasi. |

---

## 🛠️ `scripts/` — Script di sistema

| File | Scopo |
|---|---|
| **`build.sh`** | Script di build (installa dipendenze backend+frontend, compila il client). |
| **`dev.sh`** | Script di sviluppo (avvio ambiente dev). |
| **`install-debian.sh`** | Installazione su Debian/Ubuntu (Node, dipendenze, build). |
| **`update-debian.sh`** | Aggiornamento su Debian/Ubuntu (pull, build, restart). |
| **`diagnose-performance.js`** | Script di diagnostica per il motore Performance & Risk (verifica della canonical return series sui dati reali). |

---

## 🔄 Flusso dei dati (esempio: Dashboard)

1. **React** (`Dashboard.tsx`) chiama `apiFetch('/api/analytics/dashboard')`
2. **Express** instrada a `analyticsRoutes.js` → `analyticsController.getDashboard`
3. **Controller** chiama i metodi del **model** (`analyticsModel.js`)
4. **Model** esegue query SQL su **SQLite** (`database.js`)
5. La risposta JSON torna al frontend che la visualizza con Recharts

### Flusso Performance & Risk (esempio)

1. **React** (`Performance.tsx`) chiama `fetchPerformanceAnalytics('all', riskFreeRate)`
2. **Express** instrada a `performanceRoutes.js` → `performanceController.getPerformanceAnalytics`
3. Il controller chiama **`buildReturnSeries()`** (`performanceModel.js`): una sola lettura dal DB (snapshots + cash movements)
4. Tutte le metriche (cumulative, CAGR, volatilità, Sharpe, mensili, annuali, best/worst, drawdown) derivano dalla stessa serie canonica
5. L'output viene sanificato (mai NaN/Infinity) e restituito come JSON

---

## 🗝️ Punti chiave dell'architettura

- **Pattern MVC pulito**: routes (mapping) → controllers (logica) → models (SQL) → SQLite
- **Zero dipendenze cloud**: funziona offline dopo l'import (tranne i tassi di cambio ECB)
- **Calcoli a runtime**: posizioni, allocazione, TWR, performance e rischio non sono persistiti ma generati al volo
- **Canonical Return Series**: tutte le metriche di performance/rischio derivano da un'unica serie di rendimenti giornalieri costruita con una sola lettura dal DB — garanzia di coerenza tra formule
- **Idempotenza import**: re-import sicuro senza duplicati (vincoli UNIQUE + filtro incrementale per data)
- **Sicurezza**: token API con confronto timing-safe, rate limiting sul login, whitelist colonne anti SQL injection, security headers, error handler centralizzato senza leak di dettagli interni, Cache-Control no-store
- **Config condivisa**: `config/assetTypes.js` è la singola fonte della verità per i tipi asset, importata sia dal backend che dal frontend (via alias `@config`)
- **Testing**: Vitest sulle formule finanziarie (return series, CAGR, volatilità, Sharpe, drawdown) con esecuzione non parallela (SQLite condiviso)
- **Lazy loading frontend**: ogni pagina React è un chunk separato caricato on-demand