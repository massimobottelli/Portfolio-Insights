# 📡 API & Endpoint — Portfolio Insights

> Documentazione tecnica delle API REST esposte dal backend Express.

---

## 1. Panoramica

L'applicazione espone un'API REST JSON per la gestione del portafoglio finanziario. Tutti gli endpoint sono serviti dal backend Express e consumati dal frontend React.

### Base URL

```
http://localhost:3000/api
```

### Autenticazione

Tutti gli endpoint `/api/*` (tranne `/api/auth/check`) richiedono un **API Token**:

- Header: `Authorization: Bearer <token>`
- Il token viene generato automaticamente all'avvio del server e stampato nella console (o configurato via variabile d'ambiente `API_TOKEN`)
- Se il token non è valido o manca → `401 { "error": "Autenticazione richiesta" }`
- Il token viene salvato in `db/.api-token` (permessi 600) se generato automaticamente

**Esempio:**
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/analytics/dashboard
```

### Endpoint di Verifica Token

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/api/auth/check` | Verifica se il token è valido (NON protetto, usato per il login) |

**Rate limiting:** `/api/auth/check` è limitato a 5 richieste/minuto per IP (anti brute-force). Oltre il limite → `429`.

### Convenzioni

- **Formato dati:** JSON (`Content-Type: application/json`)
- **Date:** formato ISO `YYYY-MM-DD`
- **Valori monetari:** numeri decimali (es. `230758.56`)
- **Errori:** risposta JSON con campo `error` (e opzionalmente `details`)
- **Cache:** tutte le risposte API includono `Cache-Control: no-store` (dati finanziari sensibili)

### Struttura delle Route

Le route sono organizzate per dominio e montate in `app.js`:

| Prefisso | Router | Dominio |
|---|---|---|
| `/api/analytics` | `analyticsRoutes.js` | KPI, posizioni, allocazione, storico, TWR |
| `/api/analytics` | `performanceRoutes.js` | Volatilità, Sharpe, metriche aggregate Performance & Risk |
| `/api/assets` | `assetRoutes.js` | Gestione strumenti finanziari |
| `/api/import` | `importRoutes.js` | Importazione CSV e sessioni |
| `/api/movements` | `movementRoutes.js` | Movimenti di cassa |
| `/api` | `allocationRoutes.js` | Catalogo asset types, allocazione e ribilanciamento |
| `/api/orders` | `orderRoutes.js` | Ordini di mercato (MarketOrder) |

---

## 2. Riepilogo Endpoint

| Metodo | Percorso | Descrizione |
|---|---|---|
| GET | `/api/analytics/dashboard` | KPI principali per la Dashboard |
| GET | `/api/analytics/portfolio` | Lista delle posizioni attive |
| GET | `/api/analytics/allocation` | Allocazione percentuale del portafoglio |
| GET | `/api/analytics/history` | Serie storica del valore portafoglio |
| GET | `/api/analytics/twr` | Time-Weighted Rate of Return |
| GET | `/api/analytics/rates` | Tassi di cambio odierni (ECB) per conversione EUR |
| GET | `/api/analytics/asset/:id` | Dettaglio completo di un singolo asset |
| GET | `/api/assets` | Lista completa degli asset |
| GET | `/api/assets/by-isin/:isin` | Singolo asset per ISIN |
| GET | `/api/assets/:id` | Singolo asset per ID interno |
| PATCH | `/api/assets/:id/type` | Aggiorna il tipo di un asset |
| POST | `/api/import` | Importa un file CSV Directa |
| GET | `/api/import/sessions` | Storico delle sessioni di import |
| DELETE | `/api/import/clear` | Svuota completamente il database |
| GET | `/api/movements` | Lista movimenti di cassa con filtri |
| GET | `/api/movements/symbols` | Ticker distinti per dropdown filtro |
| GET | `/api/asset-types` | Catalogo dei tipi di asset |
| GET | `/api/allocation/current` | Allocazione attuale per categoria |
| GET | `/api/allocation/target` | Target di allocazione configurato |
| PUT | `/api/allocation/target` | Salva il target di allocazione |
| GET | `/api/allocation/rebalance` | Divergenze e suggerimenti di ribilanciamento |
| GET | `/api/analytics/volatility` | Volatilità giornaliera e annualizzata |
| GET | `/api/analytics/sharpe` | Sharpe ratio con risk-free rate configurabile |
| GET | `/api/analytics/performance` | Metriche aggregate Performance & Risk |
| GET | `/api/orders` | Lista ordini di mercato con filtri e ordinamento |
| GET | `/api/orders/symbols` | Ticker distinti per dropdown filtro |
| DELETE | `/api/orders/:id` | Elimina un singolo ordine di mercato |

---

## 3. Endpoint Analytics (`/api/analytics`)

### 3.1 GET `/api/analytics/dashboard`

Restituisce i KPI principali per la Dashboard.

**Risposta 200 OK**

