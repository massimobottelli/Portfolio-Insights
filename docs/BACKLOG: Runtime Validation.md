# BACKLOG — Integrazione Runtime Validation con Zod

> **Stato:** Pianificato
> **Priorità:** Media
> **Area:** Frontend (React + TypeScript) e Backend (Node.js + Express)
> **Dipendenze:** `zod` (client), `zod` (server)

---

## 1. Contesto e Problema

### 1.1 Situazione attuale

L'applicazione è un'app single-user per la gestione del portafoglio finanziario con:

- **Backend:** Node.js + Express + SQLite (JavaScript puro, nessun TypeScript)
- **Frontend:** React + TypeScript + Tailwind (Vite)

Il frontend consuma le API tramite `client/src/lib/api.ts` e dichiara i tipi delle risposte in `client/src/types.ts`. Il backend espone endpoint REST in `controllers/` e `routes/`.

### 1.2 Problemi identificati

**P1 — TypeScript è solo a compile-time, non a runtime**

Le interfacce in `client/src/types.ts` (es. `DashboardData`, `AllocationItem`, `SnapshotItem`) garantiscono la correttezza dei tipi **solo durante la compilazione**. A runtime, il codice riceve ciò che il backend restituisce davvero:

```ts
// client/src/pages/Dashboard.tsx — attuale
apiFetch('/api/analytics/dashboard').then(r => r.json())
  .then((dashData) => setDashboard(dashData));
```

Se il backend restituisce un campo mancante, `null` al posto di un numero, o una stringa al posto di un numero, l'app crasha con errori tipo `Cannot read properties of undefined` oppure mostra `NaN`/`undefined` nell'interfaccia. Nessun errore a compile-time può prevenirlo.

**P2 — Nessuna validazione degli input nel backend**

- `controllers/movementController.js`: i query params (`sortBy`, `sortOrder`, `startDate`, `endDate`, `type`, `symbol`, `search`) vengono passati direttamente al modello senza validazione. Un valore malformato può causare query errate o errori 500.
- `controllers/importController.js`: valida solo `fileContent` e `confirm`, ma i record parsati dal CSV non vengono validati contro uno schema prima dell'inserimento nel DB.
- `controllers/assetController.js`: la validazione di `assetType` è manuale e duplicata rispetto alla logica di dominio.

**P3 — Contratto API implicito**

Il contratto tra frontend e backend è documentato solo in `docs/API.md` e nei commenti dei controller. Non esiste un unico punto di verifica che il formato delle risposte corrisponda a quanto dichiarato.

### 1.3 Obiettivi

1. **Runtime validation delle risposte API** nel frontend: ogni risposta viene validata contro uno schema Zod prima dell'uso.
2. **Single source of truth per i tipi**: derivare i tipi TypeScript dagli schemi Zod con `z.infer<>`, eliminando la duplicazione manuale in `types.ts`.
3. **Validazione degli input nel backend**: query params, body e record CSV validati con Zod prima dell'elaborazione.
4. **Errori strutturati e leggibili**: errori Zod mappati su risposte HTTP 400 con messaggi chiari.

---

## 2. Architettura Proposta

### 2.1 Struttura file

```
client/src/
├── schemas/                    # NUOVO — Schemi Zod per le risposte API
│   ├── index.ts                # Re-export di tutti gli schemi
│   ├── dashboard.ts            # DashboardDataSchema
│   ├── portfolio.ts            # PortfolioResponseSchema, PositionItemSchema
│   ├── allocation.ts           # AllocationItemSchema
│   ├── history.ts              # SnapshotItemSchema
│   ├── twr.ts                  # TWRDataSchema, TWRAnnualItemSchema, TWRHistoryItemSchema
│   ├── assetDetail.ts          # AssetDetailDataSchema, AssetDetailOrderSchema, AssetDetailDividendSchema
│   ├── movements.ts            # MovementsResponseSchema, CashMovementItemSchema
│   ├── import.ts               # ImportSessionSchema, ImportResponseSchema, ClearDatabaseResponseSchema
│   └── common.ts               # Schemi condivisi (date ISO, UUID, enum)
├── lib/
│   ├── api.ts                  # MODIFICATO — aggiunta funzione validateResponse<T>
│   └── validation.ts           # NUOVO — helper per validare risposte e gestire errori

server/                         # (o directory root, vedi §2.2)
├── schemas/                    # NUOVO — Schemi Zod per input backend
│   ├── movementsQuery.ts       # Query params GET /api/movements
│   ├── importBody.ts           # Body POST /api/import, DELETE /api/import/clear
│   ├── assetTypeBody.ts        # Body PATCH /api/assets/:id/type
│   └── csvRecords.ts           # Record parsati dal CSV (orders, portfolio, history)
└── middleware/
    └── validate.js             # NUOVO — Middleware Express per validazione con Zod
```

