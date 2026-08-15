# 📁 Struttura del progetto Portfolio-Insights

È un'applicazione **full-stack** con architettura **MVC** (Model-View-Controller):

```
[React Frontend]  ←→  [Express Router]  ←→  [Controllers]  ←→  [Models / SQLite]
```

- **Backend**: Node.js + Express + SQLite nativo (`node:sqlite`, Node 22+)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Recharts

---

## 🗂️ File alla radice

| File | Scopo |
|---|---|
| **`server.js`** | Entry point del server. Avvia Express sulla porta 3000 e stampa in console il token API (se generato automaticamente). |
| **`app.js`** | Configurazione dell'app Express: inizializza il DB, registra i middleware (JSON body limit 50mb, autenticazione, Cache-Control no-store), monta tutte le rotte API e serve la build statica del frontend con fallback SPA. |
| **`database.js`** | Inizializzazione del database SQLite (`db/portfolio.db`). Crea tutte le tabelle (`assets`, `market_orders`, `cash_movements`, `daily_portfolio_snapshots`, `asset_prices`, `import_sessions`, `asset_types`, `allocation_targets`), gli indici, e gestisce le migrazioni (es. FK verso `asset_types`). Esporta l'istanza `db` per gli altri moduli. |
| **`package.json`** | Dipendenze backend (solo `express`). Script: `start` e `dev` (con hot-reload `node --watch`). |
| **`README.md`** | Documentazione completa: funzionalità, guida rapida, architettura, schema DB, metriche. |
| **`.clinerules`** | Regole di sviluppo per l'AI (convenzioni, pattern, cose da evitare). |
| **`.gitignore`** | File ignorati da git (node_modules, db/, public/assets, ecc.). |
| **`.node-version`** | Versione Node richiesta (22+). |

---

## ⚙️ `config/` — Configurazioni condivise

| File | Scopo |
|---|---|
| **`auth.js`** | Gestione del token API: legge `API_TOKEN` dall'ambiente, altrimenti genera un token casuale (256 bit) salvato in `db/.api-token` con permessi 0600. Fornisce `getApiToken()` e `isTokenValid()` (confronto timing-safe su hash SHA-256). |
| **`assetTypes.js`** | **Singola fonte della verità** per i tipi di asset: `BOND`, `STOCK`, `CASH`, `FUND`, `COMMODITY`, `UNKNOWN`. Esporta `ASSET_TYPES` (tutti) e `TARGETABLE_ASSET_TYPES` (escluso UNKNOWN). |
| **`assetTypes.d.ts`** | Dichiarazione TypeScript per il modulo assetTypes (per il frontend che lo importa). |

---

## 🛡️ `middleware/` — Middleware Express

| File | Scopo |
|---|---|
| **`authMiddleware.js`** | Verifica l'header `Authorization: Bearer <token>` su tutte le rotte `/api` (tranne `/api/auth`). Restituisce 401 se mancante o non valido. |
| **`rateLimit.js`** | Rate limiter nativo in memoria (senza dipendenze). Limita le richieste per IP in una finestra temporale. Usato su `/api/auth/check` per proteggere il login da brute-force (5 tentativi/minuto). |

---

## 🧰 `utils/` — Utility

| File | Scopo |
|---|---|
| **`csvParser.js`** | Parser CSV nativo per i report Directa. Gestisce 3 formati: **Movimenti** (`parseDirectaCSV`), **Patrimonio Totale** (`parseDirectaHistoryCSV`), **Portafoglio Corrente** (`parseDirectaPortfolioCSV`). Normalizza date (formato italiano → ISO), numeri (virgola → punto), e rileva il tipo di report (`detectFileType`). |
| **`currencyService.js`** | Servizio tassi di cambio basato su **ECB Data Portal API**. Recupera i tassi on-demand, li cachea in memoria per la giornata, e converte importi in EUR (`convertToEUR`, `getRatesForCurrencies`). |

---

## 🗄️ `models/` — Accesso ai dati (SQLite)

