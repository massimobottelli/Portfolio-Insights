import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { router } from './router.js';

// Registriamo le rotte importando i file dedicati
import './routes/assets.js';
import './routes/imports.js';

const PORT = 3000;

const server = http.createServer(async (req, res) => {
  // 1. Prova a gestire la richiesta tramite le API registrate nel Router
  const handled = await router.handle(req, res);
  if (handled) return;

  // 2. Se non è una rotta API, serve l'applicazione React statica
  let filePath = path.join(process.cwd(), 'public', req.url === '/' ? 'index.html' : req.url);
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Risorsa non trovata');
    } else {
      const ext = path.extname(filePath);
      const contentType = ext === '.js' ? 'text/javascript' : ext === '.css' ? 'text/css' : 'text/html';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => console.log(`🚀 Server in ascolto su http://localhost:${PORT}`));
