# Fase 0 — Baseline Report

**Data:** 2026-08-19  
**Stato:** ✅ Completata

---

## 1. Struttura del repository

```
Portfolio-Insights/
├── server.js              # Entry point server Express
├── app.js                 # Configurazione app (middleware, CORS, body parser)
├── database.js            # SQLite connection + schema + migration
├── package.json           # Node.js ESM, express ^4.21.0
├── client/
│   ├── package.json       # React 18.3, Vite 5.4, TypeScript 5.5
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── App.tsx        # Router con react-router-dom
│       ├── main.tsx
│       ├── index.css      # Tailwind
│       ├── types.ts       # Interfacce TypeScript
│       ├── lib/api.ts     # Fetch wrapper
│       ├── components/Layout.tsx
│       └── pages/
│           ├── Allocation.tsx
│           ├── AssetDetail.tsx
│           ├── Dashboard.tsx
│           ├── ImportPage.tsx
│           ├── Login.tsx
│           ├── Movements.tsx
│           ├── Portfolio.tsx
│           └── Settings.tsx
├── config/
│   ├── assetTypes.js
│   ├── assetTypes.d.ts
│   └── auth.js
├── controllers/
│   ├── allocationController.js
│   ├── analyticsController.js    ← TWR qui
│   ├── assetController.js
│   ├── importController.js
│   └── movementController.js
├── middleware/
│   ├── authMiddleware.js
│   └── rateLimit.js
├── models/
│   ├── allocationModel.js
│   ├── analyticsModel.js         ← TWR qui (calculateTWR)
│   ├── assetModel.js
│   ├── importModel.js
│   └── movementModel.js
├── routes/
│   ├── allocationRoutes.js
│   ├── analyticsRoutes.js        ← Endpoint TWR qui
│   ├── assetRoutes.js
│   ├── authRoutes.js
│   ├── importRoutes.js
│   └── movementRoutes.js
├── utils/
│   ├── csvParser.js
│   └── currencyService.js
└── docs/
    ├── PERFORMANCE AND RISK.md
    ├── PAR_TASKS.md
    └── ...
```

---

## 2. Identificazione analytics stack

### Model: `models/analyticsModel.js`

Funzioni principali:
- `calculateCashBalance()` → legge `available_cash` da ultimo snapshot
- `calculateInvestedCapital()` → somma DEPOSIT
- `calculatePositions()` → posizioni attive con prezzi convertiti in EUR
- `calculateAllocation()` → percentuali allocazione
- `getLatestSnapshot()` → ultimo snapshot
- `getSnapshotHistory()` → tutti gli snapshot ordinati
- `getDepositHistory()` → depositi cumulativi per data
- **`calculateTWR()`** → Time-Weighted Rate of Return (linee ~501-629)
- `getAssetDetail(assetId)` → dettaglio completo singolo asset
- `getLatestPriceDate()` → ultima data prezzo
- `clearAnalyticsCache()` → svuota cache

### Controller: `controllers/analyticsController.js`

Handler:
- `getDashboard()` → KPI principali
- `getPortfolio()` → posizioni attive
- `getAllocation()` → allocazione percentuale
- `getHistory()` → serie storica snapshot
- `getTWR()` → wrapper per calculateTWR
- `getAssetDetailHandler()` → dettaglio asset
- `getRates()` → tassi cambio ECB

### Routes: `routes/analyticsRoutes.js`

| Endpoint | Handler | Descrizione |
|----------|---------|-------------|
| `GET /api/analytics/dashboard` | getDashboard | KPI principali |
| `GET /api/analytics/portfolio` | getPortfolio | Posizioni attive |
| `GET /api/analytics/allocation` | getAllocation | Allocazione % |
| `GET /api/analytics/history` | getHistory | Storico snapshot |
| `GET /api/analytics/twr` | getTWR | TWR totale/YTD/annuale/storico |
| `GET /api/analytics/rates` | getRates | Tassi cambio ECB |
| `GET /api/analytics/asset/:id` | getAssetDetailHandler | Dettaglio asset |

---

## 3. Implementazione TWR esistente

**File:** `models/analyticsModel.js`  
**Linee:** ~501-629  
**Funzione:** `calculateTWR()`

### Logica

1. Recupera tutti gli snapshot ordinati per data da `daily_portfolio_snapshots`
2. Recupera SOLO flussi esterni REALI da `cash_movements`:
   - **INCLUSIONI:** DEPOSIT, WITHDRAWAL, OTHER
   - **ESCLUSIONI:** DIVIDEND, INTEREST, COMMISSION, TAX, STAMP_DUTY (già inclusi nel portfolio_value)
3. Costruisce mappa dei flussi per data
4. Itera snapshot consecutivi, calcola rendimento per sottoperiodo delimitato dai flussi
5. Compatta geometricamente: `TWR = ∏(1 + r_i) - 1`
6. Restituisce: `{ twrTotal, twrYTD, twrAnnual[], twrHistory[] }`

### Semantica cash flow