| File | Scopo |
|---|---|
| **`assetModel.js`** | CRUD sugli asset: `getAllAssets`, `getAssetByIsin`, `getAssetById`, `updateAssetType`, `upsertAsset` (crea o aggiorna per ISIN, preservando il tipo assegnato manualmente). |
| **`analyticsModel.js`** | **Il cuore analitico**: calcola liquidità, capitale investito, posizioni correnti (BUY−SELL), allocazione percentuale, storico snapshot, depositi cumulativi, dettaglio asset (con ordini aggregati per riferimento, dividendi, cedole) e **TWR** (Time-Weighted Rate of Return) con sottoperiodi delimitati dai depositi. |
| **`importModel.js`** | Operazioni di import: crea sessioni, inserisce ordini, movimenti di cassa (idempotente), snapshot giornalieri, prezzi asset, e `clearDatabase` (svuota tutto in transazione). |
| **`movementModel.js`** | Query sui movimenti di cassa con filtri (date, tipo, simbolo, ricerca) e ordinamento sicuro (whitelist colonne anti SQL injection). Fornisce anche la lista dei ticker distinti per il dropdown filtro. |
| **`allocationModel.js`** | Gestione target di allocazione: catalogo asset types, target configurati, allocazione attuale per categoria (con liquidità in CASH), divergenze attuale vs target, suggerimenti di ribilanciamento (BUY/SELL oltre soglia tolleranza), conteggio asset UNKNOWN. |

---

## 🎮 `controllers/` — Logica applicativa

| File | Scopo |
|---|---|
| **`assetController.js`** | Handler per: lista asset, singolo asset per ID/ISIN, aggiornamento tipo asset (con validazione contro `ASSET_TYPES`). |
| **`analyticsController.js`** | Handler per: KPI dashboard, posizioni portfolio, allocazione, storico, TWR, dettaglio asset, tassi di cambio. |
| **`importController.js`** | Handler per l'importazione: rileva il tipo di report, filtra record già presenti (incrementale), processa ogni record (ordini, movimenti, snapshot, prezzi), mappa le causali Directa in italiano ai MovementType del dominio. Gestisce anche storico sessioni e reset DB. |
| **`movementController.js`** | Handler per: lista movimenti con filtri/ordinamento, lista simboli per dropdown. |
| **`allocationController.js`** | Handler per: catalogo asset types, allocazione attuale, target (GET/PUT con validazione somma=100%), ribilanciamento. |

---

## 🛣️ `routes/` — Endpoint Express

| File | Endpoint | Scopo |
|---|---|---|
| **`authRoutes.js`** | `GET /api/auth/check` | Verifica token (con rate limit). NON protetto — è il punto di ingresso per il login. |
| **`assetRoutes.js`** | `GET /api/assets`, `GET /api/assets/:id`, `GET /api/assets/by-isin/:isin`, `PATCH /api/assets/:id/type` | Gestione asset. |
| **`analyticsRoutes.js`** | `GET /api/analytics/dashboard`, `/portfolio`, `/allocation`, `/history`, `/twr`, `/rates`, `/asset/:id` | Dati analitici per le pagine. |
| **`importRoutes.js`** | `POST /api/import`, `GET /api/import/sessions`, `DELETE /api/import/clear` | Importazione CSV e gestione DB. |
| **`movementRoutes.js`** | `GET /api/movements`, `GET /api/movements/symbols` | Movimenti di cassa. |
| **`allocationRoutes.js`** | `GET /api/asset-types`, `GET/PUT /api/allocation/target`, `GET /api/allocation/current`, `GET /api/allocation/rebalance` | Allocazione e ribilanciamento. |

---

## 🎨 `client/` — Frontend React (TypeScript)

### Configurazione
| File | Scopo |
|---|---|
| **`package.json`** | Dipendenze: React 18, react-router-dom, recharts, lucide-react. Dev: Vite, TypeScript, Tailwind. |
| **`vite.config.ts`** | Config Vite (alias `@config` → `../config` per importare assetTypes dal backend). |
| **`tsconfig.json`** | Config TypeScript. |
| **`tailwind.config.js`** | Config Tailwind CSS. |
| **`postcss.config.js`** | Config PostCSS (per Tailwind). |
| **`index.html`** | HTML di ingresso per Vite. |

### `client/src/`
| File | Scopo |
|---|---|
| **`main.tsx`** | Punto di ingresso React: monta `<App />` con `BrowserRouter`. |
| **`App.tsx`** | Definizione delle rotte con `react-router-dom`. Include `ProtectedRoute` che reindirizza a `/login` se non autenticato. |
| **`index.css`** | Stili globali + direttive Tailwind. |
| **`types.ts`** | **Tutti i tipi TypeScript** condivisi: `DashboardData`, `PositionItem`, `AllocationItem`, `SnapshotItem`, `TWRData`, `CashMovementItem`, `AssetDetailData`, `AllocationTargetResponse`, `RebalanceResponse`, ecc. |
| **`vite-env.d.ts`** | Tipi ambient Vite. |

### `client/src/components/`
| File | Scopo |
|---|---|
| **`Layout.tsx`** | Layout principale con sidebar collassabile (desktop) e menu mobile (hamburger). Contiene la navigazione (Dashboard, Portfolio, Allocazione, Movimenti, Import) e il logout. |

