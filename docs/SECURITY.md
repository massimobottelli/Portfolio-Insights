# 🔒 Analisi di Sicurezza — Portfolio Insights

Ho analizzato l'intera codebase: backend Express (controllers, models, routes, parser CSV), frontend React (tutte le pagine), configurazione (app.js, database.js, package.json, vite), script di deployment Debian e la documentazione. Ecco il report completo.

---

## 🚨 CRITICITÀ GRAVI (Rischio Alto)

### 1. Nessuna Autenticazione / Autorizzazione su TUTTI gli endpoint
L'applicazione espone tutte le API **senza alcuna autenticazione**:
- `GET /api/analytics/*`, `GET /api/assets`, `GET /api/movements` → **chiunque legge tutti i dati finanziari** (patrimonio, ISIN, quantità, P&L, nome utente del conto Directa)
- `PATCH /api/assets/:id/type` → modifica dati
- `POST /api/import` → **iniezione di dati falsi arbitrari** (ordini, depositi, prezzi) che corrompono tutti gli analytics
- `DELETE /api/import/clear` → **cancellazione totale e irreversibile del database** con un semplice `{"confirm": true}`

**Impatto:** Lo script `install-debian.sh` espone deliberatamente l'app su `http://<SERVER_IP>:3000` sulla rete. Qualsiasi host sulla rete (o su Internet se la porta è aperta) può leggere il patrimonio dell'utente e cancellare il database.

**Severity: CRITICA**

---

### 2. Database SQLite Potenzialmente Esposto su GitHub Pubblico
- La cartella **`db/` NON è nel `.gitignore`** (contiene solo `node_modules`, `dist`, `.vite`, `pnpm-lock`, `.env`, `.DS_Store`, `Directa/`)
- Il file `db/portfolio.db` contiene tutti i dati finanziari reali dell'utente (nome "H4091 BOTTELLI MASSIMO", ISIN, quantità, valori di portafoglio)
- Lo script `update-debian.sh` ha un blocco commentato che dice: *"if the SQLite database ... are still tracked from an older install (they were committed in the past)"* → **il DB è stato committato nel repository pubblico in passato**

**Azione immediata necessaria:** verificare la history di git con `git log --all -- db/` e, se il file è mai stato committato, **ruotare/cancellare** i dati storici esposti.

**Severity: CRITICA**

---

### 3. Endpoint `POST /api/import` — Formato Legacy JSON Non Validato
Il formato legacy `{ fileType, records }` (linee 46-49 di `importController.js`) accetta **JSON arbitrario senza alcuna validazione**:
- Valori possono essere stringhe, oggetti, array, `Infinity`, `null`, numeri negativi
- `processOrderRecord`/`processPortfolioRecord` leggono `record.euroAmount`, `record.quantity`, ecc. direttamente senza passare da `parseItalianNumber`
- Un attaccante può iniettare quantità/importi astronomici o tipi sbagliati, corrompendo tutti i calcoli analytics (posizioni, allocazione, TWR)
- Un volume enorme di record può riempire il database (DoS)

**Severity: ALTA**

---

### 4. Body Limit 50MB — Vettore DoS
`express.json({ limit: '50mb' })` + `express.urlencoded({ limit: '50mb' })`:
- Un attaccante può inviare ripetutamente payload da 50MB per saturare la memoria del server
- Il parsing di un CSV da 50MB con parser sincrono blocca l'event loop

**Severity: ALTA**

---

## ⚠️ PROBLEMI MEDI (Rischio Medio)

### 5. Disclosure di Errori Interni
Tutti i catch restituiscono `details: error.message` (es. `importController.js:113`, `movementController.js:26`). Questo espone:
- Percorsi file del server
- Errori SQL
- Dettagli implementativi interni

### 6. Missing Security Headers (no `helmet`)
Nessuno di questi header è impostato:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` / `frame-ancestors` (clickjacking)
- `Content-Security-Policy`
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy`
- `Permissions-Policy`
- `Cache-Control: no-store` per dati finanziari sensibili

### 7. Nessun Rate Limiting
Nessun limite alle richieste su endpoint sensibili (`POST /api/import`, `DELETE /api/import/clear`). Facile DoS.

### 8. LIKE Injection / Wildcard nel filtro `search`
In `movementModel.js:57`, `search` è usato con `LIKE %...%` senza escape di `%` e `_`. Un utente può inviare `search=%%%%%%%%...` per forzare full-table scan costosi.

