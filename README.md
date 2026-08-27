# 📊 Portfolio Insights

> Applicazione web self-hostable per l'analisi avanzata del portafoglio di investimenti Directa.

Portfolio Insights è un'applicazione web **self-hostable** che analizza un portafoglio di investimenti esportato dal broker **Directa**. Si concentra su investimenti a lungo termine (Obbligazioni, Azioni, Fondi, Commodities) e fornisce analisi avanzate sulla composizione del portafoglio, l'evoluzione storica, le performance di investimento e il profilo di rischio.

---

## ✨ Funzionalità

### 📈 Dashboard
- **KPI principali**: Valore portafoglio, Capitale investito, Liquidità, Profit & Loss
- **TWR** (Time-Weighted Rate of Return): calcolo con sottoperiodi delimitati dai depositi
- **Grafico storico**: evoluzione del portafoglio con filtri temporali (1M, 3M, 6M, 1Y, YTD, All)
- **Allocazione**: grafico a torta interattivo con legenda e colori per tipologia di asset

### 💼 Portafoglio
- **Tabella posizioni**: dettaglio di tutti gli strumenti con ordinamento per qualsiasi colonna
- **Prezzi correnti e medi**: importati automaticamente dal report Directa P_TOTALE
- **Gain/Loss**: calcolato per ogni posizione (€ e %), con link alla scheda di dettaglio asset
- **Classificazione manuale**: dropdown per assegnare il tipo di asset (BOND, STOCK, FUND, COMMODITY, CASH)
- **Tabella riepilogativa Asset Class**: totali per categoria con Gain/Loss aggregato

### 🎯 Allocazione
- **Editor target**: percentuali obiettivo per categoria di asset + soglia di tolleranza globale
- **Grafico a torta in tempo reale**: anteprima dell'allocazione durante la configurazione
- **Tabella attuale vs target**: deviazioni percentuali ed economiche per categoria
- **Suggerimenti di ribilanciamento**: COMPRA/VENDI quando la deviazione supera la tolleranza
- **Validazione**: somma dei target deve essere 100%, solo categorie target-abili

### 📊 Performance & Risk
- **KPI**: rendimento cumulativo TWR, CAGR, best/worst mese e anno
- **Rendimenti mensili**: grafico a barre + heatmap anno × mese con tooltip
- **Statistiche periodi**: mesi/anni positivi, negativi e flat con tassi
- **Metriche di rischio**: volatilità giornaliera e annualizzata (√365), Sharpe ratio con **risk-free rate configurabile dall'utente**
- **Analisi drawdown**: maximum drawdown, peak/trough/recovery, durata e tempo di recupero, grafico della curva di drawdown
- Le metriche sono calcolate sull'intero periodo di investimento dalla **canonical return series** (serie unica di rendimenti giornalieri condivisa da tutte le metriche)

### 💳 Movimenti
- **Elenco completo**: tutti i movimenti di cassa (commissioni, dividendi, bolli, tasse, conferimenti)
- **Filtri avanzati**: intervallo date, tipo movimento, simbolo, ricerca testuale
- **Ordinamento**: cliccabile su ogni colonna
- **Legenda tipologie**: descrizione estesa per ogni tipo di movimento

### 📥 Importazione
- **3 report supportati**: Movimenti, Patrimonio Totale, Portafoglio Corrente
- **Parsing CSV nativo**: senza librerie esterne
- **Idempotenza**: re-import sicuro senza duplicati
- **Filtro incrementale**: importa solo i movimenti successivi all'ultima data presente
- **Storico import**: tracciamento di tutte le sessioni di importazione
- **Cancellazione database**: funzione di reset con conferma

### ⚙️ Tecnologia
- **Backend**: Node.js + Express + SQLite nativo (Node 22+)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Recharts
- **Testing**: Vitest (test unit e integration sulle formule finanziarie)
- **Zero dipendenze cloud**: funziona offline dopo l'import (tranne i tassi di cambio ECB)
- **Design responsivo**: sidebar collassabile, menu mobile

---

## 🚀 Guida Rapida

