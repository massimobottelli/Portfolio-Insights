import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './database.js';

// Importazione delle rotte per registrarle nell'app Express
import assetRoutes from './routes/assetRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import importRoutes from './routes/importRoutes.js';
import movementRoutes from './routes/movementRoutes.js';

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

// 4. Registrazione delle rotte API
app.use('/api/assets', assetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/movements', movementRoutes);

// 5. Servizio dei file statici del frontend React (build in public/)
app.use(express.static(path.join(__dirname, 'public')));

// 6. Fallback SPA: qualsiasi rotta non API rimanda a index.html (essenziale per il routing React)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export default app;