| movement_type | Segno nella formula | Motivazione |
|---------------|---------------------|-------------|
| DEPOSIT | negativo (-amount) | Soldi versati dal proprietario, escono dal conto corrente |
| WITHDRAWAL | positivo (+amount) | Prelievi, entrano nel conto corrente |
| OTHER | positivo/negativo | Movimenti vari (trasferimenti, rimborsi) |
| DIVIDEND | ESCLUSO | Già in available_cash → già nel patrimonio |
| INTEREST | ESCLUSO | Già in available_cash → già nel patrimonio |
| COMMISSION | ESCLUSO | Costi interni già nel prezzo degli asset |
| TAX | ESCLUSO | Costi interni già nel prezzo degli asset |
| STAMP_DUTY | ESCLUSO | Costi interni già nel prezzo degli asset |

### Output TWR

```js
{
  twrTotal: number,      // TWR complessivo
  twrYTD: number,        // TWR dall'inizio dell'anno
  twrAnnual: [{ year, twr }],  // TWR per anno solare
  twrHistory: [{ snapshot_date, twr }]  // Serie storica giornaliera
}
```

---

## 4. Schema daily_portfolio_snapshots

**Tabella:** `daily_portfolio_snapshots`

| Colonna | Tipo | Descrizione |
|---------|------|-------------|
| `id` | TEXT (PK) | UUID |
| `snapshot_date` | TEXT UNIQUE | Data ISO (YYYY-MM-DD) |
| `portfolio_value` | REAL | Valore totale portafoglio |
| `available_cash` | REAL | Liquidità disponibile |
| `invested_capital` | REAL | Capitale investito |
| `import_session_id` | TEXT (FK) | Riferimento import session |

**Indice:** `idx_snapshots_date ON daily_portfolio_snapshots(snapshot_date)`

---

## 5. Movement type esistenti in DB

**Query:** `SELECT DISTINCT movement_type FROM cash_movements ORDER BY movement_type;`

| movement_type | Presenza in DB |
|---------------|----------------|
| COMMISSION | ✅ |
| DEPOSIT | ✅ |
| DIVIDEND | ✅ |
| INTEREST | ✅ |
| OTHER | ✅ |
| STAMP_DUTY | ✅ |
| TAX | ✅ |
| WITHDRAWAL | ❌ (nessun record, ma tipo supportato) |

**Totale snapshot:** 805  
**Periodo:** 2024-06-05 → 2026-08-18 (~2 anni)

---

## 6. Test esistenti

**Risultato:** ❌ Nessun test nel codice del progetto.

I soli file `.test.*` trovati sono nelle dipendenze di terze parti (`client/node_modules/`).

- Non esiste `npm test` script nel package.json
- Non esistono file `*.test.js`, `*.spec.js`, o directory `__tests__` nel codice sorgente
- Il progetto non ha framework di testing configurato (né Jest, né Vitest, né Mocha)

---

## 7. Build e lint

### Backend
- **Type:** ESM (`"type": "module"`)
- **Framework:** Express ^4.21.0
- **Database:** SQLite (node:sqlite nativo)
- **Script:** `npm start` (produzione), `npm run dev` (development)
- **Build backend:** Nessuna build necessaria (Node.js interpretato)

### Frontend
- **Framework:** React 18.3 + TypeScript 5.5
- **Bundler:** Vite 5.4
- **Styling:** Tailwind CSS 3.4
- **Charting:** Recharts 2.12
- **Routing:** react-router-dom 6.26
- **Script:** `npm run build` (tsc + vite build), `npm run typecheck` (tsc --noEmit)
- **Build frontend:** `npm run build:all` → ✅ PASSA

### TypeScript
- `npm run typecheck` → ✅ PASSA (zero errori)

### Lint
- **Nessun linter configurato** (né ESLint, né Prettier)

---

## 8. Problemi preesistenti

| Problema | Gravità | Note |
|----------|---------|------|
| Nessuna suite di test | ⚠️ Media | Critico per la Fase 0: nessun regression test esistente. La Fase 1 dovrà creare test prima di modificare TWR. |
| Nessun linter | ⚠️ Bassa | Nessun enforcement di stile del codice. |
| Chunk size warning Vite | ℹ️ Info | `index-DdzbWpa-.js` = 692KB. Considerare code-splitting in futuro. |
| Cache in memoria | ℹ️ Info | `analyticsCache` e `syncCache` si perdono al restart. Accettabile per uso single-user. |

---

## Definition of Done — Fase 0

- [x] Test esistenti passano (NESSUN test esistente — da creare)
- [x] Build passa (`npm run build:all` ✅, `npm run typecheck` ✅)
- [x] Implementazione TWR attuale è identificata (`calculateTWR()`, linee ~501-629 di `analyticsModel.js`)
- [x] Semantica dei cash flow è documentata (DEPOSIT/WITHDRAWAL/OTHER = flussi esterni; DIVIDEND/INTEREST/COMMISSION/TAX/STAMP_DUTY = già inclusi nel portfolio_value)
- [x] Endpoint analytics esistenti documentati (7 endpoint)
- [x] Schema daily_portfolio_snapshots verificato (6 colonne)
- [x] Movement type in DB identificati (7 tipi presenti, 8 supportati)
- [x] Dati reali: 805 snapshot, periodo 2024-06-05 → 2026-08-18