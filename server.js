import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { initializeDatabase } from './database.js';
import { router } from './router.js';

// Importazione delle rotte per registrarle nel router nativo
import './routes/assets.js';
import './routes/imports.js';

const PORT = 3000;

try {
  // 1. Inizializzazione asincrona del Database prima di avviare il server
  initializeDatabase();

  // 2. Creazione del Server HTTP nativo
  const server = http.createServer(async (req, res) => {
    // Gestione della sicurezza CORS (utile se sviluppi il frontend su una porta diversa in dev)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // Prova a gestire la richiesta tramite il Router API nativo
    const handled = await router.handle(req, res);
    if (handled) return;

    // Se non è una rotta API, serve i file statici del frontend React (SPA)
    let filePath = path.join(process.cwd(), 'public', req.url === '/' ? 'index.html' : req.url);
    
    fs.readFile(filePath, (err, content) => {
      if (err) {
        // Se un file specifico non viene trovato, rimandiamo all'index.html (essenziale per il routing React SPA)
        const indexPath = path.join(process.cwd(), 'public', 'index.html');
        fs.readFile(indexPath, (indexErr, indexContent) => {
          if (indexErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Risorsa non trovata');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexContent);
          }
        });
      } else {
        const ext = path.extname(filePath);
        const contentType = getContentType(ext);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });

  // 3. Avvio del Server in ascolto
  server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`✨ Portfolio Insights è avviato con successo!`);
    console.log(`🌍 Disponibile all'indirizzo: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
  });

} catch (error) {
  console.error('❌ Errore fatale all\'avvio del server:', error);
  process.exit(1);
}

/**
 * Helper per mappare le estensioni dei file ai corretti Content-Type HTTP
 */
function getContentType(ext) {
  const map = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'application/octet-stream';
}
