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
| `/api/assets` | `assetRoutes.js` | Gestione strumenti finanziari |
| `/api/import` | `importRoutes.js` | Importazione CSV e sessioni |
| `/api/movements` | `movementRoutes.js` | Movimenti di cassa |

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
| `positions[].asset_type` | string | Tipo di asset (ETF, BOND, UNKNOWN, ...) |
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

Restituisce i tassi di cambio odierni usati para la conversión en EUR. Fuente: ECB Data Portal (SDMX 2.1 API).

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
- Se ECB non risponde y no hay caché, la valuta es omessa dalla mappa.

**Errori:** `500` — Errore nel recupero dei tassi de cambio.

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
  "assetType": "ETF"
}
```

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `assetType` | string | Sì | Nuovo tipo di asset (case-insensitive) |

**Valori accettati:** `ETF`, `ETC`, `ETN`, `STOCK`, `BOND`, `FUND`, `COMMODITY`, `CASH`, `UNKNOWN`

**Risposta 200 OK**

```json
{
  "id": "uuid",
  "isin": "IE00BDFL4P12",
  "ticker": "X.SXRS",
  "name": "ISHARES DIV COMM SWAP ETF",
  "currency": "EUR",
  "asset_type": "ETF",
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

## 7. Codici di Errore

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
  "error": "Tipo non valido. Valori accettati: ETF, ETC, ETN, STOCK, BOND, FUND, COMMODITY, CASH, UNKNOWN"
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

**500 — Errore interno**

```json
{
  "error": "Errore nel calcolo dei KPI",
  "details": "Messaggio di errore dettagliato"
}
```

---

## 8. Esempi di Utilizzo (cURL)

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
  -d '{"assetType": "ETF"}'
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

---

**End of Document**