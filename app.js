import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './database.js';

// Importazione delle rotte per registrarle nell'app Express
import assetRoutes from './routes/assetRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import importRoutes from './routes/importRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Inizializzazione del Database prima di configurare Express
initializeDatabase();

// 2. Creazione dell'app Express
const app = express();

// 3. Middleware nativi di Express
app.use(express.json()); // Parsing automatico dei body JSON
app.use(express.urlencoded({ extended: true })); // Parsing dei form urlencoded

// 4. Registrazione delle rotte API
app.use('/api/assets', assetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/import', importRoutes);

// 5. Servizio dei file statici del frontend React (build in public/)
app.use(express.static(path.join(__dirname, 'public')));

// 6. Fallback SPA: qualsiasi rotta non API rimanda a index.html (essenziale per il routing React)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export default app;