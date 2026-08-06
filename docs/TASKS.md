# 📋 Portfolio Insights - Tabella di Marcia MVP1

Questo documento traccia l'avanzamento dello sviluppo del progetto **Portfolio Insights**.
La filosofia di sviluppo prevede la creazione di componenti minimali, nativi e a basso accoppiamento.

---

## 🛠️ Fase 1: Setup & Infrastruttura di Base

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T1.1 | Definizione Schema SQL | Progettazione tabelle SQLite con indici e vincoli di unicità | **Completato** | Alta |
| T1.2 | Inizializzazione DB | Creazione automatica di cartelle, file `.db` e tabelle in `database.js` | **Completato** | Alta |
| T1.3 | Express Setup | Installazione Express e configurazione middleware in `app.js` | **Completato** | Alta |
| T1.4 | Server HTTP con Express | Entry point del server in `server.js` che avvia Express | **Completato** | Alta |
| T1.5 | Struttura MVC | Creazione cartelle `models/`, `controllers/`, `routes/`, `public/` | **Completato** | Alta |

---

## 📥 Fase 2: Importer Engine & Parser CSV

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T2.1 | Lettura File CSV | Implementazione del parser di stringhe CSV nativo (senza librerie esterne) | **Completato** (in `utils/csvParser.js`) | Alta |
| T2.2 | Sanificazione & Normalizzazione | Implementazione regole di pulizia (trim, virgola -> punto, gestione asterisco `*`) | **Completato** (in `utils/csvParser.js`) | Alta |
| T2.3 | Mapping Causali | Traduzione deterministica delle causali Directa in entità di dominio (18 causali in `importController.js`) | **Completato** (in `importController.js`) | Alta |
| T2.4 | Gestione Idempotenza | Logica di inserimento sicuro a prova di duplicati (re-import dello stesso file) | **Completato** (in `importModel.js`) | Alta |
| T2.5 | Tracciamento Sessioni | Salvataggio dei log di successo/errore nella tabella `import_sessions` | **Completato** (in `importModel.js`) | Media |
| T2.6 | Parser Report Patrimonio | Parsing del CSV "Patrimonio Totale" con doppia sezione (snapshot giornalieri + eventi) | **Completato** (in `utils/csvParser.js`) | Alta |
| T2.7 | Bugfix Eventi Patrimonio | Correzione offset colonne eventi nel parser history (colonna H vuota, eventi da colonna I) | **Completato** (commit `2f2290e`) | Media |

---

## 🧮 Fase 3: Analytics Engine (Calcoli in Memoria)

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T3.1 | Calcolo Posizioni | Algoritmo per ricostruire le quantità correnti degli Asset dagli ordini storici | **Completato** (in `analyticsModel.js`) | Alta |
| T3.2 | Calcolo Liquidità | Calcolo del saldo di cassa corrente aggregando i `CashMovement` | **Completato** (in `analyticsModel.js`) | Alta |
| T3.3 | Calcolo Capitale Investito | Somma dei conferimenti (depositi) per determinare il capitale immesso | **Completato** (in `analyticsModel.js`) | Alta |
| T3.4 | Calcolo Profit & Loss | Calcolo delle performance totali (assolute e percentuali) | **Completato** (in `analyticsController.js`) | Media |
| T3.5 | Calcolo Allocazione | Aggregazione pesi percentuali degli asset nel portafoglio attuale | **Completato** (in `analyticsModel.js`) | Media |
| T3.6 | Storico Snapshot | Recupero serie storica completa degli snapshot di portafoglio | **Completato** (in `analyticsModel.js`) | Media |

---