### `client/src/lib/`
| File | Scopo |
|---|---|
| **`api.ts`** | Helper centralizzato per le chiamate API: gestisce token in localStorage, aggiunge header `Authorization: Bearer`, reindirizza a `/login` su 401, e `checkToken` per validare il token all'avvio. |

### `client/src/pages/` — Le 8 pagine dell'app
| File | Scopo |
|---|---|
| **`Login.tsx`** | Pagina di login: inserimento token, verifica via `/api/auth/check`, salvataggio in localStorage. |
| **`Dashboard.tsx`** | **La pagina principale**: KPI (Valore Portafoglio, P&L, TWR, Capitale Investito, Liquidità), grafico storico combinato (Portfolio + Investito + TWR) con filtri temporali (1M/3M/6M/1Y/YTD/All), grafico a torta dell'allocazione con legenda interattiva. |
| **`Portfolio.tsx`** | Tabella posizioni con ordinamento su ogni colonna, dropdown per classificare manualmente il tipo asset, calcolo Gain/Loss per posizione, tabella riepilogativa per Asset Class con totali. |
| **`Allocation.tsx`** | Editor target di allocazione (percentuali per categoria + soglia tolleranza), grafico a torta in tempo reale, tabella attuale vs target con deviazioni, suggerimenti di ribilanciamento (COMPRA/VENDI). |
| **`AssetDetail.tsx`** | Scheda dettaglio di un singolo asset: KPI (prezzo, quantità, valore, P&L), dettaglio posizione (carico vs attuale), cronologia ordini, cedole (per BOND) o dividendi. |
| **`Movements.tsx`** | Elenco movimenti di cassa con filtri avanzati (intervallo date, tipo, simbolo, ricerca), ordinamento, legenda tipologie, totale importi filtrati. |
| **`ImportPage.tsx`** | Importazione CSV: istruzioni per i 3 report Directa, area upload drag&drop, storico sessioni import, reset database con conferma. |
| **`Settings.tsx`** | Pagina informativa: versione, stack tecnologico, posizione DB. |

---

## 📦 `public/` — Build statica del frontend

| File | Scopo |
|---|---|
| **`index.html`** | HTML di produzione servito da Express. |
| **`assets/`** | File JS/CSS compilati da Vite (`index-*.js`, `index-*.css`). Generati con `npm run build` nel client. |

---

## 📚 `docs/` — Documentazione

| File | Scopo |
|---|---|
| **`API.md`** | Documentazione degli endpoint API. |
| **`DATABASE_SCHEMA.md`** | Schema dettagliato del database. |
| **`DOMAIN_MODEL.md`** | Modello di dominio (entità, relazioni, mappature causali). |
| **`DESIGN.md`** | Decisioni di design. |
| **`SECURITY.md`** | Considerazioni di sicurezza. |
| **`SETUP.md`** | Istruzioni di setup. |
| **`TASKS.md`** | Elenco task. |
| **`BACKLOG: *.md`** | Backlog per funzionalità future (analisi portfolio, pianificazione allocazione, runtime validation). |

---

## 🛠️ `scripts/` — Script di sistema

| File | Scopo |
|---|---|
| **`build.sh`** | Script di build (installa dipendenze backend+frontend, compila il client). |
| **`install-debian.sh`** | Installazione su Debian/Ubuntu (Node, dipendenze, build). |
| **`update-debian.sh`** | Aggiornamento su Debian/Ubuntu (pull, build, restart). |

---

## 🔄 Flusso dei dati (esempio: Dashboard)

1. **React** (`Dashboard.tsx`) chiama `apiFetch('/api/analytics/dashboard')`
2. **Express** instrada a `analyticsRoutes.js` → `analyticsController.getDashboard`
3. **Controller** chiama i metodi del **model** (`analyticsModel.js`)
4. **Model** esegue query SQL su **SQLite** (`database.js`)
5. La risposta JSON torna al frontend che la visualizza con Recharts

---

## 🗝️ Punti chiave dell'architettura

- **Pattern MVC pulito**: routes (mapping) → controllers (logica) → models (SQL) → SQLite
- **Zero dipendenze cloud**: funziona offline dopo l'import (tranne i tassi di cambio ECB)
- **Calcoli a runtime**: posizioni, allocazione, TWR non sono persistiti ma generati al volo
- **Idempotenza import**: re-import sicuro senza duplicati (vincoli UNIQUE + filtro incrementale per data)
- **Sicurezza**: token API con confronto timing-safe, rate limiting sul login, whitelist colonne anti SQL injection, Cache-Control no-store
- **Config condivisa**: `config/assetTypes.js` è la singola fonte della verità per i tipi asset, importata sia dal backend che dal frontend (via alias `@config`)