### 2.2 Nota su backend JavaScript vs TypeScript

Il backend è in JavaScript puro. Zod è una libreria runtime e funziona perfettamente in JS senza TypeScript. Gli schemi backend non derivano tipi (non servono), ma forniscono:

- Validazione degli input a runtime
- Errori strutturati con path del campo
- Normalizzazione dei valori (es. trim, default)

### 2.3 Dipendenze

| Dove | Pacchetto | Versione |
|------|-----------|----------|
| client | `zod` | ^3.23.8 (ultima stabile v3) |
| server | `zod` | ^3.23.8 |

Installazione:

```bash
# Client
cd client && npm install zod

# Server
npm install zod
```

---

## 3. Schemi Zod — Frontend (Risposte API)

### 3.1 Schema comune (`client/src/schemas/common.ts`)

```ts
import { z } from 'zod';

// Data ISO YYYY-MM-DD (nullable per campi opzionali)
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non in formato ISO');
export const nullableIsoDateSchema = isoDateSchema.nullable();

// UUID (asset_id, session id)
export const uuidSchema = z.string().uuid();

// Numero finito (esclude NaN, Infinity)
export const finiteNumberSchema = z.number().finite();

// Enum asset type
export const assetTypeSchema = z.enum(['ETF', 'ETC', 'ETN', 'STOCK', 'BOND', 'FUND', 'COMMODITY', 'CASH', 'UNKNOWN']);
```

### 3.2 Dashboard (`client/src/schemas/dashboard.ts`)

```ts
import { z } from 'zod';
import { finiteNumberSchema, nullableIsoDateSchema } from './common';

export const DashboardDataSchema = z.object({
  portfolioValue: finiteNumberSchema,
  investedCapital: finiteNumberSchema,
  availableCash: finiteNumberSchema,
  totalProfitLoss: finiteNumberSchema,
  totalProfitLossPercent: finiteNumberSchema,
  totalPositions: z.number().int().nonnegative(),
  snapshotDate: nullableIsoDateSchema,
});

export type DashboardData = z.infer<typeof DashboardDataSchema>;
```

### 3.3 Portfolio (`client/src/schemas/portfolio.ts`)

```ts
import { z } from 'zod';
import { uuidSchema, nullableIsoDateSchema, assetTypeSchema } from './common';

export const PositionItemSchema = z.object({
  asset_id: uuidSchema,
  isin: z.string(),
  ticker: z.string(),
  name: z.string(),
  currency: z.string(),
  asset_type: assetTypeSchema,
  quantity: z.number().finite(),
  current_price: z.number().finite().nullable(),
  average_price: z.number().finite().nullable(),
  price_date: nullableIsoDateSchema,
});

export const PortfolioResponseSchema = z.object({
  positions: z.array(PositionItemSchema),
  priceDate: nullableIsoDateSchema,
});

export type PositionItem = z.infer<typeof PositionItemSchema>;
export type PortfolioResponse = z.infer<typeof PortfolioResponseSchema>;
```

### 3.4 Allocation (`client/src/schemas/allocation.ts`)

```ts
import { z } from 'zod';
import { PositionItemSchema } from './portfolio';

export const AllocationItemSchema = PositionItemSchema.extend({
  marketValue: z.number().finite(),
  allocationPercent: z.number().finite(),
});

export type AllocationItem = z.infer<typeof AllocationItemSchema>;
```

### 3.5 History (`client/src/schemas/history.ts`)

```ts
import { z } from 'zod';
import { isoDateSchema, finiteNumberSchema } from './common';

export const SnapshotItemSchema = z.object({
  snapshot_date: isoDateSchema,
  portfolio_value: finiteNumberSchema,
  available_cash: finiteNumberSchema,
  invested_capital: finiteNumberSchema,
  cumulative_deposits: finiteNumberSchema,
});

export type SnapshotItem = z.infer<typeof SnapshotItemSchema>;
```

### 3.6 TWR (`client/src/schemas/twr.ts`)

