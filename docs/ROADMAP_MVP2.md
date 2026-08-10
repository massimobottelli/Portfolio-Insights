# 🗺️ MVP2 — Roadmap & Backlog

> Documento di pianificazione per la seconda release di Portfolio Insights.

---

## 1. Dettaglio Asset (già pianificato in DESIGN.md)

Pagina dedicata per ogni singolo strumento finanziario, raggiungibile cliccando su un asset nella tabella Portfolio.

### Funzionalità
- **Cronologia ordini**: lista completa degli ordini BUY/SELL per quell'asset
- **Dividend history**: storico dei dividendi incassati
- **Performance individuale**: P&L nel tempo per il singolo strumento
- **Confronto con benchmark**: overlay con indice di riferimento (es. MSCI World per ETF azionari)

### Impatto tecnico
- Nuova pagina React: `client/src/pages/AssetDetail.tsx`
- Nuovo endpoint API: `GET /api/analytics/asset/:id/history`
- Nuova rotta: `/asset/:isin` in `App.tsx`

---

## 2. Benchmark e Confronto Indici

Confronto automatico delle performance del portafoglio rispetto a indici globali di mercato.

### Funzionalità
- Download dati storici indici (MSCI World, FTSE MIB, S&P 500) da API esterna
- Grafico sovrapposto: portafoglio vs benchmark
- Metriche di rischio:
  - **Volatilità** (deviazione standard dei rendimenti)
  - **Sharpe Ratio** (rendimento corretto per il rischio)
  - **Max Drawdown** (massimo calo storico)
  - **Beta** (correlazione col mercato)
- Correlazione portafoglio vs benchmark

### Impatto tecnico
- Richiede connessione Internet per fetch dati indici
- Nuovo modulo: `services/benchmarkService.js`
- Nuovo endpoint: `GET /api/analytics/benchmark`
- Possibili fonti dati: Yahoo Finance API (gratuita), Alpha Vantage

### Considerazioni
- L'app perderebbe la capacità offline per questa feature
- Si potrebbe cacheare localmente i dati degli indici per minimizzare le richieste

---

## 3. Export Report Periodico (PDF/CSV)

Generazione di report scaricabili con riepilogo delle performance e dati fiscali.

### Funzionalità
- **Report mensile/trimestrale/annuale**: KPI, allocazione, performance
- **Riepilogo fiscale**:
  - Plusvalenze/minusvalenze realizzate (dalle vendite)
  - Dividendi incassati per anno
  - Commissioni pagate
  - Imposte (bollo, Tobin tax, ritenute)
- Formati: CSV (semplice) e PDF (con grafici)

### Impatto tecnico
- Backend: generazione lato server con libreria PDF (es. `pdfkit`)
- Frontend: pulsanti di download nelle pagine Dashboard e Portfolio
- Nuovo endpoint: `GET /api/report/periodic?type=monthly&format=csv`
- Nuovo controller: `controllers/reportController.js`

### Valore
- Altissimo per dichiarazione dei redditi (quadro RT, RW)
- Utile per tenere traccia dell'evoluzione del portafoglio

---

## 4. Obiettivi di Investimento

Definizione e tracciamento di obiettivi finanziari a lungo termine.

### Funzionalità
- Creazione obiettivi: nome, importo target, data target
- Calcolo del progresso: `(valore attuale / target) × 100`
- Proiezione: "al ritmo attuale, raggiungerai l'obiettivo il [data]"
- Montecarlo simulation: probabilità di raggiungimento basata su volatilità storica
- Grafico: valore attuale vs target vs proiezione

### Impatto tecnico
- Nuova tabella SQLite: `investment_goals`
- Nuovo model: `models/goalModel.js`
- Nuovo controller: `controllers/goalController.js`
- Nuova pagina React: `client/src/pages/Goals.tsx`
- Nuova voce nella sidebar

### UX
- Semplice: "Quanto vuoi avere e quando?"
- L'app calcola il resto automaticamente

---

## 5. Import Altri Broker

Supporto per l'importazione di report da altri broker italiani ed europei.

### Approccio Consigliato: Importer Dedicati

Creare un parser CSV specifico per ogni broker, sfruttando l'architettura modulare già esistente.

### Broker Prioritari

| Broker | Difficoltà | Note |
|---|---|---|
| **Degiro** | Media | Formato CSV ben strutturato, report "Transaction History" e "Portfolio" |
| **Fineco** | Alta | Formati CSV variabili, report "Movimenti" e "Portafoglio Titoli" |
| **Interactive Brokers** | Alta | Formato complesso, multi-valuta, multi-conto |
| **Trade Republic** | Bassa | Report semplici, pochi tipi di movimento |

### Architettura Proposta

```
utils/
├── csvParser.js              # Parser Directa (esistente)
├── csvParserDegiro.js        # Parser Degiro
├── csvParserFineco.js        # Parser Fineco
└── csvParserRegistry.js      # Registry: rileva automaticamente il broker dal CSV
```

### Strategia di Rilevamento Automatico
Analizzare le prime righe del CSV per identificare il broker:
- Intestazioni specifiche (es. "Degiro Transaction History")
- Pattern di colonne (es. "ISIN, Product, Quantity" per Degiro)
- Formato data (es. "DD-MM-YYYY" per Fineco)

