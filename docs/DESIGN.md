# Portfolio Insights

> Technical Design Document

---

## 👁️ 1. Vision

### Project Overview
Portfolio Insights is a self-hostable web application that analyzes a single investment portfolio exported from the Directa broker.

The application focuses on long-term investments (ETFs, ETCs, ETNs and Stocks) and provides advanced insights into portfolio composition, historical evolution and investment performance.

---

### Problem Statement
Although Directa provides portfolio information, long-term investors often need richer analytics and a clearer overview of their investments.

Portfolio Insights consolidates Directa exports into a normalized local database and generates meaningful analytics through an internal Analytics Engine.

---

## 🎯 2. Goals & Scope

### MVP1 Goals
The first release focuses on providing a complete overview of the current portfolio.

#### Supported Pages
- Dashboard
- Portfolio
- Import Manager
- Settings

#### Features
- Import Directa reports
- Normalize imported data
- Persist normalized data
- Display portfolio overview
- Portfolio allocation
- Portfolio KPIs
- Basic charts
- Safe re-import without duplicates

---

### MVP2

#### Pages
- Asset Detail
- Portfolio History

#### Features
- Historical portfolio evolution
- Asset analytics
- Advanced charts
- Historical comparisons

---

## 🔄 3. User Workflow

### Initial Setup
The user imports Directa export files.

Supported reports:
1. Current Portfolio
2. Portfolio Value History
3. Order History

The application parses, validates and normalizes imported data before storing it in the local database. **No manual data entry** is required.

---

## 💡 4. Architecture Principles

### Simplicity First
Introduce new technologies only when they provide a measurable benefit. Avoid unnecessary infrastructure.

### Self Hostable
The application must run on any machine without depending on cloud services.

### Offline Capable
After importing Directa reports, the application must continue working without Internet access.

### AI-Friendly
The project should be optimized for AI-assisted development. Characteristics include:
- Explicit modules
- Strong typing
- Predictable folder structure
- Low coupling
- High cohesion
- Small services

---

## 📊 5. Data Source Strategy

Directa reports are the **single source of truth**. No external APIs are required for the MVP.

The application parses three distinct export files to reconstruct the portfolio:

| Report Tipo | Scopo Principale | Identificatori di Idempotenza |
|---|---|---|
| **Current Portfolio** | Allineamento asset in tempo reale, controllo "Valore attuale" e "Valore di carico". | ID Asset / ISIN |
| **Portfolio Value History** | Snapshot del saldo giornaliero (Liquidità, Portafoglio, Patrimonio). | Data Snapshot |
| **Order History** | Registro delle transazioni finanziarie (BUY, SELL, Cedole, Bolli, Ritenute, Commissioni). | `Riferimento ordine` e `Protocollo` |

---

## ⚙️ 6. Analytics Engine

The Analytics Engine generates every derived model used by the application. **No analytical result is permanently stored** in the database.

### MVP1 KPIs
- Total Portfolio Value
- Invested Capital
- Available Cash
- Total Profit / Loss (Assoluto e %)
- Year-To-Date (YTD) Performance

---

## 🎨 7. User Interface

### MVP1
- Dashboard (KPI, Allocazione)
- Portfolio (Dettaglio posizioni)
- Import Manager (Upload CSV)
- Settings (Configurazioni generali)

### MVP2
- Asset Detail (Analisi singolo strumento)
- Portfolio History (Evoluzione temporale del patrimonio)

---

## 🛠️ 8. Technical Stack

La filosofia di questo stack è il **minimalismo tecnologico assoluto**. L'applicazione riduce a zero le dipendenze di terze parti a runtime sul backend, sfruttando esclusivamente le potenti API native introdotte nelle versioni moderne di Node.js (Node 22+).