```ts
import { z } from 'zod';
import { isoDateSchema, finiteNumberSchema } from './common';

export const TWRAnnualItemSchema = z.object({
  year: z.number().int(),
  twr: finiteNumberSchema,
});

export const TWRHistoryItemSchema = z.object({
  snapshot_date: isoDateSchema,
  twr: finiteNumberSchema,
});

export const TWRDataSchema = z.object({
  twrTotal: finiteNumberSchema,
  twrYTD: finiteNumberSchema,
  twrAnnual: z.array(TWRAnnualItemSchema),
  twrHistory: z.array(TWRHistoryItemSchema),
});

export type TWRData = z.infer<typeof TWRDataSchema>;
```

### 3.7 Asset Detail (`client/src/schemas/assetDetail.ts`)

```ts
import { z } from 'zod';
import { uuidSchema, isoDateSchema, finiteNumberSchema, assetTypeSchema } from './common';

export const AssetDetailOrderSchema = z.object({
  date: isoDateSchema,
  valueDate: isoDateSchema,
  type: z.enum(['BUY', 'SELL']),
  quantity: finiteNumberSchema,
  price: finiteNumberSchema.nullable(),
  amount: finiteNumberSchema,
  currency: z.string(),
  reference: z.string().nullable(),
});

export const AssetDetailDividendSchema = z.object({
  date: isoDateSchema,
  amount: finiteNumberSchema,
  currency: z.string(),
});

export const AssetDetailDataSchema = z.object({
  asset: z.object({
    id: uuidSchema,
    isin: z.string(),
    ticker: z.string(),
    name: z.string(),
    assetType: assetTypeSchema,
    currency: z.string(),
  }),
  position: z.object({
    quantity: finiteNumberSchema,
    currentPrice: finiteNumberSchema.nullable(),
    priceDate: isoDateSchema.nullable(),
    averagePrice: finiteNumberSchema.nullable(),
    bookValue: finiteNumberSchema.nullable(),
    currentValue: finiteNumberSchema.nullable(),
    pnl: finiteNumberSchema.nullable(),
    pnlPercent: finiteNumberSchema.nullable(),
    allocationPercent: finiteNumberSchema.nullable(),
    allocationTypePercent: finiteNumberSchema.nullable(),
  }),
  orders: z.array(AssetDetailOrderSchema),
  dividends: z.array(AssetDetailDividendSchema),
  coupons: z.array(AssetDetailDividendSchema),
});

export type AssetDetailData = z.infer<typeof AssetDetailDataSchema>;
```

### 3.8 Movements (`client/src/schemas/movements.ts`)

```ts
import { z } from 'zod';
import { uuidSchema, isoDateSchema, finiteNumberSchema } from './common';

export const CashMovementItemSchema = z.object({
  id: uuidSchema,
  operation_date: isoDateSchema,
  value_date: isoDateSchema,
  movement_type: z.string(),
  euro_amount: finiteNumberSchema,
  currency: z.string(),
  protocol: z.string().nullable(),
  order_reference: z.string().nullable(),
  asset_id: uuidSchema.nullable(),
  isin: z.string().nullable(),
  ticker: z.string().nullable(),
  asset_name: z.string().nullable(),
});

export const MovementsResponseSchema = z.object({
  data: z.array(CashMovementItemSchema),
  total: z.number().int().nonnegative(),
});

export type CashMovementItem = z.infer<typeof CashMovementItemSchema>;
export type MovementsResponse = z.infer<typeof MovementsResponseSchema>;
```

### 3.9 Import (`client/src/schemas/import.ts`)

```ts
import { z } from 'zod';
import { uuidSchema, finiteNumberSchema } from './common';

export const ImportSessionSchema = z.object({
  id: uuidSchema,
  filename: z.string(),
  import_date: z.string(), // ISO datetime
  status: z.enum(['SUCCESS', 'FAILED']),
  records_imported: z.number().int().nonnegative(),
  errors: z.string().nullable(),
});

export const ImportResponseSchema = z.object({
  success: z.boolean(),
  importSessionId: uuidSchema,
  recordsImported: z.number().int().nonnegative(),
  totalRecords: z.number().int().nonnegative(),
});

export const ClearDatabaseResponseSchema = z.object({
  success: z.boolean(),
  deleted: z.object({
    marketOrders: z.number().int().nonnegative(),
    cashMovements: z.number().int().nonnegative(),
    snapshots: z.number().int().nonnegative(),
    assetPrices: z.number().int().nonnegative(),
    assets: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
  }),
});

export type ImportSession = z.infer<typeof ImportSessionSchema>;
export type ImportResponse = z.infer<typeof ImportResponseSchema>;
```