### 9. Permessi File Database su Debian
Lo script di install imposta `chmod 755` sulla directory `db/`. Il file `portfolio.db` creato da node:sqlite avrà permessi 644 → **leggibile da qualsiasi utente locale del sistema**.

### 10. DoS tramite `normalizeDate` / Parser CSV (CPU) 
Data la mancanza di rate limiting + 50MB, un CSV malevolo può causare parsing CPU-intensivo sincrono.

---

## 🔧 PROBLEMI MINORI

| # | Problema | Localizzazione |
|---|---|---|
| 11 | `express.urlencoded({ extended: true })` non necessario per un'API JSON — superficie d'attacco inutile (qs parser) | `app.js:24` |
| 12 | `PATCH /api/assets/:id` non valida che `id` sia un UUID — query DB con stringa arbitraria (safe grazie a prepared statements, ma input non validato) | `assetController.js` |
| 13 | `filename` non validato nell'import — salvato nel DB senza sanitizzazione (React lo escape, ma resta input non validato) | `importController.js:20` |
| 14 | `isBtp` usa `toLowerCase()` su `ticker`/`name` — se null, crash. Attualmente il DB garantisce NOT NULL, ma se i dati legacy contengono null → crash 500 | `analyticsModel.js:82` |
| 15 | Il formato legacy `records` permette `operationDate` non normalizzata (non passa da `normalizeDate`) — dati corrotti | `importController.js` |
| 16 | Nessun backup automatico prima di `DELETE /api/import/clear` — export irreversibile senza recovery | `importModel.js:180` |
| 17 | Idempotenza parziale: `insertMarketOrder` non ha unique constraint su `orderReference` + campi → duplicati su re-import in alcuni scenari | `importModel.js:72` |
| 18 | Nessun Content-Type enforcement: API accetta qualunque Content-Type | `app.js` |

---

## ✅ PUNTI DI FORZA OSSERVATI

- **SQL Injection: mitigata correttamente** — tutte le query usano prepared statements (`db.prepare().get()/.all()/.run()`) e la whitelist delle colonne ordinabili in `movementModel.js` è implementata bene
- **Stored XSS: mitigato in React** — nessun `dangerouslySetInnerHTML`, React escape tutto il testo (ticker, nomi asset, filename)
- **Bon pratiche sui numeri:** converte correttamente i decimali italiani
- **systemd hardening decente:** `NoNewPrivileges`, `ProtectSystem=full`, `ReadWritePaths`, `ProtectHome`, `PrivateTmp`, user dedicato senza shell
- **Idempotenza:** unique constraint su `protocol` e su snapshot_date
- **Dati calcolati mai persistiti** — buona architettura

---

## 🎯 PIANO DI RIMEDIAZIONE PROPOSTO

### Fase 1 — Critiche (immediate)
1. **Aggiungere `db/` al `.gitignore`** e rimuovere `db/portfolio.db` dal tracking git
2. **Autenticazione obbligatoria** — anche per un'app self-hosted single-user:
   - API Token via header `Authorization: Bearer <token>` (configurato via env `API_TOKEN`)
   - Middleware `authMiddleware.js` applicato a tutte le rotte `/api/*`
   - Sessione o JWT se si vuole login UI
3. **Disabilitare il formato legacy `records`** in `POST /api/import` (o validarlo rigorosamente)
4. **Ridurre il body limit** a 5-10MB (sufficiente per i CSV Directa) e aggiungere **rate limiting** (`express-rate-limit`) su `/api/import` e `/api/import/clear`

### Fase 2 — Medie
5. Installare **`helmet`** per security headers
6. **Nascondere i dettagli degli errori** in produzione (`details` solo in dev, log server-side)
7. **Escape di `%` e `_`** nella ricerca LIKE
8. **`chmod 700`** sulla directory `db/` nello script Debian (con setfacl per l'utente di servizio)
9. Restringere il bind del server a `127.0.0.1` di default (o richiedere reverse proxy)

### Fase 3 — Minori / Difesa in profondità
10. Rimuovere `express.urlencoded` se non usato
11. Validazione UUID per `:id` nei path parameters
12. Validazione input completa (zod/joi) per i record importati
13. Backup automatico del DB prima di ogni clear/import
14. `Cache-Control: no-store` sulle risposte API
15. Error handling centralizzato (error middleware) per uniformare le risposte
16. Considerare un reverse proxy nginx con TLS/HTTPS per il deployment server
