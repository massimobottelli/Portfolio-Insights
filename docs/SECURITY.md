# 🔒 Analisi di Sicurezza — Portfolio Insights

Ho analizzato l'intera codebase: backend Express (controllers, models, routes, parser CSV), frontend React (tutte le pagine), configurazione (app.js, database.js, package.json, vite), script di deployment Debian e la documentazione. Ecco il report completo.

---

## 🚨 CRITICITÀ GRAVI (Rischio Alto)

### 1. ~~Nessuna Autenticazione / Autorizzazione su TUTTI gli endpoint~~ ✅ RISOLTO
**Stato:** Risolto il 14/08/2026.

**Soluzione implementata:**
- **API Token** con header `Authorization: Bearer <token>` su TUTTI gli endpoint `/api/*` (tranne `/api/auth/check`)
- Token generato automaticamente all'avvio (256 bit, salvato in `db/.api-token` con permessi 600) o configurato via env `API_TOKEN`
- Confronto **timing-safe** (SHA-256 + `crypto.timingSafeEqual`) contro timing attacks
- **Rate limiting** (5 richieste/minuto) su `/api/auth/check` per proteggere da brute-force
- **`Cache-Control: no-store`** sulle risposte API (dati finanziari sensibili)
- **Frontend:** pagina di login, routing protetto, `apiFetch` helper con redirect automatico a `/login` su 401, pulsante logout
- **Deployment Debian:** token generato in `install-debian.sh` e caricato via `EnvironmentFile` nel systemd service

**File modificati:**
- `config/auth.js` (nuovo) — gestione token
- `middleware/authMiddleware.js` (nuovo) — verifica token
- `middleware/rateLimit.js` (nuovo) — rate limiter nativo
- `routes/authRoutes.js` (nuovo) — endpoint `/api/auth/check`
- `app.js` — middleware applicato a tutte le rotte API
- `client/src/lib/api.ts` (nuovo) — helper fetch con token
- `client/src/pages/Login.tsx` (nuovo) — pagina di login
- `client/src/App.tsx` — routing protetto
- Tutte le pagine frontend — uso di `apiFetch`
- `client/src/components/Layout.tsx` — pulsante logout
- `scripts/install-debian.sh` / `scripts/update-debian.sh` — generazione token + systemd
- `docs/API.md` — documentazione aggiornata

**Test eseguiti:**
- Senza token → `401`
- Token valido → `200`
- Token invalido → `401`
- Rate limit: 5 richieste OK, 6ª → `429`
- Tutti gli endpoint protetti rispondono `200` con token
- Build frontend TypeScript senza errori
- SPA fallback (`/login`) funzionante

---

### 2. ~~Database SQLite Potenzialmente Esposto su GitHub Pubblico~~ ✅ RISOLTO
**Stato:** Risolto il 14/08/2026.

**Verifica eseguita:**
- `db/` è nel `.gitignore` (righe 7-12)
- `git ls-files db/` → nessun file tracciato
- `git log --all -- db/` → solo `db/db.sql` (commit `65889d0` → `7d491cd`), un placeholder innocuo con un singolo punto, **mai** `db/portfolio.db` con dati reali

**Conclusione:** il database non è mai stato esposto su GitHub. Nessuna rotazione dati necessaria.

**Severity: CRITICA** (risolta)

---

### 3. ~~Endpoint `POST /api/import` — Formato Legacy JSON Non Validato~~ ✅ RISOLTO
**Stato:** Risolto il 14/08/2026.

**Soluzione implementata:**
- **Rimosso completamente** il ramo legacy `{ fileType, records }` da `importController.js`
- L'endpoint accetta ora **solo** `{ fileContent, filename }` (CSV come stringa)
- Tutti i dati passano obbligatoriamente dal parser CSV (`utils/csvParser.js`) che normalizza date (`normalizeDate`), numeri (`parseItalianNumber`) e stringhe (`cleanString`/`nullableString`) in modo deterministico
- Richiesta senza `fileContent` → `400` con messaggio chiaro
- Il frontend (`ImportPage.tsx`) e i test script inviavano già solo `fileContent` — nessuna regressione attesa

**File modificati:**
- `controllers/importController.js` — rimozione ramo legacy + commento esplicativo

**Severity: ALTA** (risolta)

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
