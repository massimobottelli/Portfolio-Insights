import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // I test condividono lo stesso file SQLite (db/portfolio.db): l'esecuzione
    // parallela dei file di test causava errori "database is locked" sporadici.
    fileParallelism: false,
  },
});