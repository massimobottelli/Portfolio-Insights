import { router } from '../router.js';
import { getAssets } from '../database.js';

router.get('/api/assets', (req, res) => {
  const assets = getAssets();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(assets));
});
