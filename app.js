import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './database.js';

// Importazione delle rotte per registrarle nell'app Express
import assetRoutes from './routes/assetRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import importRoutes from './routes/importRoutes.js';
import movementRoutes from './routes/movementRoutes.js';
import authRoutes from './routes/authRoutes.js';
import allocationRoutes from './routes/allocationRoutes.js';

// Middleware di autenticazione
import { authMiddleware } from './middleware/authMiddleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Inizializzazione del Database prima di configurare Express
initializeDatabase();

// 2. Creazione dell'app Express
const app = express();

// 3. Middleware nativi di Express
// Il limite del body è aumentato a 50mb perché i file CSV Directa (inviati come
// stringa JSON) possono superare abbondantemente i 100KB default di Express.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
app.use('/api/assets', assetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api', allocationRoutes);

// 8. Servizio dei file statici del frontend React (build in public/)
app.use(express.static(path.join(__dirname, 'public')));

// 9. Fallback SPA: qualsiasi rotta non API rimanda a index.html (essenziale per il routing React)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export default app;
