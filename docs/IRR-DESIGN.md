# Internal Rate of Return (IRR) — Money-Weighted CAGR per Asset e Asset Type

> ## STATO: PROGETTAZIONE
>
> Documento di progettazione della feature IRR. Non ancora implementato.

---

## 1. Obiettivo

Introdurre il calcolo del **Tasso di Rendimento Annualizzato (CAGR money-weighted)** per:

1. **Singolo asset** — sulla pagina *Dettaglio Asset* (`/portfolio/:id`)
2. **Per Asset Type (categoria)** — nella tabella riepilogativa per classe di attività (*Portfolio*) o nella sezione *Performance*

L'IRR è la metrica standard del settore (Bloomberg, Morningstar) per misurare quanto ha reso effettivamente un investimento, considerando ogni singolo flusso di cassa nel tempo. A differenza del CAGR/TWR globale (time-weighted), l'IRR **tiene conto del timing dei singoli acquisti/vendite**: acquistare al top penalizza, investire gradualmente migliora il risultato.

### Cosa NON è

- Non sostituisce il CAGR/TWR esistente su Dashboard o Performance — sono metriche complementari con domande diverse:
  - **CAGR/TWR →** "Quanto ha reso il portafoglio come entità autonoma?"
  - **IRR →** "Quanto ho guadagnato io investendo in quell'asset specifico?"
- Non richiede dati esterni (prezzi storici, fonti esterne).
- Non persiste alcun valore in database. Calcolato a runtime dai fatti importati.

---

## 2. Fondamento Matematico

### 2.1 Definizione IRR

Data una serie di flussi di cassa `{CF_0, CF_1, ..., CF_n}` alle date `{t_0, t_1, ..., t_n}`, l'IRR è il tasso `r` che soddisfa:

```
Σ [ CF_i / (1+r)^(w_i) ] = 0
```

