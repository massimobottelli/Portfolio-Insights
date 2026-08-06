import app from './app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`✨ Portfolio Insights è avviato con successo!`);
  console.log(`🌍 Disponibile all'indirizzo: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});