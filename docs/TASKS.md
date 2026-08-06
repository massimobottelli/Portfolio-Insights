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
| T2.1 | Lettura File CSV | Implementazione del parser di stringhe CSV nativo (senza librerie esterne) | Da fare | Alta |
| T2.2 | Sanificazione & Normalizzazione | Implementazione regole di pulizia (trim, virgola -> punto, gestione asterisco `*`) | Da fare | Alta |
| T2.3 | Mapping Causali | Traduzione deterministica delle causali Directa in entità di dominio | **Completato** (in `importController.js`) | Alta |
| T2.4 | Gestione Idempotenza | Logica di inserimento sicuro a prova di duplicati (re-import dello stesso file) | **Completato** (in `importModel.js`) | Alta |
| T2.5 | Tracciamento Sessioni | Salvataggio dei log di successo/errore nella tabella `import_sessions` | **Completato** (in `importModel.js`) | Media |

---

## 🧮 Fase 3: Analytics Engine (Calcoli in Memoria)

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T3.1 | Calcolo Posizioni | Algoritmo per ricostruire le quantità correnti degli Asset dagli ordini storici | **Completato** (in `analyticsModel.js`) | Alta |
| T3.2 | Calcolo Liquidità | Calcolo del saldo di cassa corrente aggregando i `CashMovement` | **Completato** (in `analyticsModel.js`) | Alta |
| T3.3 | Calcolo Capitale Investito | Somma dei conferimenti (depositi) per determinare il capitale immesso | **Completato** (in `analyticsModel.js`) | Alta |
| T3.4 | Calcolo Profit & Loss | Calcolo delle performance totali (assolute e percentuali) | **Completato** (in `analyticsController.js`) | Media |
| T3.5 | Calcolo Allocazione | Aggregazione pesi percentuali degli asset nel portafoglio attuale | **Completato** (in `analyticsModel.js`) | Media |

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
| Fase 2: Importer Engine | 5 | 3 | 2 |
| Fase 3: Analytics Engine | 5 | 5 | 0 |
| Fase 4: Rotte API | 6 | 6 | 0 |
| Fase 5: Frontend React | 4 | 0 | 4 |
| **Totale** | **25** | **19** | **6** |