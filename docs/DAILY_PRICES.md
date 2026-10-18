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

La chiave va in `.env` (git-ignored, copia da `.env.example`): `npm start`,
`npm run dev` e `npm run prices:update` la caricano automaticamente —
niente chiavi inline nei comandi.

```bash
cp .env.example .env   # poi edita la riga EODHD_API_KEY
```

```ini
EODHD_API_KEY=<la-tua-chiave>
```

Alternativa classica: `export EODHD_API_KEY="<la-tua-chiave>"` prima
dell'avvio (le variabili della shell hanno la precedenza sul file `.env`).

- Letta **solo** lato server/CLI da `process.env` (mai nel frontend, mai loggata,
  mai inclusa negli URL stampati o nei messaggi di errore).
- Se manca, l'aggiornamento incrementale termina con un messaggio esplicativo
  (l'endpoint risponde **503** e il frontend mostra il banner con le istruzioni,
  lo script CLI esce con codice 2).
- Il nome della variabile è documentato in `.env.example` (senza segreti).

## Mappa simboli EODHD

La corrispondenza strumento ↔ simbolo EODHD (`TICKER.EXCHANGE`, es. `SXRS.XETRA`).
Suffissi exchange su EODHD: `.XETRA` (XETRA — **non** `.DE`, che risponde 404),
`.PA` (Euronext Parigi), `.LSE` (London SE), `.US` (NYSE/Nasdaq).
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
npm run prices:update                        # tutti gli asset (chiave da .env)
npm run prices:update -- --dry-run           # senza scritture
npm run prices:update -- --symbol SXRS.XETRA    # solo un simbolo

# Alternativa senza .env (chiave inline):
EODHD_API_KEY="<chiave>" node scripts/update-daily-closing-prices.js
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
    { "symbol": "SXRS.XETRA", "asset": { "isin": "IE00BDFL4P12", "...": "..." },
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
- **Partenza dal primo ordine**: la serie è limitata al periodo di detenzione —
  il grafico mostra solo le quotazioni successive (incluse) alla data del primo
  ordine dell'asset, presa dal campo `orders[]` del dettaglio già caricato
  (min esplicito sulle date, robusto all'ordinamento). Le quotazioni precedenti
  all'investimento non sono mostrate nemmeno con range `All`. Se l'asset non
  ha ordini (es. posizione senza movimenti importati) viene mostrata l'intera
  serie disponibile; se il filtro esclude tutti i punti, il grafico non viene
  renderizzato.
- **Variazione di periodo**: per range ≠ `All` è mostrata la variazione
  percentuale tra primo e ultimo punto del periodo selezionato.
- **Formattazione prezzi**: `formatPrice` (2 decimali sopra 10, 4 sotto),
  coerente con il resto della pagina.

## Aggiornamento automatico on-demand (alla visita della pagina)

All'apertura della pagina di dettaglio, il frontend verifica con il campo
`isCurrent` del GET (sezione precedente) se l'ultima quotazione in DB è
aggiornata a oggi:

1. **Quotazione aggiornata** (`isCurrent: true`) → il grafico viene mostrato
   subito, senza chiamate esterne.
2. **Quotazione stantia** (`isCurrent: false` **con** storico locale) →
   chiamata automatica a `POST /api/prices/asset/:assetId/refresh`, che
   scarica da EODHD dall'ultima data in DB (overlap 5 giorni) fino a oggi e
   applica l'upsert; a refresh concluso la serie viene ricaricata e il
   grafico mostrato.
3. **Nessuno storico locale** (`count: 0`, es. BTP/cash o asset senza CSV
   importato) → il grafico non viene renderizzato e NESSUNA chiamata EODHD
   viene fatta: il backfill storico resta un'operazione manuale via CSV.

Messaggi a video durante l'aggiornamento:

- Indicatore **"Aggiornamento quotazioni da EODHD…"** nell'header del box
  mentre il refresh è in corso.
- **Esiti silenziosi** (nessun messaggio di errore, serie ricaricata dal DB):
  `updated`, `already_current`, `no_new_data` (es. festività o borsa chiusa),
  `skipped` (asset non aggiornabile, es. BOND).
- **Banner di errore ambra con bottone "Riprova"** sopra il grafico in caso di
  fallimento del provider o di configurazione:
  - `503` (chiave mancante) → *"Servizio prezzi EODHD non configurato:
    impostare `EODHD_API_KEY` sul server."*
  - errore del provider (`failed`) → messaggio specifico restituito dal
    backend (es. *"EODHD: autenticazione fallita (HTTP 401)… verifica la chiave"*).
  - `429` (rate limit) → *"Troppe richieste di aggiornamento. Riprova tra un
    minuto."*
  - errore di rete → *"Errore di rete durante l'aggiornamento dei prezzi."*

In caso di errore **il grafico resta visibile con gli ultimi dati disponibili**:
la funzionalità è non critica e non blocca il resto della pagina.

## Limiti e comportamenti noti

- Asset senza storico locale (es. `DBMFE.PA`, finché non viene importato un CSV)
  restano `no_local_history` fino al primo import manuale: nessun download
  automatico di anni di dati.
- Nel weekend/festività la quotazione "attesa" è quella di venerdì: il refresh
  può essere invocato e ricevere `no_new_data` (nessuna scrittura, nessun errore).
- **Copertura del piano EODHD**: EODHD risponde **HTTP 404** sia per simboli
  inesistenti sia per exchange **non inclusi nel piano API attivo** (es. il
  piano gratuito copre solo il mercato US). In quel caso il frontend mostra il
  banner con il messaggio del provider, che invita a verificare il simbolo o
  la copertura degli exchange nell'abbonamento. Il file `config/eodhdSymbols.js`
  riporta i simboli corretti: se la copertura del piano cambia, nessuna
  modifica al codice è necessaria.
- Le quotazioni sono quelle del mercato specifico del simbolo mappato: valute
  diverse per lo stesso strumento su borse diverse non vengono convertite.
- Nessuna rettifica per dividendi/split (`close` non adjustato, per design).
- L'aggiornamento dei prezzi avviene (a) **automaticamente per il singolo
  asset** alla visita della pagina di dettaglio con dati stantii, e (b)
  **manualmente in batch** per tutti gli asset (API `POST /api/prices/update`
  o script CLI). Non esiste alcuno scheduler/job automatico.
- I test automatici non chiamano mai la rete (fetch mockato).