Dove `w_i = (t_i - t_0) / (t_n - t_0)` è il peso temporale normalizzato (il primo flusso ha w=0, l'ultimo w=1).

In pratica: poniamo il primo flusso a t=0 e gli altri come frazione dell'intero periodo. L'IRR trovato è direttamente il rendimento annualizzato.

### 2.2 Algoritmo di risoluzione: Newton-Raphson

Usiamo Newton-Raphson perché converge rapidamente (tipicamente 10-50 iterazioni) ed è lo stesso metodo usato da Excel, Google Sheets e tutti i calcolatori finanziari.

```
f(r)   = Σ [ CF_i / (1+r)^w_i ]       -- NPV function
f'(r)  = Σ [ -w_i × CF_i / (1+r)^(w_i+1) ]  -- derivata prima

r_{k+1} = r_k - f(r_k) / f'(r_k)
```

Convergenza: quando `|r_{k+1} - r_k| < 1e-9` oppure si superano 100 iterazioni.

Guess iniziale: `r_0 = 0.1` (10%) -- ragionevole per investimenti azionari/obbligazionari.

### 2.3 Condizioni di successo

| Condizione | Esito |
|---|---|
| Converte in < 100 iterazioni con `r > -100%` | ✅ IRR valido |
| Diverge o converge a `r ≤ -100%` | ❌ `null` |
| Derivata quasi-zero in tutte le iterazioni | ❌ `null` |
| Meno di 2 flussi di cassa | ❌ `null` |

---

## 3. Costruzione Cash Flow

Per ogni asset, costruiamo una sequenza ordinata di flussi di cassa riutilizzando dati già esistenti nel DB.

### 3.1 Fonti Dati (già disponibili)

| Tabella / Query | Campi usati | Tipo flusso | Nota |
|---|---|---|---|
| `market_orders` | `operation_date`, `euro_amount`, `type` | BUY → negativo, SELL → positivo | `euro_amount` è già firmato correttamente (- acquisto, + vendita) |
| `cash_movements` (DIVIDEND) | `operation_date`, `euro_amount` | Positivo | Già presente nei dati |
| `cash_movements` (INTEREST) | `operation_date`, `euro_amount` | Positivo | Cedole su bond |
| Posizione attuale (calcolata) | `quantity × currentPrice` | Flusso finale positivo | Valore "odierno" della posizione |

### 3.2 Ordine cronologico

Tutti i flussi (orders, dividendi, cedole, valore corrente) vengono concatenati e ordinati per `operation_date` crescente.

### 3.3 Peso temporale (weighting)

Sia `t_0` la data del primo flusso e `t_n` quella dell'ultimo (valore corrente):

```
w_i = (t_i - t_0) / (t_n - t_0)
```

Dove i tempi sono espressi in giorni decimali per precisione massima. Il peso `w_n` dell'ultimo flusso è sempre 1.

### 3.4 Caso posizione chiusa

Se la quantità netta è zero (tutte le quote vendute):
- L'ultimo flusso è l'importo dell'ultima vendita (SELL), non un valore corrente ipotetico.
- Se esiste almeno un BUY + un SELL → IRR calcolabile.
- Se non ci sono BUY → `null`.

---

## 4. Architettura

```
+------------------------------------------------------------------+
|                      Frontend                                    |
|                                                                  |
|  AssetDetail.tsx ──► mostra IRR per asset                        |
|  Portfolio.tsx ────► mostra IRR per asset type                   |
|                                                                  |
|         GET /api/analytics/asset/:id                             |
|         GET /api/analytics/asset-type/irr                        |
+────────────────────┬─────────────────────────────────────────────┘
                     │
+--------------------▼---------------------------------------------+
|                      Backend                                   |
|                                                                  |
|  analyticsController.js                                        |
|    ├── getAssetDetailHandler()                                |  ← IRR aggiunto alla risposta esistente
|    └── getAllAssetTypeIRRs()                                |  ← nuovo endpoint
|                                                                  |
|  analyticsModel.js                                             |
|    ├── buildAssetCashFlows(assetId)                         |  ← costruzione cash flow
|    ├── calculateAssetIRR(assetId)                         |  ← orchestratore asset
|    └── calculateAssetTypeIRR(assetType)                   |  ← aggregazione per categoria
|                                                                  |
|  utils/irrEngine.js                                            |
|    ├── npv(weights, rate)                                   |  ← funzione NPV pura
|    ├── npvDerivative(weights, rate)                       |  ← derivata NPV pura
|    └── solveIRR(cashFlows[])                              |  ← Newton-Raphson engine
+──────────────────────────────────────────────────────────────────┘
                     │
+--------------------▼---------------------------------------------+
|                  Database (solo lettura)                         |
|                                                                  |
|  market_orders         (qty, amount, date, type)                 |
|  cash_movements        (date, amount, type)                      |
|  asset_prices          (current_price)                           |
|  assets                (id, ticker, asset_type)                  |
+------------------------------------------------------------------+
```

---

## 5. Piano di Implementazione — Fasi, Task e DoD

### Fase 0 — Baseline e verifica

**Obiettivo:** verificare che tutto funzioni PRIMA di modificare qualcosa.

**Task:**

- [ ] Eseguire `npm test:run` (Vitest): tutti i test esistenti devono passare
- [ ] Eseguire `npm run build`: compilazione frontend pulita
- [ ] Verificare che `/api/analytics/asset/:id` restituisca ordini, dividendi, cedole corretti
- [ ] Identificare eventuali asset nel database reale con dati sufficienti per test manuali

**Definition of Done:**

- [ ] Build e test verdi
- [ ] Endpoint asset detail funzionante e verificato con dati reali

---

### Fase 1 — Motore IRR (pure functions)

**File:** `models/__tests__/irr.test.js` (nuovo) + `utils/irrEngine.js` (nuovo)

Creare modulo standalone contenente solo le funzioni pure di calcolo IRR, testabili senza DB.

#### Funzioni da implementare

**`npv(weights, rate)`** — Calcola il Net Present Value dato un array di pesi/temporali e un tasso:

```js
function npv(weights, rate) {
  return weights.reduce((sum, w) => sum + w.amount / Math.pow(1 + rate, w.timeWeight), 0);
}
```

**`npvDerivative(weights, rate)`** — Derivata prima di NPV rispetto al rate:

```js
function npvDerivative(weights, rate) {
  return weights.reduce((sum, w) => sum + (-w.timeWeight * w.amount) / Math.pow(1 + rate, w.timeWeight + 1), 0);
}
```

**`solveIRR(cashFlows)`** — Newton-Raphson per trovare il tasso che azzerà il NPV:

```js
/**
 * @param {{ date: string, amount: number }[]} cashFlows
 * @returns {number|null} IRR annualizzato, o null se irrisolvibile
 */
function solveIRR(cashFlows) {
  // 1. Validazione: almeno 2 flussi
  if (!cashFlows || cashFlows.length < 2) return null;

  // 2. Ordina per data crescente
  cashFlows.sort((a, b) => a.date.localeCompare(b.date));

  // 3. Calcola timeWeights (frazione del periodo totale in giorni)
  const firstMs = new Date(cashFlows[0].date).getTime();
  const lastMs = new Date(cashFlows[cashFlows.length - 1].date).getTime();
  const totalDays = (lastMs - firstMs) / (1000 * 60 * 60 * 24);

  if (totalDays <= 0) return null; // Tutti nella stessa data

  const weights = cashFlows.map(cf => ({
    amount: cf.amount,
    timeWeight: (new Date(cf.date).getTime() - firstMs) / (1000 * 60 * 60 * 24) / totalDays
  }));

  // 4. Controlla che ci sia almeno un flusso positivo e uno negativo
  const hasPositive = weights.some(w => w.amount > 0);
  const hasNegative = weights.some(w => w.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  // 5. Newton-Raphson
  let rate = 0.1; // Guess iniziale: 10%
  for (let i = 0; i < 100; i++) {
    const fv = npv(weights, rate);
    const fp = npvDerivative(weights, rate);

    if (Math.abs(fp) < 1e-15) return null; // Derivata troppo piccola

    const nextRate = rate - fv / fp;

    if (Math.abs(nextRate - rate) < 1e-9) {
      // Convergenza raggiunta
      if (nextRate > -1 && Number.isFinite(nextRate)) {
        return nextRate;
      }
      return null; // Converto a valore non valido
    }

    rate = nextRate;
  }

  return null; // Non converto in 100 iterazioni
}
```

#### Test deterministici

**Test A — Singolo acquisto, guadagno semplice**

```
2023-01-01  -1000  (BUY)
2026-01-01  +1210  (VALORE CORRENTE: 100 x €12,10)
Durata: esattamente 3 anni
IRR atteso: (1210/1000)^(1/3) - 1 ≈ 0,0654... ≈ 6,54%
```

**Test B — Acquisti scalari multipli**

```
2023-01-01  -1000
2024-01-01  -1000
2025-01-01  -1000
2026-01-01  +3500
IRR atteso: ~7,04% (da calcolare con tool esterno per validare)
```

**Test C — Con dividendi intermedi**

```
2023-06-01  -1000  (BUY)
2024-06-01  +50    (DIV)
2025-06-01  +50    (DIV)
2026-06-01  +1100  (VALORE: 100 x €11,00)
IRR atteso: ~4,95%
```

**Test D — Perdita**

```
2023-01-01  -1000
2026-01-01  +800
IRR atteso: (800/1000)^(1/3) - 1 ≈ -0,0693... ≈ -6,93%
```

**Test E — Edge: meno di 2 flussi**

```
[2024-01-01, -1000]
→ null (impossibile calcolare)
```

**Test F — Edge: tutti flussi positivi (solo vendite)**

```
[2023-01-01, +500, 2024-01-01, +300]
→ null (nessun investimento, nessun costo da coprire)
```

**Test G — Edge: tutti flussi negativi (solo acquisti)**

```
[2023-01-01, -500, 2024-01-01, -500]
→ null (nessuna uscita di capitale)
```

**Definition of Done:**

- [ ] Modulo `utils/irrEngine.js` con funzioni pure esportate
- [ ] File `models/__tests__/irr.test.js` con ≥ 7 test deterministici
- [ ] Tutti i test passano (`npm run test:run`)
- [ ] Funzione `solveIRR` converge in < 50 iterazioni su tutti i dataset di test
- [ ] Nessun `NaN` o `Infinity` nelle risposte

---

### Fase 2 — Model: integrazione con DB

**File:** `models/analyticsModel.js`

#### 2a. Funzione `buildAssetCashFlows(assetId)`

Estrae dal DB tutti i flussi rilevanti per un asset e li converte nell'array ordinato richiesto da `solveIRR`:

```js
export function buildAssetCashFlows(assetId) { ... }
```

**Logica di query:**

```sql
-- 1. Ordini market (BUY/SELL) — euro_amount già firmado (- BUY, + SELL)
SELECT operation_date, euro_amount
FROM market_orders
WHERE asset_id = ?
ORDER BY operation_date ASC

-- 2. Dividendi
SELECT operation_date, euro_amount
FROM cash_movements
WHERE asset_id = ? AND movement_type = 'DIVIDEND'
ORDER BY operation_date ASC

-- 3. Cedole
SELECT operation_date, euro_amount
FROM cash_movements
WHERE asset_id = ? AND movement_type = 'INTEREST'
ORDER BY operation_date ASC
```

Combinare i risultati, ordinare per data, poi aggiungere il valore corrente:

```js
const currentValue = displayQuantity * currentPrice;
if (currentValue > 0) {
  flows.push({ date: todayISO, amount: parseFloat(currentValue.toFixed(2)) });
}
```

Ritorna `null` se:
- Nessun ordine (asset mai acquistato)
- Zero flussi dopo combinazioni
- Solo flussi negativi e nessun valore corrente

#### 2b. Funzione `calculateAssetIRR(assetId)`

Orchestratore che integra `buildAssetCashFlows` con `solveIRR`:

```js
export async function calculateAssetIRR(assetId) {
  const flows = buildAssetCashFlows(assetId);
  if (!flows || flows.length < 2) return null;

  const irr = solveIRR(flows);
  if (irr === null || irr <= -1) return null;

  // Calcola durata in anni
  const firstDate = flows[0].date;
  const lastDate = flows[flows.length - 1].date;
  const days = (new Date(lastDate) - new Date(firstDate)) / (1000 * 60 * 60 * 24);
  const years = days / 365.2425;

  return { irr, years: Math.max(years, 0), firstDate, lastDate };
}
```

#### 2c. Integrare nel `getAssetDetail` esistente

Nel metodo `getAssetDetail()` (righe ~270-420 di `analyticsModel.js`), dopo aver calcolato i dati della posizione, chiamare `calculateAssetIRR(id)` e aggiungere il risultato all'oggetto ritorno.

**Definition of Done:**

- [ ] `buildAssetCashFlows()` restituisce flussi corretti su asset reali del DB
- [ ] `calculateAssetIRR()` restituisce valori coerenti su asset con acquisti multipli
- [ ] Risultati validati contro calcolatore finanziario esterno (Excel IRR, Wolfram Alpha)
- [ ] Edge case gestiti senza errori (asset con zero ordini, posizione chiusa, etc.)

---

### Fase 3 — Controller + Route: endpoint IRR per Asset Type

**File:** `controllers/analyticsController.js` + `routes/analyticsRoutes.js`

#### 3a. Aggiornamento `getAssetDetailHandler`

Nell'handler esistente (righe ~138-152), dopo aver chiamato `getAssetDetail(id)`, aggiungere il campo `irr`:

```js
const detail = await getAssetDetail(id);
if (!detail) { return res.status(404).json(...) }

const irrResult = await calculateAssetIRR(id);
detail.irr = irrResult ?? null;

res.json(detail);
```

#### 3b. Nuova funzione `getAllAssetTypeIRRs()`

Aggrega tutti i flussi degli asset di ogni categoria e risolve una IRR unica per ciascuna:

```js
export async function getAllAssetTypeIRRs(req, res) {
  const { assetType } = req.query;

  const typesToQuery = assetType
    ? [assetType]
    : ASSET_TYPES.filter(t => t.isTargetable).map(t => t.name);

  const results = {};
  for (const type of typesToQuery) {
    results[type] = await calculateAssetTypeIRR(type);
  }

  res.json(results);
}
```

#### 3c. Nuovi endpoint HTTP

```
GET /api/analytics/asset-type/irr?assetType=BOND          — restituisce IRR per BOND
GET /api/analytics/asset-type/irr                        — restituisce IRR per TUTTI i tipi
```

Validazione:

- Parametro `assetType` opzionale; se presente deve essere un tipo valido
- Response 400 se parametro presente ma tipo non valido o target-abile
- Response 200 con oggetto `{ BOND: {...}, STOCK: {...}, ... }` quando nessun parametro

**Definition of Done:**

- [ ] Endpoint `/api/analytics/asset/:id` restituisce campo `irr` nella risposta
- [ ] Endpoint `/api/analytics/asset-type/irr` restituisce map IRR per tipo
- [ ] Entrambi testati con dati reali del database
- [ ] Error handling corretto (tipo non valido, parametri mancanti)

---

### Fase 4 — Tipizzazione TypeScript (frontend)

**File:** `client/src/types.ts` + `client/src/lib/performanceApi.ts`

#### 4a. Tipi per IRR singolo asset

Aggiungere a `types.ts`:

```ts
export interface AssetIRRData {
  irr: number;              // Decimal return (es. 0.0847 = +8,47%)
  years: number;            // Durata in anni decimali
  firstDate: string;        // Data primo flusso
  lastDate: string;         // Data ultimo flusso
}
```

Aggiornare `AssetDetailData` per includere il campo `irr`:

```ts
export interface AssetDetailData {
  asset: { ... };
  position: { ... };
  orders: AssetDetailOrder[];
  dividends: AssetDetailDividend[];
  coupons: AssetDetailDividend[];
  irr: AssetIRRData | null;  // <-- NUOVO
}
```

#### 4b. Tipo per IRR per Asset Type

Aggiungere a `performanceApi.ts`:

```ts
export interface AssetTypeIRRResponse {
  assetType: string;
  irr: number | null;
  assetCount: number;
  totalInvested: number;
  totalCurrent: number;
}

export async function fetchAssetTypeIRRs(): Promise<Record<string, AssetTypeIRRResponse | null>> {
  const response = await apiFetch(`/api/analytics/asset-type/irr`);
  return response.json() as Promise<Record<string, AssetTypeIRRResponse | null>>;
}
```

**Definition of Done:**

- [ ] Tutti i tipi TypeScript compilano senza errori (`npm run typecheck`)
- [ ] `irr: null` gestito in tutti i punti di consumo

---

### Fase 5 — UI: IRR nella pagina Asset Detail

**File:** `client/src/pages/AssetDetail.tsx`

#### 5a. Layout proposto

Nel box **"Situazione Corrente"** dove compaiono già i KPI card, aggiungere una nuova card per l'IRR.

Posizionamento consigliato: dopo "Gain/Loss %", prima o dopo la card "Carico vs Attuale".

Layout:

```
+----------------------+  +----------------------+  +----------------------+
| Gain / Loss           |  | IRR (Money-Weighted) |  | Carico vs Attuale    |
| +€171 (+10,18%)      |  | +8,47%               |  | €1.680 / €1.851      |
|                      |  | 3,2 anni investiti   |  |                      |
+----------------------+  +----------------------+  +----------------------+
```

#### 5b. Componente

La `KpiCard` esistente accetta già `label`, `value`, `sublabel`. Usarla così com'è:

```tsx
<KpiCard
  label="IRR (Money-Weighted)"
  value={data.irr ? formatPercent(data.irr.irr, 2) : 'N/D'}
  sublabel={data.irr ? `${data.irr.years.toFixed(1)} anni investiti` : 'Dati insufficienti'}
  valueClass={data.irr && data.irr.irr >= 0 ? 'text-emerald-400' : 'text-red-400'}
/>
```

#### 5c. Comportamenti condizionali

| Scenario | Visualizzazione |
|---|---|
| `data.irr !== null` | Mostra valore colorato emerald (positivo) o rosso (negativo) |
| `data.irr === null` | Mostra "N/D" in grigio, sublabel "Dati insufficienti" |

**Definition of Done:**

- [ ] IRR visualizzato nella pagina dettaglio asset accanto agli altri KPI
- [ ] Colore verde/rosso coerente con gain/loss esistente
- [ ] Nessun errore di rendering se `irr` è null o non presente nella risposta

---

### Fase 6 — UI: IRR per Asset Type nella pagina Portfolio

**File:** `client/src/pages/Portfolio.tsx`

#### 6a. Colonna aggiuntiva nella tabella Asset Class

La tabella riepilogativa per Asset Class mostra già colonne: Carico, Attuale, Gain/EUR, Gain/%, Count.

Aggiungere una colonna **IRR** tra Gain/% e Count.

Header tabella aggiornato:

```
Tipo Asset | Carico | Attuale | Gain/EUR | Gain/% | IRR | Count
```

Layout righe:

```
STOCK    | €95.4k | €98.2k | +€2.8k | +2,93% | +9,81% | 8
BOND     | €45.0k | €48.2k | +€3.2k | +7,11% | +5,23% | 4
FUND     | €50.0k | €53.6k | +€3.6k | +7,20% | +7,12% | 6
...
TOTALE   | €250k  | €260k  | +€10k  | +4,00% | —    | 27
```

Nota: l'IRR sul **Totale** non è significativo (mescola asset diversi senza fondere i cash flow), quindi mostrare `—`.

#### 6b. Strategia di fetching

Single request GET `/api/analytics/asset-type/irr` (senza parametro `assetType`) che restituisce IRR per TUTTI i tipi contemporaneamente. Più efficiente di N chiamate separate.

#### 6c. Modifiche UI

Aggiornare:
- Header tabella: aggiungere `<th>IRR</th>`
- Riga per tipo: usare i dati fetched dalla chiamata aggregata
- Formattazione: usare `formatPercent(irr, 2)` con colore emerald/rosso
- Totale: cella vuota o `—`

**Definition of Done:**

- [ ] Colonna IRR visibile nella tabella Asset Class di Portfolio
- [ ] Valori calcolati con una sola chiamata API aggiuntiva
- [ ] Righe per asset type senza dati mostrano `—`
- [ ] Riglia Totale non mostra IRR (non significativo)

---

### Fase 7 — Test Integration

**File:** `models/__tests__/irr.integration.test.js` (nuovo)

Test delle API end-to-end usando il database di test esistente.

**Scenario A — Asset con acquisti multipli**

1. Inserire snapshot + cash flows + ordini per un asset fittizio
2. Chiamare `GET /api/analytics/asset/:id`
3. Verificare che `irr` sia numerico e coerente con i flussi inseriti
4. Chiudere il database di test

**Scenario B — Asset senza ordini**

1. Creare asset senza ordini nel DB di test
2. Chiamare endpoint
3. Verificare `irr: null`

**Scenario C — Asset Type aggregation**

1. Creare 3 asset di tipo "STOCK" con ordini diversi
2. Chiamare `GET /api/analytics/asset-type/irr?assetType=STOCK`
3. Verificare che l'IRR sia coerente con la somma dei flussi

**Scenario D — Tipo non valido**

1. Chiamare `GET /api/analytics/asset-type/irr?assetType=INVALID`
2. Verificare response 400 con messaggio di errore

**Definition of Done:**

- [ ] Tutti i test integration passano
- [ ] Nessun `NaN` o `Infinity` nelle risposte JSON
- [ ] Tutti i test eseguiti con `fileParallelism: false` (SQLite condiviso)

---

### Fase 8 — Hardening e Documentazione

**Task:**

- [ ] Eseguire `npm test:run`: tutti i test (vecchi + nuovi) devono passare
- [ ] Eseguire `npm run build`: compilazione pulita
- [ ] Aggiornare `docs/API.md` con nuova documentazione per:
  - Campo `irr` nella risposta `GET /api/analytics/asset/:id`
  - Nuovo endpoint `GET /api/analytics/asset-type/irr`
- [ ] Eseguire regressione TWR: verificare che `calculateTWR()` produca ancora gli stessi risultati
- [ ] Verificare che le modifiche non impattino performance delle pagine esistenti (caricamento asset detail, portfolio)

**Definition of Done:**

- [ ] Build verde
- [ ] Tutti i test verdi (unit + integration + regression)
- [ ] Documentazione API aggiornata
- [ ] Nessun impatto sulle funzionalità esistenti

---

## 6. Riepilogo file da modificare

| File | Azione | Fase |
|---|---|---|
| `utils/irrEngine.js` | **NUOVO** — funzioni pure IRR (Newton-Raphson) | 1 |
| `models/__tests__/irr.test.js` | **NUOVO** — unit test IRR puro | 1 |
| `models/analyticsModel.js` | **MODIFICARE** — aggiungere `buildAssetCashFlows`, `calculateAssetIRR`, integrare in `getAssetDetail` | 2 |
| `models/__tests__/irr.integration.test.js` | **NUOVO** — test integration backend | 7 |
| `controllers/analyticsController.js` | **MODIFICARE** — aggiornare handler, aggiungere `getAllAssetTypeIRRs` | 3 |
| `routes/analyticsRoutes.js` | **MODIFICARE** — aggiungere route per asset-type IRR | 3 |
| `client/src/types.ts` | **MODIFICARE** — aggiungere `AssetIRRData`, aggiornare `AssetDetailData` | 4 |
| `client/src/lib/performanceApi.ts` | **MODIFICARE** — aggiungere helper fetch asset-type IRR | 4 |
| `client/src/pages/AssetDetail.tsx` | **MODIFICARE** — aggiungere IRR card nel box KPI | 5 |
| `client/src/pages/Portfolio.tsx` | **MODIFICARE** — aggiungere colonna IRR nella tabella Asset Class | 6 |
| `docs/IRR-DESIGN.md` | **QUESTO FILE** | — |

---

## 7. Decisioni Progettuali

| Decisione | Scelta | Motivazione |
|---|---|---|
| Metodo di calcolo | IRR (Money-Weighted) | Standard settore, utilizza dati esistenti, tiene conto del timing degli acquisti |
| Algoritmo | Newton-Raphson | Veloce (10-50 iterazioni), preciso, ampiamente testato |
| Unità del campo | Decimale (0,0847 ≠ 8,47%) | Coerente con resto dell'app (CAGR, return, Sharpe usano decimale) |
| Persistenza | No DB | Calcolato a runtime, come tutte le altre metriche analitiche |
| Conversione valuta | EUR-only | `euro_amount` è già convertito nel DB; ignoriamo valute originali |
| Flusso finale | Valore corrente (qty × price) | Rappresenta il "vendita oggi" ipotetico; necessario per annualizzare |
| Asset Type IRR | Flussi fusi + solver unico | Più accurato di semplici medie; riflette il rendimento complessivo della categoria |
| Position chiusa | `null` (irr non calcolabile) | Senza valore corrente, non possiamo determinare il rendimento finalizzato |
| Cache | Nessuna | IRR è computazionalmente leggero (< 1ms); caching prematuro |
| Precisione | `Number` JS nativo | Coerente con resto dell'app; arrotondamento solo in UI |
| Output API | Campo inline nella risposta esistente | Minimale impatto sulle chiamate esistenti; retro-compatibile |

---

## 8. Glossario

| Termine | Definizione |
|---|---|
| **IRR** (Internal Rate of Return) | Tasso di rendimento interno: il tasso che azzera il NPV di una serie di flussi di cassa |
| **Money-Weighted Return** | Reso noto anche come IRR; tiene conto del timing dei flussi di cassa |
| **Time-Weighted Return (TWR)** | Reso noto anche come CAGR del portafoglio; misura la performance indipendente dal timing dei depositi |
| **NPV** (Net Present Value) | Somma dei flussi di cassa attualizzati al tasso IRR |
| **Newton-Raphson** | Algoritmo numerico per trovare radici di funzioni (usato per risolvere l'IRR) |
| **Peso temporale** | Frazione di tempo relativa tra un flusso e il primo/ultimo flusso |
| **Capital gain** | Differenza tra prezzo di vendita e prezzo di acquisto |
| **Yield** | Reddito generato (dividendi/cedole) diviso il valore dell'investimento |

---

**End of Document**
