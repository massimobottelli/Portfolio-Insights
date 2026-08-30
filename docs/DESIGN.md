# Portfolio Insights

> Technical Design Document

---

## 👁️ 1. Vision

### Project Overview
Portfolio Insights is a self-hostable web application that analyzes a single investment portfolio exported from the Directa broker.

The application focuses on long-term investments (Bonds, Stocks, Funds and Commodities) and provides advanced insights into portfolio composition, historical evolution, investment performance and risk.

---

### Problem Statement
Although Directa provides portfolio information, long-term investors often need richer analytics and a clearer overview of their investments.

Portfolio Insights consolidates Directa exports into a normalized local database and generates meaningful analytics through an internal Analytics Engine.

---

## 🎯 2. Goals & Scope

### MVP1 Goals
The first release focuses on providing a complete overview of the current portfolio.

#### Supported Pages
- Dashboard
- Portfolio
- Movements
- Ordini
- Import Manager
- Settings

#### Features
- Import Directa reports (Movimenti, Patrimonio Totale, Portafoglio Corrente)
- Normalize imported data
- Persist normalized data
- Display portfolio overview
- Portfolio allocation with PieChart
- Portfolio KPIs (P&L, TWR, Invested Capital, Available Cash)
- Historical portfolio value chart with time range filters
- TWR (Time-Weighted Rate of Return) calculation
- Movements list with filtering, sorting and search
- Asset type classification (manual via dropdown)
- Asset Class summary table
- Safe re-import without duplicates
- Clear database functionality
- Responsive design (mobile + desktop)

---

### MVP2 (implementato)

#### Pages
- Asset Detail
- Allocation (target & rebalancing)
- Performance & Risk

#### Features
- Asset analytics (scheda di dettaglio con ordini, dividendi, cedole, IRR money-weighted)
- Target di allocazione per categoria con divergenze e suggerimenti di ribilanciamento
- Canonical return series (rendimenti giornalieri corretti per i flussi esterni)
- CAGR, volatilità annualizzata (√365), Sharpe ratio con risk-free rate configurabile
- Rendimenti mensili e annuali (compounding), statistiche periodi positivi/negativi/flat
- Maximum drawdown con peak/trough/recovery e tempi

### Post-MVP2 (implementato)

#### Pages
- **Ordini** — Elenco completo degli ordini di mercato con filtri, ordinamento e sezione **Posizioni chiuse** con Gain/Loss aggregato per ticker a quantità netta zero.

#### Features
- API dedicata `/api/orders` con GET (lista filtrata), GET /symbols (ticker distinti), DELETE (elimina singolo ordine con invalidazione cache analytics)
- **Posizioni chiuse**: raggruppamento automatico degli ordini per ticker con quantità netta zero, calcolo P&L aggregato (somma importi BUY/SELL), ordinamento per Gain/Loss EUR

---

## 🔄 3. User Workflow

### Initial Setup
The user imports Directa export files.

Supported reports:
1. **Movimenti** (Movimenti*.csv) — Orders, cash movements, commissions, taxes
2. **Patrimonio Totale** (PatrimonioTotale*.csv) — Daily portfolio snapshots
3. **Portafoglio Corrente** (P_TOTALE*.csv) — Current positions with prices

The application parses, validates and normalizes imported data before storing it in the local database. **No manual data entry** is required.

---

## 💡 4. Architecture Principles

### Simplicity First
Introduce new technologies only when they provide a measurable benefit. Avoid unnecessary infrastructure.

### Self Hostable
The application must run on any machine without depending on cloud services.

### Offline Capable
After importing Directa reports, the application must continue working without Internet access.

### AI-Friendly
The project should be optimized for AI-assisted development. Characteristics include:
- Explicit modules
- Strong typing
- Predictable folder structure
- Low coupling
- High cohesion
- Small services

---

## 📊 5. Data Source Strategy

Directa reports are the **single source of truth**. No external APIs are required for the MVP.

The application parses three distinct export files to reconstruct the portfolio:

| Report Tipo | Scopo Principale | Identificatori di Idempotenza |
|---|---|---|
| **Movimenti** (Movimenti*.csv) | Registro delle transazioni finanziarie (BUY, SELL, Cedole, Bolli, Ritenute, Commissioni). | `Riferimento ordine` e `Protocollo` |
| **Patrimonio Totale** (PatrimonioTotale*.csv) | Snapshot del saldo giornaliero (Liquidità, Portafoglio, Patrimonio). | Data Snapshot |
| **Portafoglio Corrente** (P_TOTALE*.csv) | Allineamento asset in tempo reale con prezzi correnti e prezzi medi di carico. | ISIN + Data Estrazione |

---

## ⚙️ 6. Analytics Engine

The Analytics Engine generates every derived model used by the application. **No analytical result is permanently stored** in the database.

### MVP1 KPIs
- Total Portfolio Value
- Invested Capital
- Available Cash
- Total Profit / Loss (Assoluto e %)
- Year-To-Date (YTD) Performance
- Time-Weighted Rate of Return (TWR)
- Portfolio Allocation (% per asset)
- Historical Portfolio Value (time series)
- Position-level Gain/Loss (€ and %)

### TWR Calculation
The TWR is calculated using sub-periods delimited by external cash flows (deposits):
1. All daily snapshots are retrieved in chronological order
2. All deposits are identified as external cash flows
3. Sub-periods are defined between deposit dates
4. For each sub-period: return = (V_end - V_start) / V_start
5. Geometric compounding: TWR = ∏(1 + r_i) - 1
6. YTD and annual TWR are also computed

---

## 🎨 7. User Interface

### MVP1
- **Dashboard** — KPI cards (P&L, TWR, Invested Capital, Cash), portfolio value chart with time range filters (1M, 3M, 6M, 1Y, YTD, All), allocation PieChart with legend
- **Portfolio** — Sortable table of current positions (ticker, ISIN, name, quantity, price, avg price, value, gain/loss), Asset Type dropdown for manual classification, Asset Class summary table with totals
- **Movements** — Filterable/sortable table of cash movements with date range, type, symbol filters, text search, type legend, and total amount row
- **Import Manager** — Upload CSV files (drag & drop or click), import session history, clear database with confirmation
- **Ordini** — Filterable/sortable table of market orders (BUY/SELL) with date range, type, symbol filters, text search, implicit unit price, and **Posizioni chiuse** section showing aggregated Gain/Loss for tickers with zero net quantity
- **Settings** — App information display

### MVP2
- **Asset Detail** — Analisi singolo strumento (KPI posizione, cronologia ordini, dividendi/cedole, IRR money-weighted)
- **Allocation** — Editor target per categoria + soglia tolleranza, pie chart in tempo reale, divergenze attuale vs target, suggerimenti COMPRA/VENDI
- **Performance** — KPI performance (cumulativo, CAGR, best/worst), rendimenti mensili (bar chart + heatmap), statistiche periodi, metriche di rischio (volatilità √365, Sharpe con risk-free configurabile), analisi e grafico drawdown, tabella IRR per tipo asset con carico/attuale/gain per singolo asset

---

## ️ 8. Technical Stack

La filosofia di questo stack unisce il **minimalismo tecnologico** sul database e sulle logiche di parsing con la **produttività e stabilità** di Express per la gestione del server web.

| Livello | Tecnologia | Scelta & Ruolo nel Progetto |
|---|---|---|
| **Frontend** | **React + TypeScript + Vite** | Interfaccia veloce e tipizzata, compilata in file statici pronti per essere serviti dal backend. |
| **Interfaccia Web** | **Tailwind CSS + shadcn/ui** | Stile grafico moderno e pulito con componenti altamente personalizzabili e AI-friendly. |
| **Grafici** | **Recharts** | Visualizzazione interattiva dell'allocazione del portafoglio e dell'evoluzione storica. |
| **Backend** | **Node.js + Express.js** | Express gestisce in modo robusto il routing delle API, il parsing automatico dei body JSON/Multipart e serve i file statici di React tramite middleware integrati. |
| **Database** | **SQLite (Nativo)** | Gestione dei dati tramite il modulo nativo `node:sqlite` (Node 22+). Nessun ORM (No Prisma); le query SQL sono scritte in codice nativo. |
| **Validazione** | **JavaScript Nativo** | Validazione dei tipi e parsing dei file CSV di Directa eseguiti tramite funzioni pure e moduli nativi di pulizia stringhe. |
| **Testing** | **Vitest** | Test unit e integration sulle formule finanziarie (return series, CAGR, volatilità, Sharpe, drawdown). Esecuzione non parallela (`fileParallelism: false`) perché i test condividono lo stesso file SQLite. |

