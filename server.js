import app from './app.js';
import { getApiToken } from './config/auth.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`✨ Portfolio Insights è avviato con successo!`);
  console.log(`🌍 Disponibile all'indirizzo: http://localhost:${PORT}`);

  // Stampa del token API in console se generato automaticamente (non da env).
  // Il token NON viene mai loggato nei log di sistema, solo stampato una volta all'avvio.
  const tokenSource = process.env.API_TOKEN ? 'API_TOKEN' : 'generato automaticamente';
  if (!process.env.API_TOKEN) {
    console.log('==============================================');
    console.log('  🔐 API Token (per accedere all\'applicazione):');
    console.log(`  ${getApiToken()}`);
    console.log('  Salva questo token in un luogo sicuro.');
    console.log('  Puoi configurarlo in modo permanente con la');
    console.log('  variabile d\'ambiente API_TOKEN.');
    console.log('==============================================\n');
  } else {
    console.log(`[auth] API Token configurato tramite ${tokenSource}\n`);
  }
});