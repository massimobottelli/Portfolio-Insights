import { router } from '../router.js';

router.post('/api/import', async (req, res) => {
  // Qui inseriremo la logica del parser Directa
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true, message: 'File importato con successo!' }));
});
