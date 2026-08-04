# 📋 Portfolio Insights - Tabella di Marcia MVP1

Questo documento traccia l'avanzamento dello sviluppo del progetto **Portfolio Insights**.
La filosofia di sviluppo prevede la creazione di componenti minimali, nativi e a basso accoppiamento.

---

## 🛠️ Fase 1: Setup & Infrastruttura di Base

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T1.1 | Definizione Schema SQL | Progettazione tabelle SQLite con indici e vincoli di unicità | **Completato** | Alta |
| T1.2 | Inizializzazione DB | Creazione automatica di cartelle, file `.db` e tabelle in `database.js` | **Completato** | Alta |
| T1.3 | Micro-Router Nativo | Sviluppo del motore di routing a zero dipendenze in `router.js` | **Completato** | Alta |
| T1.4 | Server HTTP Nativo | Setup del server `node:http` con supporto CORS e gestione statici in `server.js` | **Completato** | Alta |

---

## 📥 Fase 2: Importer Engine & Parser CSV

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T2.1 | Lettura File CSV | Implementazione del parser di stringhe CSV nativo (senza librerie esterne) | Da fare | Alta |
| T2.2 | Sanificazione & Normalizzazione | Implementazione regole di pulizia (trim, virgola -> punto, gestione asterisco `*`) | Da fare | Alta |
| T2.3 | Mapping Causali | Traduzione deterministica delle causali Directa in entità di dominio | Da fare | Alta |
| T2.4 | Gestione Idempotenza | Logica di inserimento sicuro a prova di duplicati (re-import dello stesso file) | Da fare | Alta |
| T2.5 | Tracciamento Sessioni | Salvataggio dei log di successo/errore nella tabella `import_sessions` | Da fare | Media |

---

## 🧮 Fase 3: Analytics Engine (Calcoli in Memoria)

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T3.1 | Calcolo Posizioni | Algoritmo per ricostruire le quantità correnti degli Asset dagli ordini storici | Da fare | Alta |
| T3.2 | Calcolo Liquidità | Calcolo del saldo di cassa corrente aggregando i `CashMovement` | Da fare | Alta |
| T3.3 | Calcolo Capitale Investito | Somma dei conferimenti (depositi) per determinare il capitale immesso | Da fare | Alta |
| T3.4 | Calcolo Profit & Loss | Calcolo delle performance totali (assolute e percentuali) | Da fare | Media |
| T3.5 | Calcolo Allocazione | Aggregazione pesi percentuali degli asset nel portafoglio attuale | Da fare | Media |

---

## 🔌 Fase 4: Sviluppo Rotte API (Backend)

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T4.1 | Endpoint Importazione | Controller POST `/api/import` per ricevere ed elaborare i file di Directa | Da fare | Alta |
| T4.2 | Endpoint Dashboard | Controller GET `/api/dashboard` per restituire KPI aggregati | Da fare | Alta |
| T4.3 | Endpoint Portafoglio | Controller GET `/api/portfolio` con la lista delle posizioni attive | Da fare | Alta |
| T4.4 | Endpoint Impostazioni | Controller per la gestione/pulizia del database | Da fare | Bassa |

---

## 🎨 Fase 5: Interfaccia Utente (React Frontend)

| ID | Task | Descrizione | Stato | Priorità |
|---|---|---|---|---|
| T5.1 | Setup Client & Tailwind | Configurazione del compilato statico di React nella cartella `public/` | Da fare | Alta |
| T5.2 | Pagina Importazione | UI per caricare i file CSV con feedback sullo stato dell'import | Da fare | Alta |
| T5.3 | Pagina Dashboard | Visualizzazione KPI principali e grafico di allocazione (Recharts) | Da fare | Media |
| T5.4 | Tabella Portafoglio | Vista dettagliata delle posizioni attuali (ISIN, ticker, valore, P&L) | Da fare | Media |