---

## 🧱 9. Express MVC Architecture Pattern

L'adozione di Express si sposa perfettamente con il pattern **Model-View-Controller (MVC)**, semplificando la separazione dei ruoli grazie ai router Express e ai middleware di parsing:

```text
[Client / React View]  <--->  [Express Router]  <--->  [Controllers]  <--->  [Models / SQLite]
```

### Componenti del Pattern

*   **Model:** Gestisce l'accesso diretto ai dati e la persistenza. Sfrutta il modulo nativo `node:sqlite` per eseguire query SQL dirette e restituire oggetti JavaScript tipizzati. Non contiene logica di presentazione o di routing.
*   **View:** Rappresentata dall'applicazione frontend in React. Consuma le API JSON esposte dal backend Express e si occupa esclusivamente della presentazione visiva.
*   **Controller:** Contiene la logica applicativa e di business. Riceve i dati dalle richieste HTTP (già parsati in `req.body` o `req.params`), interroga o aggiorna i Model, elabora i risultati e restituisce la risposta JSON tramite `res.json()`.
*   **Route:** Mappa gli endpoint URL (es. `/api/assets`) e i metodi HTTP (GET, POST, PATCH, DELETE) verso lo specifico metodo del Controller utilizzando `express.Router()`.

---

## 📂 10. Project Structure

Il progetto segue un'architettura monorepo chiara basata sull'utilizzo di Express e del pattern MVC:

```text
portfolio-insights/
├── config/
│   ├── assetTypes.js           # Centralized asset type definitions (shared BE/FE)
│   └── auth.js                 # API token management (env var o generazione automatica)
├── middleware/
│   ├── authMiddleware.js       # Verifica Bearer token su /api/*
│   ├── rateLimit.js            # Rate limiter nativo (login anti brute-force)
│   └── errorHandler.js         # Security headers, 404 API, error handler centralizzato
├── models/
│   ├── assetModel.js           # Query SQLite per la gestione degli asset
│   ├── analyticsModel.js       # Query SQLite per i dati storici e i calcoli delle metriche
│   ├── importModel.js          # Query SQLite per l'inserimento delle transazioni e log di import
│   ├── movementModel.js        # Query SQLite per i movimenti di cassa con filtri
│   ├── orderModel.js           # Query SQLite per gli ordini di mercato con filtri, eliminazione e simboli
│   ├── allocationModel.js      # Target di allocazione, allocazione attuale, ribilanciamento
│   ├── performanceModel.js     # Canonical return series + metriche performance/risk
│   └── __tests__/              # Test Vitest (performanceAPI.test.js, irr.test.js)
├── controllers/
│   ├── assetController.js      # Logica per recuperare e formattare i dati degli asset
│   ├── analyticsController.js  # Calcoli KPI, allocazione e orchestrazione della Dashboard
│   ├── importController.js     # Gestione dell'upload, validazione e salvataggio dei CSV
│   ├── movementController.js   # Logica per recuperare e filtrare i movimenti di cassa
│   ├── orderController.js      # Logica per recuperare, filtrare ed eliminare gli ordini di mercato
│   ├── allocationController.js # Endpoint allocazione e ribilanciamento
│   └── performanceController.js# Endpoint volatility, sharpe, performance aggregato
├── routes/
│   ├── assetRoutes.js          # Definizione endpoint Express per gli strumenti (Asset)
│   ├── analyticsRoutes.js      # Definizione endpoint Express per la Dashboard e KPI
│   ├── performanceRoutes.js    # Endpoint volatility/sharpe/performance (/api/analytics)
│   ├── importRoutes.js         # Definizione endpoint Express per l'importazione dei file Directa
│   ├── movementRoutes.js       # Definizione endpoint Express per i movimenti di cassa
│   ├── orderRoutes.js          # Definizione endpoint Express per gli ordini di mercato (/api/orders)
│   ├── allocationRoutes.js     # Endpoint asset-types e allocation/* (montato su /api)
│   └── authRoutes.js           # GET /api/auth/check (non protetto, rate-limited)
├── utils/
│   ├── csvParser.js            # Parser CSV nativo per i tre formati Directa
│   ├── currencyService.js      # Tassi di cambio ECB con cache giornaliera
│   └── domainHelpers.js        # Helper dominio condivisi (correzione BTP)
├── vitest.config.js            # Config Vitest (node env, no parallelismo file)
├── database.js                 # Inizializzazione della connessione a SQLite nativo
├── app.js                      # Configurazione di Express (middleware, routes, static files)
├── server.js                   # Entry point del server HTTP (avvio di app.listen)
├── scripts/                    # build.sh, dev.sh, install/update-debian.sh, diagnose-performance.js
├── client/                     # Frontend React (sorgente TypeScript)
│   ├── src/
│   │   ├── App.tsx             # Router principale (lazy loading pagine)
│   │   ├── types.ts            # TypeScript type definitions
│   │   ├── components/
│   │   │   ├── Layout.tsx      # Sidebar + main layout (collapsible, responsive)
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── performance/    # Chart mensili, heatmap, risk metrics, drawdown
│   │   ├── hooks/
│   │   │   └── useIsMobile.ts  # Rilevamento viewport mobile
│   │   ├── lib/                # api.ts, format.ts, timeRange.ts, performanceApi.ts, ...
│   │   └── pages/
│   │       ├── Login.tsx       # Login con token API
│   │       ├── Dashboard.tsx   # KPI, chart, allocation
│   │       ├── Portfolio.tsx   # Positions table + Asset Class summary
│   │       ├── Allocation.tsx  # Editor target + ribilanciamento
│   │       ├── Performance.tsx # Performance & Risk (CAGR, volatilità, Sharpe, drawdown, IRR per tipo)
│   │       ├── AssetDetail.tsx # Scheda dettaglio singolo strumento (con IRR money-weighted)
│   │       ├── Movements.tsx   # Cash movements with filters
│   │       ├── Orders.tsx      # Market orders with filters + Posizioni chiuse Gain/Loss
│   │       ├── ImportPage.tsx  # CSV upload + clear database
│   │       ├── Settings.tsx    # App info
│   │       └── About.tsx       # Feature list and usage guide
│   └── ...
└── public/                     # Frontend React (build statica dell'interfaccia utente)
```

