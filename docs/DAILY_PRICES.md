# 💰 Prezzi di chiusura giornalieri (EODHD)

Storico e aggiornamento dei prezzi di chiusura giornalieri degli strumenti
quotati del portafoglio, tramite **EODHD** come provider per gli aggiornamenti
incrementali. L'app è locale, mono-utente e non commerciale (~20 strumenti).

## Che cosa viene conservato

Esclusivamente **strumento, data, prezzo di chiusura**:

| Tabella | Contenuto |
|---|---|
| `daily_asset_closing_prices` | `asset_id` (FK → assets), `price_date` (ISO `YYYY-MM-DD`), `close_price`. UNIQUE su `(asset_id, price_date)` |

Non vengono scaricati né memorizzati OHLC, volume, dividendi, split o altre
corporate action. Non viene usato `adjusted_close`: nessuna rettifica.
La tabella è **separata** da `asset_prices`, che resta la tabella dei prezzi
"istantanei" importati dal report P_TOTALE Directa.

## Configurazione

```
EODHD_API_KEY=<la-tua-chiave>
```

- Letta **solo** lato server/CLI da `process.env` (mai nel frontend, mai loggata,
  mai inclusa negli URL stampati o nei messaggi di errore).
- Se manca, l'aggiornamento incrementale termina con un messaggio esplicativo
  (l'endpoint risponde **503**, lo script CLI esce con codice 2).
- Il nome della variabile è documentato in `.env.example` (senza segreti).

## Mappa simboli EODHD

La corrispondenza strumento ↔ simbolo EODHD (`TICKER.EXCHANGE`, es. `SXRS.DE`)
vive in `config/eodhdSymbols.js` (chiave: ISIN). All'avvio del server un
backfill idempotente popola `assets.exchange` con il simbolo confermato —
senza sovrascrivere valori esistenti. L'aggiornamento interroga EODHD con
`assets.exchange`, con fallback al `ticker` Directa se vuoto.

## Import iniziale one-time da CSV (front-loading)

```bash
# Anteprima senza scritture
node scripts/import-daily-closing-prices.js --dry-run --symbol SXRS.DE docs/storico-quotazioni/sxrs_de_d.csv

# Import reale
node scripts/import-daily-closing-prices.js --symbol SXRS.DE docs/storico-quotazioni/sxrs_de_d.csv

# Più file in un colpo (stesso simbolo) o risoluzione via ISIN
node scripts/import-daily-closing-prices.js --symbol VUAA.DE docs/storico-quotazioni/vuaa_de_d.csv
node scripts/import-daily-closing-prices.js --isin IE00BDFL4P12 docs/storico-quotazioni/sxrs_de_d.csv
```

- **Formati accettati** (header obbligatorio, delimitatore `,`, date ISO, decimali con punto):
  - Export EODHD: `Date,Open,High,Low,Close,Volume` → estratti **solo** `Date` e `Close`
  - Canonico: `symbol,date,close` → raggruppato per simbolo
- Il simbolo viene risolto in un asset esistente (exchange → ISIN da mappa → ticker):
  simboli ambigui o sconosciuti → righe scartate con diagnostico; **mai** creazione automatica di asset.
- Upsert idempotente: re-importare lo stesso file non duplica nulla.
- Exit codes: `0` ok · `1` completato con warning · `2` fatale.

## Aggiornamento incrementale

**Endpoint interno** (protetto dal token API, con rate limit 6/minuto):

```bash
curl -X POST -H "Authorization: Bearer <API_TOKEN>" http://localhost:3000/api/prices/update
```

**CLI equivalente:**

```bash
EODHD_API_KEY="<chiave>" node scripts/update-daily-closing-prices.js              # tutti gli asset
EODHD_API_KEY="<chiave>" node scripts/update-daily-closing-prices.js --dry-run    # senza scritture
EODHD_API_KEY="<chiave>" node scripts/update-daily-closing-prices.js --symbol SXRS.DE
```

Comportamento a ogni chiamata:

1. **Elegibilità**: posizioni attive (quantità netta > 0) di tutti i tipi
   **tranne BOND**; gli asset senza simbolo vengono segnalati e saltati.
2. Per ogni asset: se **non esiste storico locale** → skip `no_local_history`
   (il backfill storico avviene solo via CSV; nessun download automatico di anni di dati).
3. Se l'ultima quotazione è **già di oggi** → skip `already_current`.
4. Altrimenti: richiesta EODHD su `[ultima data − 5 giorni, oggi]` (overlap per
   correggere in modo idempotente l'ultima osservazione), con `assets.exchange`.
5. **Upsert** in transazione: mai duplicati; i giorni di chiusura della borsa non
   vengono sintetizzati; il prezzo di oggi è salvato solo se EODHD lo restituisce.
6. **Isolamento errori**: un simbolo fallito (HTTP, JSON, rete, timeout 15s)
   non blocca gli altri; risposta vuota dal provider = skip, non errore.

Risposta (esempio):

```json
{
  "ok": true,
  "runDate": "2026-10-18",
  "candidates": 12,
  "eligible": 8,
  "updatedAssets": 7,
  "skipped": 1,
  "failed": 0,
  "rows": { "inserted": 5, "updated": 0, "unchanged": 155 },
  "details": [
    { "symbol": "SXRS.DE", "asset": { "isin": "IE00BDFL4P12", "...": "..." },
      "status": "updated", "from": "2026-10-11", "to": "2026-10-18",
      "inserted": 1, "updated": 0, "unchanged": 4 }
  ]
}
```

`ok` è `false` se almeno un asset è in errore (nessun falso successo).

## Visualizzazione frontend — grafico "Storico Quotazioni"

La pagina di dettaglio asset (`client/src/pages/AssetDetail.tsx`) mostra un
grafico dell'andamento storico della quotazione, collocato tra la sezione KPI
(Prezzo attuale ... IRR) e la sezione "Cronologia Ordini".

Comportamento:

- **Dati**: `GET /api/prices/asset/:assetId` (sola lettura dal DB locale,
  nessuna quota EODHD consumata). Il fetch è indipendente dal caricamento del
  dettaglio asset e non blocca il resto della pagina.
- **Stile**: identico al grafico "Andamento Portafoglio" della Dashboard
  (recharts `AreaChart` con gradiente, griglia `#334155`, tooltip custom su
  fondo scuro, tipografia e colori slate/emerald).
- **Filtro temporale**: bottoni `1M/3M/6M/1Y/YTD/All` che usano lo stesso
  helper condiviso `getCutoffDate` di Dashboard e Performance.
- **Variazione di periodo**: per range ≠ `All` è mostrata la variazione
  percentuale tra primo e ultimo punto del periodo selezionato.
- **Formattazione prezzi**: `formatPrice` (2 decimali sopra 10, 4 sotto),
  coerente con il resto della pagina.
- **Asset senza storico**: per asset esclusi dalla collezione (BTP, cash) o
  senza CSV importato, il box non viene renderizzato — degradazione silenziosa,
  nessun errore visibile.

## Limiti e comportamenti noti

- Asset senza storico locale (es. `DBMFE.PA`, finché non viene importato un CSV)
  restano `no_local_history` fino al primo import manuale.
- Le quotazioni sono quelle del mercato specifico del simbolo mappato: valute
  diverse per lo stesso strumento su borse diverse non vengono convertite.
- Nessuna rettifica per dividendi/split (`close` non adjustato, per design).
- Nessun scheduler né job automatico: l'aggiornamento è manuale (API o CLI).
- I test automatici non chiamano mai la rete (fetch mockato).