| Livello | Tecnologia | Scelta & Ruolo nel Progetto |
|---|---|---|
| **Frontend** | **React + TypeScript + Vite** | Interfaccia veloce e tipizzata, compilata in file statici pronti per essere serviti dal backend. |
| **Interfaccia Web** | **Tailwind CSS + shadcn/ui** | Stile grafico moderno e pulito con componenti altamente personalizzabili e AI-friendly. |
| **Grafici** | **Recharts** | Visualizzazione interattiva dell'allocazione del portafoglio e dell'evoluzione storica. |
| **Backend** | **Node.js (Nativo)** | Nessun framework esterno (No Express, No Fastify). Routing delle API e dei file statici gestito tramite il modulo nativo `node:http`. |
| **Database** | **SQLite (Nativo)** | Gestione dei dati tramite il modulo nativo `node:sqlite` (Node 22+). Nessun ORM (No Prisma); le query SQL sono scritte in codice nativo. |
| **Validazione** | **JavaScript Nativo** | Validazione dei tipi e parsing dei file CSV di Directa eseguiti tramite funzioni pure e moduli nativi di pulizia stringhe. |

---

## 🧱 9. MVC Architecture Pattern

Per mantenere il codice backend organizzato, scalabile e AI-friendly senza l'uso di framework pesanti, l'applicazione adotta rigorosamente il pattern **Model-View-Controller (MVC)**:

[Client / React View]  <--->  [Routes]  <--->  [Controllers]  <--->  [Models / SQLite]


### Componenti del Pattern

*   **Model:** Gestisce l'accesso diretto ai dati e la persistenza. Sfrutta il modulo nativo `node:sqlite` per eseguire query SQL dirette e restituire oggetti JavaScript tipizzati. Non contiene logica di presentazione o di routing.
*   **View:** Rappresentata dall'applicazione frontend in React. Consuma le API JSON esposte dal backend e si occupa esclusivamente della presentazione visiva e dell'interazione utente.
*   **Controller:** Contiene la logica applicativa e di business. Riceve i dati dalle richieste HTTP passati dalle rotte, interroga o aggiorna i Model, elabora i risultati (es. calcoli dell'Analytics Engine) e restituisce la risposta HTTP al client.
*   **Route:** Mappa gli endpoint URL (es. `/api/assets`) e i metodi HTTP (GET, POST) verso lo specifico metodo del Controller. È gestita dal micro-router nativo.

---

## 📂 10. Project Structure

Il progetto segue un'architettura monorepo chiara basata sul pattern MVC:

```text
portfolio-insights/
├── models/
│   ├── assetModel.js          # Query SQLite per la gestione degli asset
│   ├── analyticsModel.js      # Query SQLite per i dati storici e i calcoli delle metriche
│   └── importModel.js         # Query SQLite per l'inserimento delle transazioni e log di import
├── controllers/
│   ├── assetController.js     # Logica per recuperare e formattare i dati degli asset
│   ├── analyticsController.js # Calcoli KPI, allocazione e orchestrazione della Dashboard
│   └── importController.js    # Gestione dell'upload, validazione e salvataggio dei CSV
├── routes/
│   ├── assets.js              # Mappatura endpoint per la gestione degli strumenti (Asset)
│   ├── analytics.js           # Mappatura endpoint per la Dashboard e KPI
│   └── imports.js             # Mappatura endpoint per l'importazione dei file Directa
├── router.js                  # Il micro-router nativo (smista le richieste HTTP ai controller)
├── database.js                # Inizializzazione della connessione a SQLite nativo
├── server.js                  # Entry point del server HTTP nativo (modulo node:http)
└── public/                    # Frontend React (build statica dell'interfaccia utente)
```

---

## 📜 11. Development Rules

- **Strict MVC Separation:** Le rotte non devono contenere logica di business; devono solo delegare ai Controller. I Controller non devono scrivere query SQL direttamente; devono richiamare i Model.
- **Never access the database from the UI:** Il frontend comunica con il database esclusivamente tramite le API esposte dai Controller.
- **Business logic belongs to the Analytics package:** I calcoli complessi non vengono salvati nel DB ma generati a runtime dai controller preposti.
- **Importers never perform business calculations:** L'importatore si occupa solo di ripulire, validare e salvare i dati grezzi in modo idempotente.
- **Domain models are independent from Directa exports:** I modelli del database devono essere generici; il parsing specifico di Directa deve essere isolato nei controller di importazione.
- **Keep modules small and explicit:** Preferire funzioni pure, composizione rispetto all'ereditarietà ed evitare dipendenze circolari.

---

**End of Document**
