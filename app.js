import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './database.js';

// Importazione delle rotte per registrarle nell'app Express
import assetRoutes from './routes/assetRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import importRoutes from './routes/importRoutes.js';
import movementRoutes from './routes/movementRoutes.js';
import authRoutes from './routes/authRoutes.js';
import allocationRoutes from './routes/allocationRoutes.js';
import orderRoutes from './routes/orderRoutes.js';

// Middleware di autenticazione
import { authMiddleware } from './middleware/authMiddleware.js';

// Middleware di sicurezza e gestione errori centralizzata
import { apiNotFound, errorHandler, securityHeaders } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Inizializzazione del Database prima di configurare Express
initializeDatabase();

// 2. Creazione dell'app Express
const app = express();

// Non esporre la firma del framework negli header di risposta
app.disable('x-powered-by');

// 3. Middleware nativi di Express
// 3a. Body parser esteso SOLO per /api/import: i file CSV Directa (inviati come
//     stringa JSON) possono superare abbondantemente il limite default.
//     Montato PRIMA del parser globale: body-parser segna la richiesta come già
//     processata (req._body), quindi il parser da 1mb qui sotto la salta.
app.use('/api/import', express.json({ limit: '50mb' }));

// 3b. Limite conservativo di default (1mb) su tutte le altre rotte:
//     non si espone un vettore DoS su API che non ne hanno bisogno.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Security header minimi (nosniff, anti-clickjacking, referrer policy)
app.use(securityHeaders);

// 4. Rotte di autenticazione (NON protette — è il punto di ingresso per il login)
app.use('/api/auth', authRoutes);

// 5. Middleware di autenticazione su TUTTE le rotte API (tranne /api/auth)
//    Applicato prima delle rotte specifiche per proteggere ogni endpoint.
app.use('/api', authMiddleware);

// 6. Cache-Control: no-store sulle risposte API per evitare che il browser
//    memorizzi dati finanziari sensibili.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// 7. Registrazione delle rotte API (protette dal middleware di autenticazione)
app.use('/api/import', importRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/analytics', performanceRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api', allocationRoutes);
app.use('/api/orders', orderRoutes);

// 8. Handler 404 per rotte API sconosciute.
//     DEVE stare PRIMA del fallback SPA: altrimenti una GET /api/inesistente
//     cadrebbe nel fallback ricevendo index.html con status 200 invece di un 404 JSON.
app.use(apiNotFound);

// 9. Servizio dei file statici del frontend React (build in public/)
app.use(express.static(path.join(__dirname, 'public')));

// 10. Fallback SPA: qualsiasi rotta non-API rimanda a index.html (routing React)
//     e error handler finale: cattura ogni errore non gestito restituendo
//     un messaggio generico SENZA dettagli interni (no stack trace al client).
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(errorHandler);

export default app;