```json
{
  "portfolioValue": 230758.56,
  "investedCapital": 257600.00,
  "availableCash": 256480.80,
  "totalProfitLoss": -26841.44,
  "totalProfitLossPercent": -10.42,
  "totalPositions": 27,
  "snapshotDate": "2026-08-06"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `portfolioValue` | number | Valore totale del portafoglio (ultimo snapshot) |
| `investedCapital` | number | Capitale investito (somma dei DEPOSIT) |
| `availableCash` | number | Liquidità disponibile |
| `totalProfitLoss` | number | Profitto/Perdita assoluto (valore − capitale) |
| `totalProfitLossPercent` | number | Profitto/Perdita percentuale |
| `totalPositions` | number | Numero di posizioni attive |
| `snapshotDate` | string \| null | Data dell'ultimo snapshot |

**Errori:** `500` — Errore nel calcolo dei KPI.

---

### 3.2 GET `/api/analytics/portfolio`

Restituisce la lista delle posizioni attive nel portafoglio, con prezzo corrente, prezzo medio di carico e data di aggiornamento.

**Risposta 200 OK**

```json
{
  "positions": [
    {
      "asset_id": "uuid",
      "isin": "IE00BDFL4P12",
      "ticker": "X.SXRS",
      "name": "ISHARES DIV COMM SWAP ETF",
      "currency": "EUR",
      "asset_type": "UNKNOWN",
      "quantity": 150,
      "current_price": 12.34,
      "average_price": 11.20,
      "price_date": "2026-08-06"
    }
  ],
  "priceDate": "2026-08-06"
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `positions[].asset_id` | string | ID interno dell'asset (UUID) |
| `positions[].isin` | string | Codice ISIN |
| `positions[].ticker` | string | Simbolo di trading |
| `positions[].name` | string | Nome dello strumento |
| `positions[].currency` | string | Valuta di trading |
| `positions[].asset_type` | string | Tipo di asset (BOND, STOCK, FUND, COMMODITY, CASH, UNKNOWN) |
| `positions[].quantity` | number | Quantità netta (BUY − SELL), solo > 0 |
| `positions[].current_price` | number \| null | Prezzo corrente unitario |
| `positions[].average_price` | number \| null | Prezzo medio di carico unitario |
| `positions[].price_date` | string \| null | Data estrazione prezzo |
| `priceDate` | string \| null | Data di estrazione più recente |

**Note:** Le posizioni sono ordinate per nome asset. Sono incluse solo le posizioni con quantità netta > 0.

**Errori:** `500` — Errore nel recupero del portafoglio.

---

### 3.3 GET `/api/analytics/allocation`

Restituisce l'allocazione percentuale del portafoglio, basata sul valore di mercato (quantità × prezzo corrente).

**Risposta 200 OK**

```json
[
  {
    "asset_id": "uuid",
    "isin": "IE00BDFL4P12",
    "ticker": "X.SXRS",
    "name": "ISHARES DIV COMM SWAP ETF",
    "currency": "EUR",
    "asset_type": "UNKNOWN",
    "quantity": 150,
    "current_price": 12.34,
    "average_price": 11.20,
    "price_date": "2026-08-06",
    "marketValue": 1851.00,
    "allocationPercent": 18.42
  }
]
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `[].marketValue` | number | Valore di mercato (quantità × prezzo corrente) |
| `[].allocationPercent` | number | Peso percentuale sul totale (2 decimali) |

**Note:**
- Gli asset senza prezzo corrente (`current_price` null) sono esclusi.
- Le posizioni sono ordinate per valore di mercato decrescente.
- **Correzione BTP:** per gli asset BTP la quantità è divisa per 100 (Directa quota i BTP in percentuale, es. 102.50).

**Errori:** `500` — Errore nel calcolo dell'allocazione.

---

### 3.4 GET `/api/analytics/history`

Restituisce la serie storica degli snapshot giornalieri del portafoglio, con i depositi cumulativi per il grafico.

**Risposta 200 OK**

```json
[
  {
    "snapshot_date": "2024-06-05",
    "portfolio_value": 100000.00,
    "available_cash": 50000.00,
    "invested_capital": 0,
    "cumulative_deposits": 100000.00
  }
]
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `[].snapshot_date` | string | Data dello snapshot |
| `[].portfolio_value` | number | Valore totale del portafoglio |
| `[].available_cash` | number | Liquidità disponibile |
| `[].invested_capital` | number | Valore di carico (sempre 0 dal report Patrimonio) |
| `[].cumulative_deposits` | number | Depositi cumulativi fino a quella data |

**Note:** Gli snapshot sono ordinati per data crescente. `cumulative_deposits` è calcolato sommando tutti i DEPOSIT con `operation_date <= snapshot_date`.

**Errori:** `500` — Errore nel recupero dello storico.

---

### 3.5 GET `/api/analytics/twr`

Restituisce il Time-Weighted Rate of Return (TWR) del portafoglio, calcolato con sottoperiodi delimitati dai depositi.

**Risposta 200 OK**

```json
{
  "twrTotal": 0.1234,
  "twrYTD": 0.0456,
  "twrAnnual": [
    { "year": 2024, "twr": 0.0821 },
    { "year": 2025, "twr": 0.0312 },
    { "year": 2026, "twr": 0.0456 }
  ],
  "twrHistory": [
    { "snapshot_date": "2024-06-05", "twr": 0 },
    { "snapshot_date": "2024-06-06", "twr": 0.000123 }
  ]
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `twrTotal` | number | TWR totale (4 decimali) |
| `twrYTD` | number | TWR da inizio anno (4 decimali) |
| `twrAnnual` | array | TWR per anno solare |
| `twrHistory` | array | Serie storica del TWR (6 decimali) |

**Note:**
- Il TWR è calcolato con sottoperiodi delimitati dai depositi (flussi di cassa esterni).
- I depositi sono l'unico flusso di cassa esterno considerato (nessun WITHDRAWAL).
- Se ci sono meno di 2 snapshot, restituisce valori a zero.

**Errori:** `500` — Errore nel calcolo del TWR.

---

### 3.6 GET `/api/analytics/rates`

Restituisce i tassi di cambio odierni usati per la conversione in EUR. Fonte: ECB Data Portal (SDMX 2.1 API).

**Risposta 200 OK**

```json
{
  "date": "2026-08-14",
  "rates": {
    "EUR": 1,
    "USD": 1.1567
  }
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `date` | string | Data odierna (YYYY-MM-DD) |
| `rates` | object | Mappa valuta → tasso (unità di valuta per 1 EUR) |

**Note:**
- `EUR` è sempre presente con tasso `1` (identity, nessuna chiamata API).
- I tassi sono recuperati on-demand da ECB e cachati in memoria per la giornata.
- Se ECB non risponde e non c'è cache, la valuta è omessa dalla mappa.

**Errori:** `500` — Errore nel recupero dei tassi di cambio.

---

### 3.7 GET `/api/analytics/asset/:id`

Restituisce il dettaglio completo di un singolo asset: info anagrafiche, posizione corrente, P&L, allocazione, cronologia ordini, dividendi e cedole.

**Parametri Path**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `id` | string | ID interno dell'asset (UUID) |

**Risposta 200 OK**

```json
{
  "asset": {
    "id": "uuid",
    "isin": "IE00BDFL4P12",
    "ticker": "X.SXRS",
    "name": "ISHARES DIV COMM SWAP ETF",
    "assetType": "UNKNOWN",
    "currency": "EUR"
  },
  "position": {
    "quantity": 150,
    "currentPrice": 12.34,
    "priceDate": "2026-08-06",
    "averagePrice": 11.20,
    "bookValue": 1680.00,
    "currentValue": 1851.00,
    "pnl": 171.00,
    "pnlPercent": 10.18,
    "allocationPercent": 18.42,
    "allocationTypePercent": 100.00
  },
  "orders": [
    {
      "date": "2024-07-01",
      "valueDate": "2024-07-03",
      "type": "BUY",
      "quantity": 100,
      "price": 11.00,
      "amount": -1100.00,
      "currency": "EUR",
      "reference": "123456"
    }
  ],
  "dividends": [
    { "date": "2025-01-15", "amount": 25.50, "currency": "EUR" }
  ],
  "coupons": [
    { "date": "2025-02-01", "amount": 40.00, "currency": "EUR" }
  ]
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `asset` | object | Info anagrafiche dell'asset |
| `position.quantity` | number | Quantità netta (con correzione BTP /100) |
| `position.currentPrice` | number \| null | Prezzo corrente unitario |
| `position.averagePrice` | number \| null | Prezzo medio di carico unitario |
| `position.bookValue` | number \| null | Valore di carico (quantità × prezzo medio) |
| `position.currentValue` | number \| null | Valore corrente (quantità × prezzo corrente) |
| `position.pnl` | number \| null | Profitto/Perdita assoluto |
| `position.pnlPercent` | number \| null | Profitto/Perdita percentuale |
| `position.allocationPercent` | number \| null | Peso % sul portafoglio totale |
| `position.allocationTypePercent` | number \| null | Peso % sull'asset type |
| `orders[]` | array | Cronologia ordini BUY/SELL (data decrescente) |
| `orders[].price` | number \| null | Prezzo unitario implicito (importo / quantità) |
| `dividends[]` | array | Storico dividendi incassati (data decrescente) |
| `coupons[]` | array | Storico cedole incassate (data decrescente) |

**Errori:**
- `404` — Asset non trovato (`{ "error": "Asset non trovato" }`)
- `500` — Errore nel recupero del dettaglio asset

---

### 3.8 GET `/api/analytics/volatility`

Restituisce la volatilità del portafoglio calcolata dalla canonical return series (rendimenti giornalieri corretti per i flussi esterni).

**Query Parameters**

| Parametro | Tipo | Default | Descrizione |
|---|---|---|---|
| `from` | string | — | Data inizio periodo (`YYYY-MM-DD`) |
| `to` | string | — | Data fine periodo (`YYYY-MM-DD`) |

**Risposta 200 OK**

```json
{
  "daily": 0.0071,
  "annualized": 0.1127,
  "dataPoints": 793
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `daily` | number \| null | Deviazione standard dei rendimenti giornalieri |
| `annualized` | number \| null | Volatilità annualizzata (`daily × √365`) |
| `dataPoints` | number | Numero di punti della serie |

**Note:** Con meno di 2 punti (o database vuoto) `daily` e `annualized` sono `null`.

**Errori:** `500` — Errore nel calcolo della volatilità.

---

### 3.9 GET `/api/analytics/sharpe`

Restituisce lo Sharpe ratio per un dato risk-free rate annuale.

**Query Parameters**

| Parametro | Tipo | Default | Descrizione |
|---|---|---|---|
| `from` | string | — | Data inizio periodo (`YYYY-MM-DD`) |
| `to` | string | — | Data fine periodo (`YYYY-MM-DD`) |
| `riskFreeRate` | number | `0` | Risk-free rate annuale **in percentuale** (es. `2.5` = 2,5%) |

**Risposta 200 OK**

```json
{
  "sharpeRatio": 0.71,
  "dataPoints": 793,
  "riskFreeRate": 2.5
}
```

**Errori:**
- `400` — Risk-free rate non valido (`{ "error": "Invalid risk-free rate" }`): deve essere numerico con `-100 < rate < 100`
- `500` — Errore nel calcolo dello Sharpe ratio

**Note:** Con volatilità zero lo Sharpe è `null` (mai `Infinity`). Il risk-free annuale viene convertito in giornaliero con `(1 + rf)^(1/365) - 1`.

---

### 3.10 GET `/api/analytics/performance`

Endpoint aggregato che restituisce **tutte** le metriche di performance e rischio in una singola risposta. Tutte le metriche derivano dalla stessa canonical return series (una sola lettura dal DB), garantendo coerenza tra i calcoli.

**Query Parameters**

| Parametro | Tipo | Default | Descrizione |
|---|---|---|---|
| `from` | string | — | Data inizio periodo (`YYYY-MM-DD`) |
| `to` | string | — | Data fine periodo (`YYYY-MM-DD`) |
| `riskFreeRate` | number | `0` | Risk-free rate annuale **in percentuale** |

> La pagina Performance dell'app chiama questo endpoint sempre sull'intero periodo di investimento (`from` assente), con il risk-free rate scelto dall'utente (default UI: 2,20%).

**Risposta 200 OK**

```json
{
  "period": { "from": "2024-06-05", "to": "2026-08-06", "days": 792 },
  "riskFreeRate": 0.022,
  "metadata": {
    "dataPoints": 793,
    "hasGaps": false,
    "periodLessThanOneYear": false
  },
  "performance": {
    "cumulativeReturn": 0.1234,
    "cagr": 0.0567
  },
  "risk": {
    "dailyVolatility": 0.0071,
    "annualizedVolatility": 0.1127,
    "sharpeRatio": 0.71
  },
  "periodStats": {
    "months": { "positive": 18, "negative": 8, "flat": 0, "total": 26, "positiveRate": 0.6923, "negativeRate": 0.3077 },
    "years": { "positive": 2, "negative": 1, "flat": 0, "total": 3, "positiveRate": 0.6667, "negativeRate": 0.3333 }
  },
  "bestWorst": {
    "month": { "year": 2025, "month": 7, "return": 0.0412 },
    "worst": { "year": 2025, "month": 3, "return": -0.0318 },
    "year": { "year": 2025, "return": 0.0981 },
    "worstYear": { "year": 2024, "return": -0.0214 }
  },
  "drawdown": {
    "current": -0.0034,
    "maximum": -0.0824,
    "peakDate": "2025-02-14",
    "troughDate": "2025-04-09",
    "recoveryDate": "2025-06-12",
    "durationDays": 118,
    "recoveryDays": 64,
    "isRecovered": true
  },
  "annualReturns": [
    { "year": 2024, "return": 0.0312 },
    { "year": 2025, "return": 0.0981 }
  ],
  "monthlyReturns": [
    { "year": 2024, "month": 6, "return": 0.0042 }
  ],
  "cumulativeSeries": [
    { "date": "2024-06-05", "value": 1.0 },
    { "date": "2024-06-06", "value": 1.000123 }
  ]
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `period` | object | Intervallo effettivo dei dati (`from`/`to` reali della serie, `days` di differenza) |
| `riskFreeRate` | number | Risk-free rate in decimale (es. `0.025` = 2,5%) |
| `metadata.dataPoints` | number | Numero di snapshot nella serie |
| `metadata.hasGaps` | boolean | `true` se ci sono buchi > 2 giorni tra snapshot consecutivi |
| `metadata.periodLessThanOneYear` | boolean | `true` se il periodo analizzato è inferiore a 1 anno |
| `performance.cumulativeReturn` | number \| null | Rendimento cumulativo TWR |
| `performance.cagr` | number \| null | CAGR annualizzato (`(1+TWR)^(1/anni)-1`, anni = giorni/365.2425) |
| `risk.dailyVolatility` | number \| null | Deviazione standard giornaliera |
| `risk.annualizedVolatility` | number \| null | Volatilità annualizzata (√365) |
| `risk.sharpeRatio` | number \| null | Sharpe ratio (`null` se volatilità zero o dati insufficienti) |
| `periodStats.months` / `.years` | object | Conteggi positivi/negativi/flat (zero = flat, mai negativo) |
| `bestWorst` | object | Best/worst mese e anno (chiavi `month`/`worst`/`year`/`worstYear`) |
| `drawdown` | object | Drawdown corrente e massimo, peak/trough/recovery, durate in giorni |
| `annualReturns[]` | array | Rendimenti annuali composti |
| `monthlyReturns[]` | array | Rendimenti mensili composti (`YYYY-MM`) |
| `cumulativeSeries[]` | array | Curva cumulativa normalizzata (parte da 1.0) |

**Errori:**
- `400` — Risk-free rate non valido (`{ "error": "Invalid risk-free rate" }`)
- `500` — Errore nel calcolo delle metriche di performance

**Note:**
- Nessun valore `NaN` o `Infinity`: i valori non finiti sono sostituiti con `null`.
- Con database vuoto restituisce strutture a zero/null con `dataPoints: 0`.
- I rendimenti mensili/annuali sono aggregati per compounding geometrico, non per somma.

---

## 4. Endpoint Asset (`/api/assets`)

### 4.1 GET `/api/assets`

Restituisce la lista completa di tutti gli asset, ordinati per nome.

**Risposta 200 OK**

```json
[
  {
    "id": "uuid",
    "isin": "IE00BDFL4P12",
    "ticker": "X.SXRS",
    "name": "ISHARES DIV COMM SWAP ETF",
    "currency": "EUR",
    "asset_type": "UNKNOWN",
    "exchange": null,
    "directa_code": "M.512272"
  }
]
```

**Errori:** `500` — Errore nel recupero degli asset.

---

### 4.2 GET `/api/assets/by-isin/:isin`

Restituisce un singolo asset per ISIN.

**Parametri Path**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `isin` | string | Codice ISIN dell'asset |

**Risposta 200 OK**

```json
{
  "id": "uuid",
  "isin": "IE00BDFL4P12",
  "ticker": "X.SXRS",
  "name": "ISHARES DIV COMM SWAP ETF",
  "currency": "EUR",
  "asset_type": "UNKNOWN",
  "exchange": null,
  "directa_code": "M.512272"
}
```

**Errori:**
- `404` — Asset non trovato
- `500` — Errore nel recupero dell'asset

> **Nota importante:** Questa rotta DEVE essere registrata prima di `GET /api/assets/:id`, altrimenti Express la interpreterebbe come `GET /api/assets/by-isin`.

---

### 4.3 GET `/api/assets/:id`

Restituisce un singolo asset per ID interno.

**Parametri Path**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `id` | string | ID interno dell'asset (UUID) |

**Risposta 200 OK**

```json
{
  "id": "uuid",
  "isin": "IE00BDFL4P12",
  "ticker": "X.SXRS",
  "name": "ISHARES DIV COMM SWAP ETF",
  "currency": "EUR",
  "asset_type": "UNKNOWN",
  "exchange": null,
  "directa_code": "M.512272"
}
```

**Errori:**
- `404` — Asset non trovato
- `500` — Errore nel recupero dell'asset

---

### 4.4 PATCH `/api/assets/:id/type`

Aggiorna il tipo di un asset (classificazione manuale).

**Parametri Path**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `id` | string | ID interno dell'asset (UUID) |

**Body della Richiesta**

```json
{
  "assetType": "BOND"
}
```

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `assetType` | string | Sì | Nuovo tipo di asset (case-insensitive) |

**Valori accettati:** `BOND`, `STOCK`, `CASH`, `FUND`, `COMMODITY`, `UNKNOWN`

> **Nota:** i tipi `ETF`, `ETC` ed `ETN` sono stati decommissionati e migrati a `UNKNOWN` (migrazione automatica all'avvio del server). L'utente può riclassificare gli asset tramite il dropdown nella pagina Portfolio.

**Risposta 200 OK**

```json
{
  "id": "uuid",
  "isin": "IE00BDFL4P12",
  "ticker": "X.SXRS",
  "name": "ISHARES DIV COMM SWAP ETF",
  "currency": "EUR",
  "asset_type": "BOND",
  "exchange": null,
  "directa_code": "M.512272"
}
```

**Errori:**
- `400` — Campo `assetType` obbligatorio o tipo non valido
- `404` — Asset non trovato
- `500` — Errore nell'aggiornamento del tipo

**Note:** Il tipo viene normalizzato in maiuscolo e validato contro la lista `ASSET_TYPES` in `config/assetTypes.js`. Sul re-import, i tipi assegnati manualmente vengono preservati e non sovrascritti con `UNKNOWN`.

---

## 5. Endpoint Import (`/api/import`)

### 5.1 POST `/api/import`

Endpoint principale per l'importazione dei file CSV Directa. Riceve un file CSV (come testo) e lo processa, creando automaticamente gli asset, gli ordini e i movimenti di cassa necessari.

**Body della Richiesta — Formato CSV (consigliato)**

```json
{
  "fileContent": "CSV text...",
  "filename": "Movimenti.csv"
}
```

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `fileContent` | string | Sì* | Contenuto del file CSV come stringa |
| `filename` | string | No | Nome del file (default `unknown.csv`) |

**Body della Richiesta — Formato legacy (JSON pre-parsato)**

```json
{
  "fileType": "orders",
  "records": []
}
```

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `fileType` | string | Sì* | Tipo di file (`orders`, `portfolio`, `history`) |
| `records` | array | Sì* | Record pre-parsati |

*\* È richiesto `fileContent` oppure `fileType` + `records`.*

**Rilevamento Automatico del Tipo di Report**

Il parser analizza le prime 7 righe del CSV per determinare il tipo:

| Condizione | Tipo Rilevato |
|---|---|
| Riga contenente `PATRIMONIO` | `history` (Patrimonio Totale) |
| Riga contenente `Portafoglio : TOTALE` | `portfolio` (P_TOTALE) |
| Altrimenti | `orders` (Movimenti) |

**Filtro Incrementale per Data**

Per i report `orders`, vengono importati solo i movimenti con data successiva all'ultima data presente nel database. Questo previene duplicati durante il re-import, pur permettendo ordini multipli con la stessa data (ordini divisi).

**Risposta 200 OK**

```json
{
  "success": true,
  "importSessionId": "uuid",
  "recordsImported": 188,
  "totalRecords": 188
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `success` | boolean | Esito dell'importazione |
| `importSessionId` | string | ID della sessione di import creata |
| `recordsImported` | number | Numero di record effettivamente importati |
| `totalRecords` | number | Numero totale di record processati |

**Errori:**
- `400` — Richiesta non valida (mancano `fileContent` o `fileType` + `records`)
- `500` — Errore durante l'importazione

**Note:**
- Il body JSON è limitato a 50mb (configurato in `app.js`) perché i file CSV Directa possono superare i 100KB default di Express.
- Gli errori sui singoli record vengono loggati ma non interrompono l'importazione.

---

### 5.2 GET `/api/import/sessions`

Restituisce lo storico delle sessioni di import, ordinate per data decrescente.

**Risposta 200 OK**

```json
[
  {
    "id": "uuid",
    "filename": "Movimenti.csv",
    "import_date": "2026-08-09T10:30:00.000Z",
    "status": "SUCCESS",
    "records_imported": 188,
    "errors": null
  }
]
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `[].id` | string | ID della sessione |
| `[].filename` | string | Nome del file importato |
| `[].import_date` | string | Data/ora dell'import (ISO 8601) |
| `[].status` | string | Stato (`SUCCESS`, `FAILED`) |
| `[].records_imported` | number | Numero di record importati |
| `[].errors` | string \| null | Log degli errori (se fallito) |

**Errori:** `500` — Errore nel recupero delle sessioni.

---

### 5.3 DELETE `/api/import/clear`

Svuota completamente il database cancellando tutti i dati importati. Richiede conferma esplicita nel corpo della richiesta.

**Body della Richiesta**

```json
{
  "confirm": true
}
```

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `confirm` | boolean | Sì | Deve essere `true` per procedere |

**Risposta 200 OK**

```json
{
  "success": true,
  "deleted": {
    "marketOrders": 188,
    "cashMovements": 184,
    "snapshots": 793,
    "assetPrices": 27,
    "assets": 27,
    "sessions": 2
  }
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `success` | boolean | Esito della cancellazione |
| `deleted.marketOrders` | number | Ordini cancellati |
| `deleted.cashMovements` | number | Movimenti di cassa cancellati |
| `deleted.snapshots` | number | Snapshot cancellati |
| `deleted.assetPrices` | number | Prezzi asset cancellati |
| `deleted.assets` | number | Asset cancellati |
| `deleted.sessions` | number | Sessioni di import cancellate |

**Errori:**
- `400` — Conferma richiesta (`{ "error": "Conferma richiesta", "details": "Per cancellare tutti i dati inviare { \"confirm\": true }" }`)
- `500` — Errore durante la cancellazione

**Note:** La cancellazione avviene in una transazione SQLite con le foreign key temporaneamente disabilitate.

---

## 6. Endpoint Movements (`/api/movements`)

### 6.1 GET `/api/movements`

Restituisce la lista dei movimenti di cassa (CashMovement) con filtri e ordinamento. Esclude i MarketOrder (ordini di acquisto/vendita).

**Query Parameters**

| Parametro | Tipo | Default | Descrizione |
|---|---|---|---|
| `sortBy` | string | `operation_date` | Colonna per ordinamento |
| `sortOrder` | string | `desc` | `asc` o `desc` |
| `startDate` | string | — | Filtro data inizio (`YYYY-MM-DD`) |
| `endDate` | string | — | Filtro data fine (`YYYY-MM-DD`) |
| `type` | string | — | Filtro per `movement_type` |
| `symbol` | string | — | Filtro per ticker dell'asset |
| `search` | string | — | Ricerca testuale su protocollo, nome o ticker |

**Colonne ordinabili (`sortBy`):** `operation_date`, `value_date`, `movement_type`, `euro_amount`, `currency`, `ticker`, `name`

**Valori `movement_type`:** `DEPOSIT`, `WITHDRAWAL`, `DIVIDEND`, `INTEREST`, `TAX`, `COMMISSION`, `STAMP_DUTY`, `OTHER`

**Esempio di Richiesta**

```
GET /api/movements?type=DIVIDEND&startDate=2025-01-01&endDate=2025-12-31&sortBy=euro_amount&sortOrder=desc
```

**Risposta 200 OK**

```json
{
  "data": [
    {
      "id": "uuid",
      "operation_date": "2025-06-15",
      "value_date": "2025-06-17",
      "movement_type": "DIVIDEND",
      "euro_amount": 125.50,
      "currency": "EUR",
      "protocol": "123456789",
      "order_reference": null,
      "asset_id": "uuid",
      "isin": "IT0001234567",
      "ticker": "ENI",
      "asset_name": "ENI SPA"
    }
  ],
  "total": 184
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `data[].id` | string | ID del movimento |
| `data[].operation_date` | string | Data operazione |
| `data[].value_date` | string | Data valuta |
| `data[].movement_type` | string | Tipo di movimento |
| `data[].euro_amount` | number | Importo in euro (firmato) |
| `data[].currency` | string | Valuta |
| `data[].protocol` | string \| null | Protocollo Directa |
| `data[].order_reference` | string \| null | Riferimento ordine collegato |
| `data[].asset_id` | string \| null | ID asset (null se non associato) |
| `data[].isin` | string \| null | ISIN dell'asset |
| `data[].ticker` | string \| null | Ticker dell'asset |
| `data[].asset_name` | string \| null | Nome dell'asset |
| `total` | number | Conteggio totale dei movimenti (senza paginazione) |

**Note:**
- La whitelist delle colonne ordinabili previene SQL injection.
- La ricerca (`search`) usa `LIKE` su `protocol`, `name` e `ticker`.

**Errori:** `500` — Errore nel recupero dei movimenti.

---

### 6.2 GET `/api/movements/symbols`

Restituisce la lista dei ticker distinti presenti nei `cash_movements`, utile per popolare il dropdown filtro "Simbolo".

**Risposta 200 OK**

```json
["ENI", "X.SXRS", "VWCE"]
```

**Note:** Restituisce un array di stringhe (ticker), ordinati alfabeticamente. Sono esclusi i ticker null o vuoti.

**Errori:** `500` — Errore nel recupero dei simboli.

---

## 7. Endpoint Allocation (`/api/asset-types`, `/api/allocation/*`)

Gestione dei target di allocazione per categoria di asset e dei suggerimenti di ribilanciamento. Le categorie target-abili sono quelle con `isTargetable: true` nel catalogo (`BOND`, `STOCK`, `CASH`, `FUND`, `COMMODITY`; `UNKNOWN` è escluso).

### 7.1 GET `/api/asset-types`

Restituisce il catalogo dei tipi di asset dalla tabella `asset_types`.

**Risposta 200 OK**

```json
{
  "assetTypes": [
    { "name": "BOND", "isTargetable": true },
    { "name": "CASH", "isTargetable": true },
    { "name": "COMMODITY", "isTargetable": true },
    { "name": "FUND", "isTargetable": true },
    { "name": "STOCK", "isTargetable": true },
    { "name": "UNKNOWN", "isTargetable": false }
  ]
}
```

**Errori:** `500` — Errore nel recupero dei tipi di asset.

---

### 7.2 GET `/api/allocation/current`

Calcola a runtime l'allocazione attuale del portafoglio per categoria. Base di calcolo: valore di mercato delle posizioni (con correzione BTP /100 e conversione EUR via ECB) **più** la liquidità disponibile, che viene attribuita alla categoria `CASH` — così il totale è coerente con il Valore Portafoglio della Dashboard.

**Risposta 200 OK**

```json
{
  "totalValue": 230758.56,
  "categories": [
    { "assetType": "BOND", "value": 51234.00, "percent": 22.20 },
    { "assetType": "CASH", "value": 256480.80, "percent": 111.15 }
  ],
  "unknownAssets": 3
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `totalValue` | number | Totale portafoglio (posizioni + liquidità) |
| `categories[].assetType` | string | Categoria di asset |
| `categories[].value` | number | Valore in EUR della categoria |
| `categories[].percent` | number | Peso percentuale sul totale (2 decimali) |
| `unknownAssets` | number | Numero di asset UNKNOWN con posizione attiva |

**Note:** Sono incluse solo le categorie con valore > 0. Gli asset in valuta estera senza tasso ECB disponibile sono esclusi dal totale.

**Errori:** `500` — Errore nel calcolo dell'allocazione attuale.

---

### 7.3 GET `/api/allocation/target`

Restituisce il target di allocazione configurato dall'utente.

**Risposta 200 OK**

```json
{
  "tolerance": 5.0,
  "targets": [
    { "assetType": "BOND", "targetPercent": 30 },
    { "assetType": "STOCK", "targetPercent": 70 }
  ]
}
```

Se nessun target è stato configurato, `targets` è vuoto e `tolerance` vale il default `5.0`.

**Errori:** `500` — Errore nel recupero del target.

---

### 7.4 PUT `/api/allocation/target`

Salva il target di allocazione (sostituisce integralmente i target esistenti, in transazione).

**Body della Richiesta**

```json
{
  "tolerance": 5.0,
  "targets": [
    { "assetType": "BOND", "targetPercent": 30 },
    { "assetType": "STOCK", "targetPercent": 70 }
  ]
}
```

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `tolerance` | number | Sì | Soglia di tolleranza globale (> 0) |
| `targets` | array | Sì | Lista non vuota di target per categoria |

**Validazioni (400):**
- `tolerance` deve essere un numero > 0
- `targets` deve essere un array non vuoto
- ogni `assetType` deve essere target-abile (non `UNKNOWN`)
- ogni `targetPercent` deve essere un numero ≥ 0
- la somma dei `targetPercent` deve essere 100% (tolleranza 0.001)

**Risposta 200 OK**: stesso formato di `GET /api/allocation/target` (target salvato).

**Errori:** `400` — Validazione fallita · `500` — Errore nel salvataggio.

---

### 7.5 GET `/api/allocation/rebalance`

Restituisce le divergenze tra allocazione attuale e target per tutte le categorie target-abili, più i suggerimenti di ribilanciamento (solo quando la deviazione supera la tolleranza).

**Risposta 200 OK**

```json
{
  "tolerance": 5.0,
  "divergences": [
    {
      "assetType": "BOND",
      "currentPercent": 22.20,
      "targetPercent": 30.00,
      "divergencePercent": -7.80,
      "divergenceAmount": -17999.17
    }
  ],
  "suggestions": [
    {
      "assetType": "BOND",
      "action": "BUY",
      "amount": 17999.17,
      "divergencePercent": -7.80
    }
  ]
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `divergences[].divergencePercent` | number | `currentPercent − targetPercent` |
| `divergences[].divergenceAmount` | number | Divergenza percentuale applicata al totale |
| `suggestions[].action` | string | `BUY` (sotto-target) o `SELL` (sopra-target) |
| `suggestions[].amount` | number | Importo assoluto per riallinearsi al target |

**Errori:** `500` — Errore nel calcolo del ribilanciamento.

---

## 8. Endpoint Orders (`/api/orders`)

Gestione degli ordini di mercato (MarketOrder). Endpoint dedicato che espone i dati della tabella `market_orders` con JOIN su `assets` per ottenere ticker e nome dell'asset.

### 8.1 GET `/api/orders`

Restituisce la lista degli ordini di mercato (BUY/SELL) con filtri e ordinamento.

**Query Parameters**

| Parametro | Tipo | Default | Descrizione |
|---|---|---|---|
| `sortBy` | string | `operation_date` | Colonna per ordinamento |
| `sortOrder` | string | `desc` | `asc` o `desc` |
| `startDate` | string | — | Filtro data inizio (`YYYY-MM-DD`) |
| `endDate` | string | — | Filtro data fine (`YYYY-MM-DD`) |
| `type` | string | — | Filtro per tipo ordine (`BUY` / `SELL`) |
| `symbol` | string | — | Filtro per ticker dell'asset |
| `search` | string | — | Ricerca testuale su nome, ticker o riferimento ordine |

**Colonne ordinabili (`sortBy`):** `operation_date`, `value_date`, `type`, `quantity`, `euro_amount`, `currency`, `ticker`, `asset_name`, `order_reference`

**Esempio di Richiesta**

```
GET /api/orders?type=BUY&startDate=2025-01-01&symbol=X.SXRS&sortBy=operation_date&sortOrder=desc
```

**Risposta 200 OK**

```json
{
  "data": [
    {
      "id": "uuid",
      "operation_date": "2025-06-15",
      "value_date": "2025-06-17",
      "type": "BUY",
      "quantity": 100,
      "euro_amount": -1150.00,
      "currency_amount": null,
      "currency": "EUR",
      "order_reference": "123456",
      "asset_id": "uuid",
      "isin": "IE00BDFL4P12",
      "ticker": "X.SXRS",
      "asset_name": "ISHARES DIV COMM SWAP ETF"
    }
  ],
  "total": 188
}
```

| Campo | Tipo | Descrizione |
|---|---|---|
| `data[].id` | string | ID dell'ordine |
| `data[].operation_date` | string | Data operazione |
| `data[].value_date` | string | Data valuta |
| `data[].type` | string | `BUY` (acquisto) o `SELL` (vendita) |
| `data[].quantity` | number | Numero di quote/azioni |
| `data[].euro_amount` | number | Importo netto in euro (negativo per BUY, positivo per SELL) |
| `data[].currency_amount` | number \| null | Importo nella valuta originale dell'asset |
| `data[].currency` | string | Valuta della transazione |
| `data[].order_reference` | string | Riferimento ordine Directa |
| `data[].asset_id` | string \| null | ID dell'asset |
| `data[].isin` | string \| null | ISIN dell'asset |
| `data[].ticker` | string \| null | Ticker dell'asset |
| `data[].asset_name` | string \| null | Nome dell'asset |
| `total` | number | Conteggio totale degli ordini (senza paginazione) |

**Note:**
- La whitelist delle colonne ordinabili previene SQL injection.
- La ricerca (`search`) usa `LIKE` su `a.name`, `a.ticker` e `mo.order_reference`.
- I filtri `startDate`/`endDate` si applicano su `operation_date`.

**Errori:** `500` — Errore nel recupero degli ordini.

---

### 8.2 GET `/api/orders/symbols`

Restituisce la lista dei ticker distinti presenti nei `market_orders`, utile per popolare il dropdown filtro "Simbolo" nella pagina Ordini.

**Risposta 200 OK**

```json
["ENI", "X.SXRS", "VWCE"]
```

**Note:** Restituisce un array di stringhe (ticker), ordinati alfabeticamente. Sono esclusi i ticker null o vuoti.

**Errori:** `500` — Errore nel recupero dei simboli.

---

### 8.3 DELETE `/api/orders/:id`

Elimina un singolo ordine di mercato per ID. Invalida automaticamente la cache analytics perché gli ordini influenzano quantità nette e prezzo medio di carico (PMA).

**Parametri Path**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `id` | string | ID dell'ordine (UUID) |

**Risposta 200 OK**

```json
{
  "success": true,
  "deletedId": "uuid"
}
```

**Errori:**
- `400` — ID ordine mancante o non valido (`{ "error": "ID ordine mancante o non valido" }`)
- `404` — Ordine non trovato (`{ "error": "Ordine non trovato" }`)
- `500` — Errore nell'eliminazione dell'ordine

---

## 9. Codici di Errore

| Codice | Significato | Formato Risposta |
|---|---|---|
| `200` | Successo | Dati richiesti |
| `400` | Richiesta non valida (parametri mancanti o non validi) | `{ "error": "...", "details": "..." }` |
| `401` | Autenticazione richiesta o token non valido | `{ "error": "Autenticazione richiesta" }` |
| `404` | Risorsa non trovata | `{ "error": "Asset non trovato" }` |
| `429` | Troppe richieste (rate limit su `/api/auth/check`) | `{ "error": "Troppi tentativi di accesso..." }` |
| `500` | Errore interno del server | `{ "error": "...", "details": "..." }` |

### Esempi di Errori

**400 — Tipo non valido (PATCH asset type)**

```json
{
  "error": "Tipo non valido. Valori accettati: BOND, STOCK, CASH, FUND, COMMODITY, UNKNOWN"
}
```

**400 — Conferma mancante (DELETE clear)**

```json
{
  "error": "Conferma richiesta",
  "details": "Per cancellare tutti i dati inviare { \"confirm\": true }"
}
```

**404 — Asset non trovato**

```json
{
  "error": "Asset non trovato"
}
```

**404 — Ordine non trovato**

```json
{
  "error": "Ordine non trovato"
}
```

**400 — Risk-free rate non valido (endpoint performance)**

```json
{
  "error": "Invalid risk-free rate"
}
```

**500 — Errore interno**

```json
{
  "error": "Errore interno del server"
}
```

> **Nota:** l'error handler centralizzato (`middleware/errorHandler.js`) restituisce sempre un messaggio generico senza dettagli interni (no stack trace al client); i dettagli completi vengono loggati solo lato server. Le rotte API sconosciute ricevono `404 { "error": "Endpoint non trovato" }` invece del fallback SPA.

---

## 10. Esempi di Utilizzo (cURL)

> **Nota:** Tutti gli endpoint richiedono l'header `Authorization: Bearer <token>`.
> Sostituisci `<token>` con il token API generato all'avvio del server.

### Verifica Token

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/auth/check
```

### Dashboard

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/analytics/dashboard
```

### Portafoglio

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/analytics/portfolio
```

### Allocazione

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/analytics/allocation
```

### Storico

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/analytics/history
```

### TWR

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/analytics/twr
```

### Dettaglio Asset

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/analytics/asset/<asset_id>
```

### Lista Asset

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/assets
```

### Asset per ISIN

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/assets/by-isin/IE00BDFL4P12
```

### Classificazione Manuale Asset

```bash
curl -X PATCH http://localhost:3000/api/assets/<asset_id>/type \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"assetType": "BOND"}'
```

### Import CSV

```bash
curl -X POST http://localhost:3000/api/import \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"fileContent": "CSV text...", "filename": "Movimenti.csv"}'
```

### Sessioni di Import

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/import/sessions
```

### Svuota Database

```bash
curl -X DELETE http://localhost:3000/api/import/clear \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

### Movimenti con Filtri

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/movements?type=DIVIDEND&startDate=2025-01-01&sortBy=euro_amount&sortOrder=desc"
```

### Simboli Movimenti

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/movements/symbols
```

### Catalogo Asset Types

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/asset-types
```

### Allocazione Attuale

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/allocation/current
```

### Salva Target di Allocazione

```bash
curl -X PUT http://localhost:3000/api/allocation/target \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"tolerance": 5.0, "targets": [{"assetType": "BOND", "targetPercent": 30}, {"assetType": "STOCK", "targetPercent": 70}]}'
```

### Suggerimenti di Ribilanciamento

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/allocation/rebalance
```

### Volatilità

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/analytics/volatility
```

### Sharpe Ratio

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/analytics/sharpe?riskFreeRate=2.5"
```

### Performance & Risk (aggregato)

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/analytics/performance?riskFreeRate=2.2"
```

### Lista Ordini con Filtri

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/orders?type=BUY&startDate=2025-01-01&sortBy=euro_amount&sortOrder=desc"
```

### Simboli Ordini

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/orders/symbols
```

### Elimina Ordine

```bash
curl -X DELETE http://localhost:3000/api/orders/<order_id> \
  -H "Authorization: Bearer <token>"
```

---

**End of Document**