### 3.10 Helper di validazione (`client/src/lib/validation.ts`)

```ts
import { z } from 'zod';

/**
 * Valida una risposta API contro uno schema Zod.
 * Se la validazione fallisce, lancia un errore con dettagli leggibili
 * (path del campo, tipo atteso vs ricevuto).
 */
export async function validateResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) {
    // Tenta di estrarre il messaggio di errore dal body
    let message = `Errore HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
      if (body?.details) message += `: ${body.details}`;
    } catch {
      // body non JSON: ignora
    }
    throw new Error(message);
  }

  const data = await response.json();
  const result = schema.safeParse(data);

  if (!result.success) {
    const issues = result.error.issues
      .map(i => `[${i.path.join('.')}] ${i.message}`)
      .join('; ');
    throw new Error(`Risposta API non valida: ${issues}`);
  }

  return result.data;
}
```

### 3.11 Modifica a `client/src/lib/api.ts`

Aggiungere una funzione `apiFetchValidated` che combina `apiFetch` + `validateResponse`:

```ts
import { z } from 'zod';
import { validateResponse } from './validation';

/**
 * Esegue una fetch autenticata e valida la risposta contro uno schema Zod.
 * @param path Path API
 * @param schema Schema Zod per la risposta
 * @param options Opzioni fetch
 */
export async function apiFetchValidated<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit = {}
): Promise<T> {
  const response = await apiFetch(path, options);
  return validateResponse(response, schema);
}
```

### 3.12 Aggiornamento di `client/src/types.ts`

`types.ts` viene **eliminato** o ridotto a re-export dagli schemi:

```ts
// client/src/types.ts — nuovo contenuto
export type { DashboardData } from './schemas/dashboard';
export type { PositionItem, PortfolioResponse } from './schemas/portfolio';
export type { AllocationItem } from './schemas/allocation';
export type { SnapshotItem } from './schemas/history';
export type { TWRData } from './schemas/twr';
export type { AssetDetailData } from './schemas/assetDetail';
export type { CashMovementItem, MovementsResponse } from './schemas/movements';
export type { ImportSession, ImportResponse } from './schemas/import';
```

Questo mantiene compatibili le importazioni esistenti nelle pagine (`import type { DashboardData } from '../types'`) senza modificare ogni componente.

---

## 4. Schemi Zod — Backend (Input)

### 4.1 Middleware di validazione (`middleware/validate.js`)

```js
import { z } from 'zod';