---

##  11. Development Rules

- **Strict MVC Separation:** Le rotte Express definiscono solo gli endpoint e chiamano i Controller. I Controller non contengono query SQL dirette, ma delegano ai Model.
- **Express Middleware Usage:** Sfruttare i middleware nativi di Express come `express.json()` per il parsing dei dati in ingresso, ed evitare configurazioni custom ridondanti.
- **Never access the database from the UI:** Il frontend comunica con il database esclusivamente tramite le API esposte dai Controller.
- **Business logic belongs to the Analytics package:** I calcoli complessi non vengono salvati nel DB ma generati a runtime dai controller preposti.
- **Importers never perform business calculations:** L'importatore si occupa solo di ripulire, validare e salvare i dati grezzi in modo idempotente.
- **Keep modules small and explicit:** Preferire funzioni pure, composizione rispetto all'ereditarietà ed evitare dipendenze circolari.
- **Shared configuration:** I tipi di asset sono definiti in `config/assetTypes.js` e allineati alla tabella DB `asset_types`; importati sia dal backend che dal frontend, garantendo un'unica fonte di verità.
- **Canonical return series:** Tutte le metriche di performance/rischio derivano da un'unica serie di rendimenti giornalieri (`buildReturnSeries()` in `performanceModel.js`), costruita con una sola lettura dal DB — garanzia di coerenza tra TWR, CAGR, volatilità, Sharpe e drawdown.
- **Test before changing financial logic:** Le formule finanziarie (return series, CAGR, volatilità, Sharpe, drawdown) sono coperte da test Vitest; eseguire `npm run test:run` prima e dopo ogni modifica alla logica finanziaria.
- **Date format normalization:** Tutte le date sono memorizzate in formato ISO (YYYY-MM-DD) per garantire confronti cronologici corretti.

---

## 🗺️ 12. Future Roadmap

- Docker deployment per un self-hosting immediato in un solo comando.
- Backup automatici del file SQLite locale.
- Supporto per l'importazione da altri broker (es. Degiro, Fineco).
- Benchmark avanzati delle performance di portafoglio rispetto ad indici globali (es. MSCI World).
- Filtri temporali sulla pagina Performance (l'API supporta già `from`/`to`, la UI li usa solo sulla Dashboard).

---

**End of Document**