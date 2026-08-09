# 📊 Portfolio Insights

> Applicazione web self-hostable per l'analisi avanzata del portafoglio di investimenti Directa.

Portfolio Insights è un'applicazione web **self-hostable** che analizza un portafoglio di investimenti esportato dal broker **Directa**. Si concentra su investimenti a lungo termine (ETF, ETC, ETN, Azioni, Obbligazioni) e fornisce analisi avanzate sulla composizione del portafoglio, l'evoluzione storica e le performance di investimento.

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
- **Gain/Loss**: calcolato per ogni posizione (€ e %)
- **Classificazione manuale**: dropdown per assegnare il tipo di asset (ETF, BOND, STOCK, ecc.)
- **Tabella riepilogativa Asset Class**: totali per categoria con Gain/Loss aggregato

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
- **Zero dipendenze cloud**: funziona offline dopo l'import
- **Design responsivo**: sidebar collassabile, menu mobile

---

## 🚀 Guida Rapida

### Prerequisiti
- **Node.js 22+** (consigliato: via [fnm](https://github.com/Schniz/fnm))
- **Git**

### Installazione

```bash
# Clona il repository
git clone https://github.com/massimobottelli/Portfolio-Insights.git
cd Portfolio-Insights

# Installa le dipendenze
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
# Avvia con hot-reload (node --watch)
npm run dev
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
- **Movimenti**: analizza i flussi di cassa con i filtri

---

## 🏗️ Architettura

```
portfolio-insights/
├── config/                  # Configurazioni condivise (asset types)
├── models/                  # Accesso ai dati (SQLite nativo)
├── controllers/             # Logica applicativa
├── routes/                  # Endpoint Express
├── utils/                   # Utility (parser CSV)
├── client/                  # Frontend React (TypeScript)
│   └── src/
│       ├── components/      # Componenti riutilizzabili
│       └── pages/           # Pagine dell'applicazione
├── public/                  # Build statica del frontend
├── db/                      # Database SQLite (generato)
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

Il database SQLite memorizza solo **fatti finanziari immutabili** importati da Directa:

| Tabella | Contenuto |
|---|---|
| `assets` | Identità degli strumenti finanziari (ISIN, ticker, nome) |
| `market_orders` | Ordini di acquisto/vendita |
| `cash_movements` | Movimenti di cassa (commissioni, dividendi, tasse, ecc.) |
| `daily_portfolio_snapshots` | Snapshot giornalieri del valore del portafoglio |
| `asset_prices` | Prezzi correnti e medi di carico |
| `import_sessions` | Tracciamento delle importazioni |

Tutti i calcoli analitici (posizioni, allocazione, performance, TWR) sono generati **a runtime** e mai persistiti.

---

## 🧮 Metriche Supportate

- **Valore Portafoglio**: dall'ultimo snapshot Directa
- **Capitale Investito**: somma di tutti i conferimenti (DEPOSIT)
- **Liquidità**: saldo cassa dall'ultimo snapshot
- **Profit & Loss**: valore portafoglio - capitale investito (€ e %)
- **TWR** (Time-Weighted Rate of Return): rendimento composto geometrico, con YTD e annuali
- **Allocazione**: peso percentuale di ogni asset sul totale
- **Gain/Loss per posizione**: (prezzo corrente - prezzo medio) × quantità

---

## 🗺️ Roadmap

- [x] MVP1 — Dashboard, Portfolio, Movimenti, Import
- [ ] MVP2

---


## 👤 Autore

**Massimo Bottelli** — [GitHub](https://github.com/massimobottelli)

---