/**
 * Middleware Express per validare req.query, req.params o req.body con Zod.
 * Se la validazione fallisce, risponde con 400 e i dettagli degli errori.
 *
 * @param {z.ZodType} schema - Schema Zod
 * @param {'query'|'params'|'body'} source - Sorgente da validare
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({
        error: 'Richiesta non valida',
        details: issues,
      });
    }
    // Sostituisce la sorgente con i dati validati/normalizzati
    req[source] = result.data;
    next();
  };
}
```

### 4.2 Query params movimenti (`schemas/movementsQuery.js`)

```js
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non in formato ISO (YYYY-MM-DD)');

export const movementsQuerySchema = z.object({
  sortBy: z.enum(['operation_date', 'value_date', 'movement_type', 'euro_amount', 'currency', 'ticker', 'name']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  type: z.string().min(1).max(50).optional(),
  symbol: z.string().min(1).max(50).optional(),
  search: z.string().min(1).max(200).optional(),
});
```

**Nota:** lo schema sostituisce la whitelist manuale in `movementModel.js` (`allowedSortColumns`). Il modello può continuare a usare i valori già validati.

### 4.3 Body import (`schemas/importBody.js`)

```js
import { z } from 'zod';

export const importBodySchema = z.object({
  fileContent: z.string().min(1, 'fileContent è obbligatorio').max(10_000_000, 'File troppo grande (max 10MB)'),
  filename: z.string().min(1).max(255).optional().default('unknown.csv'),
});

export const clearDatabaseBodySchema = z.object({
  confirm: z.literal(true, { errorMap: () => ({ message: 'Per cancellare tutti i dati inviare { "confirm": true }' }) }),
});
```

### 4.4 Body asset type (`schemas/assetTypeBody.js`)

```js
import { z } from 'zod';
import { ASSET_TYPES } from '../config/assetTypes.js';

export const assetTypeBodySchema = z.object({
  assetType: z
    .string()
    .trim()
    .toUpperCase()
    .refine(t => ASSET_TYPES.includes(t), {
      message: `Tipo non valido. Valori accettati: ${ASSET_TYPES.join(', ')}`,
    }),
});
```

### 4.5 Record CSV (`schemas/csvRecords.js`)

```js
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableString = z.string().nullable();

// Record ordini dal report Movimenti
export const orderRecordSchema = z.object({
  operationDate: isoDate,
  valueDate: isoDate,
  causale: z.string().min(1),
  ticker: z.string(),
  isin: z.string(),
  protocol: nullableString,
  description: z.string(),
  quantity: z.number().finite(),
  euroAmount: z.number().finite(),
  currencyAmount: z.number().finite(),
  currency: z.string(),
  orderReference: nullableString,
});

// Record dal report Portafoglio Corrente (P_TOTALE)
export const portfolioRecordSchema = z.object({
  isin: z.string().min(1),
  ticker: z.string(),
  name: z.string(),
  currentPrice: z.number().finite(),
  quantity: z.number().finite(),
  bookValue: z.number().finite(),
  currentValue: z.number().finite(),
  averagePrice: z.number().finite(),
  currency: z.string(),
});

// Snapshot dal report Patrimonio Totale
export const historyRecordSchema = z.object({
  snapshotDate: isoDate,
  availableCash: z.number().finite(),
  finanziamentoLong: z.number().finite(),
  garanziaShort: z.number().finite(),
  portfolioValue: z.number().finite(),
  patrimonio: z.number().finite(),
  note: z.string(),
});
```

**Nota:** questi schemi vengono applicati nel `importController.js` dopo il parsing CSV, prima dell'inserimento nel DB. I record che non superano la validazione vengono scartati con un warning (stessa logica del `try/catch` per-record esistente).

---

## 5. Fasi di Implementazione

### Fase 1 — Setup (½ giornata)

- [ ] Installare `zod` nel client: `cd client && npm install zod`
- [ ] Installare `zod` nel server: `npm install zod`
- [ ] Creare `client/src/schemas/common.ts` con gli schemi condivisi
- [ ] Creare `client/src/lib/validation.ts` con `validateResponse`
- [ ] Aggiungere `apiFetchValidated` a `client/src/lib/api.ts`

### Fase 2 — Schemi frontend (1 giornata)

- [ ] Creare `client/src/schemas/dashboard.ts`
- [ ] Creare `client/src/schemas/portfolio.ts`
- [ ] Creare `client/src/schemas/allocation.ts`
- [ ] Creare `client/src/schemas/history.ts`
- [ ] Creare `client/src/schemas/twr.ts`
- [ ] Creare `client/src/schemas/assetDetail.ts`
- [ ] Creare `client/src/schemas/movements.ts`
- [ ] Creare `client/src/schemas/import.ts`
- [ ] Creare `client/src/schemas/index.ts` (re-export)
- [ ] Aggiornare `client/src/types.ts` a re-export dagli schemi

### Fase 3 — Integrazione nelle pagine (1-2 giornate)

- [ ] `Dashboard.tsx`: usare `apiFetchValidated` per le 4 chiamate (dashboard, allocation, history, twr)
- [ ] `Portfolio.tsx`: usare `apiFetchValidated` per portfolio
- [ ] `Movements.tsx`: usare `apiFetchValidated` per movimenti e simboli
- [ ] `AssetDetail.tsx`: usare `apiFetchValidated` per dettaglio asset
- [ ] `ImportPage.tsx`: usare `apiFetchValidated` per sessioni, import e clear
- [ ] Verificare che `npm run build` (tsc) passi senza errori

### Fase 4 — Validazione backend (1 giornata)

- [ ] Creare `middleware/validate.js`
- [ ] Creare `schemas/movementsQuery.js` e applicarlo in `routes/movementRoutes.js`
- [ ] Creare `schemas/importBody.js` e applicarlo in `routes/importRoutes.js`
- [ ] Creare `schemas/assetTypeBody.js` e applicarlo in `routes/assetRoutes.js`
- [ ] Creare `schemas/csvRecords.js` e applicarlo in `controllers/importController.js`
- [ ] Rimuovere la validazione manuale duplicata (es. whitelist in `movementModel.js`, check manuali in `assetController.js`)

### Fase 5 — Test e verifica (½ giornata)

- [ ] Test manuale: avviare server e client, navigare tutte le pagine
- [ ] Test: risposta API malformata simulata → verificare errore leggibile invece di crash
- [ ] Test: query params invalidi → verificare 400 con dettagli
- [ ] Test: import CSV con record malformati → verificare scarto con warning
- [ ] Verificare `npm run build` nel client senza errori TypeScript
- [ ] Aggiornare `docs/API.md` con la nota sulla validazione Zod

---

## 6. Esempio di Utilizzo Finale

### Frontend — prima

```ts
// Dashboard.tsx (attuale)
apiFetch('/api/analytics/dashboard')
  .then(r => r.json())
  .then((dashData) => setDashboard(dashData));
```

### Frontend — dopo

```ts
// Dashboard.tsx (con Zod)
import { DashboardDataSchema } from '../schemas';

apiFetchValidated('/api/analytics/dashboard', DashboardDataSchema)
  .then(setDashboard)
  .catch(err => console.error('Dashboard non valida:', err.message));
```

### Backend — prima

```js
// movementController.js (attuale)
const { sortBy, sortOrder, startDate, endDate, type, symbol, search } = req.query;
const result = getMovements({ sortBy, sortOrder, startDate, endDate, type, symbol, search });
```

### Backend — dopo

```js
// routes/movementRoutes.js (con middleware)
router.get('/', validate(movementsQuerySchema, 'query'), listMovements);
```

---

## 7. Criteri di Accettazione

1. **Nessun crash silenzioso**: se una risposta API non corrisponde allo schema, l'utente vede un messaggio di errore chiaro invece di `NaN`/`undefined`/crash.
2. **Tipi derivati**: `client/src/types.ts` non contiene più definizioni manuali duplicate; tutti i tipi derivano dagli schemi con `z.infer<>`.
3. **Input backend validati**: query params, body e record CSV passano da Zod prima dell'elaborazione.
4. **Errori 400 strutturati**: il backend risponde con `{ error, details: [{ field, message }] }` per input non validi.
5. **Build pulita**: `npm run build` nel client passa senza errori TypeScript.
6. **Nessuna regressione**: tutte le pagine esistenti funzionano come prima (Dashboard, Portfolio, Movements, AssetDetail, Import).

---

## 8. Rischi e Considerazioni

| Rischio | Mitigazione |
|---------|-------------|
| **Falsi positivi**: lo schema è più severo del backend reale (es. campo che a volte è `null`) | Testare con dati reali; usare `.nullable()` e `.optional()` dove appropriato; iniziare con `safeParse` e log invece di throw durante la transizione |
| **Performance**: validare array grandi (es. history con centinaia di snapshot) | Zod è veloce; per array molto grandi valutare `z.array(schema)` con `.nonempty()` solo dove serve |
| **Backend JS senza tipi**: gli schemi backend non danno autocompletamento | Accettabile: il beneficio è la validazione runtime, non i tipi |
| **Doppia manutenzione**: schemi frontend e backend separati | Accettato per ora: frontend e backend hanno esigenze diverse (risposte vs input). In futuro, se si introduce un monorepo condiviso, gli schemi possono essere unificati in un package `shared/` |
| **Date legacy**: il DB può contenere date in formati non ISO (DD-MM-YYYY, M/D/YY) | Gli schemi frontend usano `isoDateSchema`; se emergono dati legacy, valutare un `.transform()` che normalizza o un regex più permissivo |

---

## 9. Fuori Scope (per ora)

- **Validazione delle risposte backend**: il backend non valida le proprie risposte prima di inviarle (il frontend lo fa). Se in futuro il backend viene consumato da altri client, si può aggiungere.
- **Package condiviso `shared/`**: unificare gli schemi frontend/backend in un unico package. Rimandato a quando il progetto avrà un monorepo.
- **Validazione form lato client**: i form esistenti (Login, Import) sono semplici; Zod verrà usato solo per le risposte API e gli input backend.
- **OpenAPI/Swagger**: generare documentazione API dagli schemi Zod. Possibile evoluzione futura con `@asteasolutions/zod-to-openapi`.

---

## 10. Riferimenti

- `client/src/types.ts` — tipi attuali da sostituire con `z.infer<>`
- `client/src/lib/api.ts` — da estendere con `apiFetchValidated`
- `client/src/pages/*.tsx` — pagine da aggiornare
- `controllers/*.js` — controller da proteggere con middleware `validate`
- `routes/*.js` — route dove applicare il middleware
- `models/movementModel.js` — whitelist `allowedSortColumns` da rimuovere (sostituita da Zod)
- `docs/API.md` — documentazione API da aggiornare