### Prerequisiti
- **Node.js 22+** (consigliato: via [fnm](https://github.com/Schniz/fnm))
- **Git**

### Installazione

```bash
# Clona il repository
git clone https://github.com/massimobottelli/portfolio-insights.git
cd portfolio-insights

# Installa le dipendenze backend
npm install

# Build del frontend React
cd client
npm install
npm run build
cd ..

# Avvia il server
npm start
```

L'applicazione sarà disponibile su **http://localhost:3000**.

### Sviluppo

```bash
# Avvia il backend con hot-reload (node --watch)
npm run dev

# Esegui i test (Vitest)
npm test            # modalità watch
npm run test:run    # esecuzione singola

# Typecheck del frontend TypeScript
npm run typecheck

# Build del frontend
npm run build:all
```

---

## 📖 Come Usare Portfolio Insights

### 1. Scarica i report da Directa

Accedi all'area personale Directa e scarica i seguenti report in formato CSV:

| Report | Percorso Directa | Nome file tipico |
|---|---|---|
| **Movimenti** | Conto → Movimenti | `Movimenti_*.csv` |
| **Patrimonio Totale** | Conto → Patrimonio → Rendimento | `PatrimonioTotale_*.csv` |
| **Portafoglio Corrente** | Investimenti | `P_TOTALE_*.csv` |

### 2. Importa i file

1. Vai su **Import** nell'applicazione
2. Carica i file CSV uno alla volta (trascina o clicca per selezionare)
3. L'ordine consigliato: prima **Movimenti**, poi **Patrimonio Totale**, infine **Portafoglio Corrente**

### 3. Esplora i dati

- **Dashboard**: panoramica con KPI e grafico storico
- **Portfolio**: dettaglio delle posizioni, classifica gli asset manualmente
- **Allocazione**: definisci i target per categoria e verifica le divergenze
- **Performance**: analizza rendimento, rischio e drawdown
- **Movimenti**: analizza i flussi di cassa con i filtri

---

## 🏗️ Architettura

```
portfolio-insights/
├── config/                  # Configurazioni condivise (asset types, auth token)
├── models/                  # Accesso ai dati (SQLite nativo) + calcoli analytics
│   └── __tests__/           # Test Vitest (performance & risk)
├── controllers/             # Logica applicativa
├── routes/                  # Endpoint Express
├── middleware/              # Auth, rate limiting, error handling, security headers
├── utils/                   # Utility (parser CSV, tassi ECB, helper dominio)
├── client/                  # Frontend React (TypeScript)
│   └── src/
│       ├── components/      # Componenti riutilizzabili (+ components/performance/)
│       ├── hooks/           # Hook React (useIsMobile)
│       ├── lib/             # Helper API, formattazione, filtri temporali
│       └── pages/           # Pagine dell'applicazione
├── public/                  # Build statica del frontend
├── db/                      # Database SQLite (generato)
├── scripts/                 # Script di build/installazione/diagnostica
├── database.js              # Inizializzazione DB
├── app.js                   # Configurazione Express
└── server.js                # Entry point server
```

### Pattern MVC

```
[React Frontend]  ←→  [Express Router]  ←→  [Controllers]  ←→  [Models / SQLite]
```

- **Model**: query SQL dirette con `node:sqlite`
- **View**: React + TypeScript
- **Controller**: logica di business pura
- **Route**: mapping endpoint → controller

---

## 📊 Database

Il database SQLite memorizza solo **fatti finanziari immutabili** importati da Directa (più due tabelle di configurazione):

| Tabella | Contenuto |
|---|---|
| `assets` | Identità degli strumenti finanziari (ISIN, ticker, nome) |
| `market_orders` | Ordini di acquisto/vendita |
| `cash_movements` | Movimenti di cassa (commissioni, dividendi, tasse, ecc.) |
| `daily_portfolio_snapshots` | Snapshot giornalieri del valore del portafoglio |
| `asset_prices` | Prezzi correnti e medi di carico |
| `import_sessions` | Tracciamento delle importazioni |
| `asset_types` | Catalogo dei tipi di asset (con flag target-abile) |
| `allocation_targets` | Target di allocazione configurati dall'utente |

Tutti i calcoli analitici (posizioni, allocazione, performance, rischio, TWR) sono generati **a runtime** e mai persistiti.

---

## 🧮 Metriche Supportate

- **Valore Portafoglio**: dall'ultimo snapshot Directa
- **Capitale Investito**: somma di tutti i conferimenti (DEPOSIT)
- **Liquidità**: saldo cassa dall'ultimo snapshot
- **Profit & Loss**: valore portafoglio - capitale investito (€ e %)
- **TWR** (Time-Weighted Rate of Return): rendimento composto geometrico, con YTD e annuali
- **Allocazione**: peso percentuale di ogni asset sul totale
- **Gain/Loss per posizione**: (prezzo corrente - prezzo medio) × quantità
- **Canonical Return Series**: serie giornaliera di rendimenti corretta per i flussi esterni (depositi/prelievi), base unica per tutte le metriche di performance
- **CAGR**: tasso di crescita annuo composto dal TWR cumulativo
- **Volatilità**: deviazione standard dei rendimenti giornalieri, annualizzata con √365
- **Sharpe Ratio**: rendimento in eccesso sul risk-free rate (configurabile) / volatilità
- **Maximum Drawdown**: perdita massima dal picco, con peak/trough/recovery e tempi
- **Rendimenti mensili e annuali**: aggregati per compounding (non somma aritmetica)

---

## 🗺️ Roadmap

- [x] MVP1 — Dashboard, Portfolio, Movements, Import
- [x] MVP2 — Asset Detail, Allocazione & Ribilanciamento, Performance & Risk

---


## 👤 Autore

**Massimo Bottelli** — [GitHub](https://github.com/massimobottelli)

---