## 🔌 Fase 4: Sviluppo Rotte API (Backend)

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T4.1 | Endpoint Importazione | Controller POST `/api/import` per ricevere ed elaborare i file di Directa | **Completato** | Alta |
| T4.2 | Endpoint Dashboard | Controller GET `/api/analytics/dashboard` per restituire KPI aggregati | **Completato** | Alta |
| T4.3 | Endpoint Portafoglio | Controller GET `/api/analytics/portfolio` con la lista delle posizioni attive | **Completato** | Alta |
| T4.4 | Endpoint Asset | Controller GET `/api/assets` e `/api/assets/by-isin/:isin` per la gestione asset | **Completato** | Alta |
| T4.5 | Endpoint Allocazione | Controller GET `/api/analytics/allocation` per l'allocazione percentuale | **Completato** | Media |
| T4.6 | Endpoint Sessioni | Controller GET `/api/import/sessions` per lo storico import | **Completato** | Media |

---

## 🧪 Fase 4b: Test Scripts

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T4b.1 | Test Report Portafoglio | Script `test/test-portfolio-report.sh` - testa GET dashboard, portfolio, allocation | **Completato** | Media |
| T4b.2 | Test Import Movimenti | Script `test/test-import-movements.sh` - importa CSV movimenti e verifica dati | **Completato** | Media |
| T4b.3 | Test Import Patrimonio | Script `test/test-import-history.sh` - importa CSV patrimonio e verifica snapshot | **Completato** | Media |

---

## 🎨 Fase 5: Interfaccia Utente (React Frontend)

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T5.1 | Setup Client & Tailwind | Configurazione del compilato statico di React nella cartella `public/` | Da fare | Alta |
| T5.2 | Pagina Importazione | UI per caricare i file CSV con feedback sullo stato dell'import | Da fare | Alta |
| T5.3 | Pagina Dashboard | Visualizzazione KPI principali e grafico di allocazione (Recharts) | Da fare | Media |
| T5.4 | Tabella Portafoglio | Vista dettagliata delle posizioni attuali (ISIN, ticker, valore, P&L) | Da fare | Media |

---

## 📋 Riepilogo Stato Progetto

| Fase | Totale Task | Completati | Da Fare |
|---|---|---|---|
| Fase 1: Setup & Infrastruttura | 5 | 5 | 0 |
| Fase 2: Importer Engine | 7 | 7 | 0 |
| Fase 3: Analytics Engine | 6 | 6 | 0 |
| Fase 4: Rotte API | 6 | 6 | 0 |
| Fase 4b: Test Scripts | 3 | 3 | 0 |
| Fase 5: Frontend React | 4 | 0 | 4 |
| **Totale** | **31** | **27** | **4** |

---

## 📊 Stato Database Corrente (06/08/2026)

| Tabella | Record | Note |
|---|---|---|
| `assets` | 27 | Tutti gli ISIN presenti nei movimenti |
| `market_orders` | 188 | Acquisti e vendite storici |
| `cash_movements` | 184 | Depositi, commissioni, bolli, cedole, dividendi |
| `daily_portfolio_snapshots` | 793 | Snapshot giornalieri dal 05/06/2024 al 06/08/2026 |
| `import_sessions` | 2 | Sessioni: movimenti + patrimonio |

## ✅ Calcoli Analytics Possibili

| Calcolo | Endpoint | Dati Necessari | Disponibile |
|---|---|---|---|
| Posizioni attive (quantità nette) | `GET /api/analytics/portfolio` | `market_orders` | ✅ 27 posizioni |
| Liquidità disponibile | `GET /api/analytics/dashboard` | `cash_movements` | ✅ €256,480.80 |
| Capitale investito (depositi) | `GET /api/analytics/dashboard` | `cash_movements` (DEPOSIT) | ✅ €257,600.00 |
| Valore portafoglio (ultimo snapshot) | `GET /api/analytics/dashboard` | `daily_portfolio_snapshots` | ✅ €230,758.56 |
| Profit & Loss | `GET /api/analytics/dashboard` | snapshot + depositi | ✅ -€26,841.44 (-10.42%) |
| Allocazione percentuale | `GET /api/analytics/allocation` | `market_orders` | ✅ 27 asset con pesi |
| Storico valore portafoglio | `GET /api/analytics/history` (da creare) | `daily_portfolio_snapshots` | ✅ 793 dati pronti |