### Mappatura Universal (Fase 2)
Se dopo i parser dedicati serve maggiore flessibilità:
- UI per mappare le colonne del CSV ai campi del dominio
- Salvataggio della mappatura come template per import futuri
- Complessità UI alta, da valutare dopo i parser dedicati

---

## 6. Supporto Multi-Utente (MVP3)

Trasformazione dell'applicazione da single-user a multi-utente.

### Funzionalità
- Registrazione e login (email + password)
- Profilo utente
- Isolamento completo dei dati tra utenti
- Amministrazione: gestione utenti (opzionale)

### Impatto tecnico (significativo)

**Database:**
- Nuova tabella: `users`
- Aggiunta colonna `user_id` a tutte le tabelle esistenti
- Migrazione dati per utente esistente

**Backend:**
- Autenticazione JWT o session-based
- Middleware di autorizzazione su ogni rotta
- Hashing password (bcrypt)

**Frontend:**
- Pagina di login/registrazione
- Gestione token (localStorage o cookie)
- Protezione rotte (redirect a login se non autenticato)

### Considerazioni
- Cambia l'architettura di fondo dell'applicazione
- Richiede testing approfondito sulla sicurezza
- Potrebbe introdurre dipendenze (es. `bcrypt`, `jsonwebtoken`)
- Valutare se ha senso per un'app pensata come self-hosted

---

## 7. API Pubblica (Documentata)

Esposizione di API REST documentate per accesso programmatico ai dati.

### Funzionalità
- Documentazione Swagger/OpenAPI
- Endpoint pubblici (in sola lettura) per i dati analytics
- API Key per autenticazione machine-to-machine

### Casi d'Uso
- Integrazione con Google Sheets (tirare giù i dati del portafoglio)
- Home Assistant dashboard
- Script automatici di backup/reporting

### Impatto tecnico
- Nuova dipendenza: `swagger-jsdoc` + `swagger-ui-express`
- Documentazione inline nelle route esistenti
- Nuovo middleware: API Key validation

---

## 8. Notifiche e Alert

Sistema di notifiche per eventi significativi sul portafoglio.

### Funzionalità
- **Soglie di perdita/guadagno**: notifica quando un asset supera una soglia
- **Promemoria import**: "sono passati 30 giorni dall'ultimo import"
- **Variazione allocazione**: alert quando un asset supera una percentuale target
- **Dividendi in arrivo**: calendario dividendi attesi

### Impatto tecnico
- Nuova tabella: `alerts` (soglie configurate dall'utente)
- Servizio di check periodico (cron job o setInterval)
- Notifiche in-app (badge, toast) o via email

---

## 9. Dark Mode / Tema Chiaro

L'app ha già un tema scuro di default. Aggiungere un tema chiaro alternativo.

### Funzionalità
- Toggle tema scuro/chiaro
- Persistenza della preferenza (localStorage)
- Rispetto della preferenza di sistema (`prefers-color-scheme`)

### Impatto tecnico
- Variabili CSS personalizzate per i colori
- Refactoring dei colori hard-coded nelle classi Tailwind
- Media query per preferenza di sistema

---

## 🎯 Priorità e Stime

| # | Funzionalità | Sforzo | Valore | Dipendenze | MVP |
|---|---|---|---|---|---|
| 1 | Dettaglio Asset | 🟢 Medio | 🟢 Alto | Nessuna | MVP2 |
| 2 | Benchmark e Indici | 🟡 Alto | 🟢 Alto | API esterna | MVP2 |
| 3 | Export Report | 🟢 Medio | 🟢 Alto | Libreria PDF | MVP2 |
| 4 | Obiettivi Investimento | 🟢 Medio | 🟡 Medio | Nessuna | MVP2 |
| 5 | Import Altri Broker | 🟡 Alto | 🟢 Alto | Documentazione broker | MVP2 |
| 6 | Multi-Utente | 🔴 Molto Alto | 🟡 Medio | Nessuna | MVP3 |
| 7 | API Pubblica | 🟢 Medio | 🟡 Medio | Swagger | MVP3 |
| 8 | Notifiche e Alert | 🟡 Alto | 🟡 Medio | Nessuna | MVP3 |
| 9 | Tema Chiaro | 🟢 Basso | 🟢 Basso | Nessuna | MVP2 |

### Legenda Sforzo
- 🟢 Basso: giorni
- 🟢 Medio: 1-2 settimane
- 🟡 Alto: 2-4 settimane
- 🔴 Molto Alto: 1-3 mesi

---

## 📋 Backlog MVP2 (Ordinato per Priorità)

1. **Dettaglio Asset** — Pagina singolo strumento con storico prezzi, ordini, dividendi
2. **Benchmark e Confronto Indici** — Sharpe Ratio, Max Drawdown, Volatilità
3. **Export Report Periodico** — CSV/PDF per dichiarazione fiscale
4. **Obiettivi di Investimento** — Target finanziari con proiezioni
5. **Import Altri Broker** — Degiro, Fineco (parser dedicati)
6. **Tema Chiaro** — Alternativa al tema scuro predefinito

---

*Documento creato il 09/08/2026 — Le priorità possono variare in base al feedback degli utenti.*