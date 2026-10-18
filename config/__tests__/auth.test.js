import { describe, it, expect } from 'vitest';
import { upsertEnvTokenLine } from '../auth.js';

// Test dell'helper puro di upsert della riga API_TOKEN nel file .env:
// nessun I/O reale, verificano le regole documentate in config/auth.js.
describe('upsertEnvTokenLine', () => {
  it('aggiunge API_TOKEN in coda quando assente, preservando il resto del file', () => {
    const input = 'APP_PORT=3000\n\n# commento\nEODHD_API_KEY=abc\n';
    const { content, changed } = upsertEnvTokenLine(input, 'tok1');
    expect(changed).toBe(true);
    expect(content).toBe('APP_PORT=3000\n\n# commento\nEODHD_API_KEY=abc\nAPI_TOKEN=tok1');
  });

  it('valorizza la riga attiva vuota del template (.env.example)', () => {
    const input = 'APP_PORT=3000\nAPI_TOKEN=\nEODHD_API_KEY=abc\n';
    const { content, changed } = upsertEnvTokenLine(input, 'tok2');
    expect(changed).toBe(true);
    expect(content).toBe('APP_PORT=3000\nAPI_TOKEN=tok2\nEODHD_API_KEY=abc\n');
  });

  it('non tocca una riga attiva già valorizzata', () => {
    const input = 'API_TOKEN=token-utente\n';
    const { content, changed } = upsertEnvTokenLine(input, 'tok3');
    expect(changed).toBe(false);
    expect(content).toBe(input);
  });

  it('sostituisce in place la riga commentata (# API_TOKEN=)', () => {
    const input = '# --- Token API ---\n# API_TOKEN=\n\nPORT=3000\n';
    const { content, changed } = upsertEnvTokenLine(input, 'tok4');
    expect(changed).toBe(true);
    expect(content).toBe('# --- Token API ---\nAPI_TOKEN=tok4\n\nPORT=3000\n');
  });

  it('dà precedenza alla riga attiva (anche vuota) su quella commentata', () => {
    const input = '# API_TOKEN=\nAPI_TOKEN=\n';
    const { content, changed } = upsertEnvTokenLine(input, 'tok5');
    expect(changed).toBe(true);
    expect(content).toBe('# API_TOKEN=\nAPI_TOKEN=tok5\n');
  });

  it('commenta le righe attive vuote extra per evitare override a vuoto', () => {
    const input = 'API_TOKEN=\nAPI_TOKEN=\n';
    const { content, changed } = upsertEnvTokenLine(input, 'tok6');
    expect(changed).toBe(true);
    expect(content).toBe('API_TOKEN=tok6\n# API_TOKEN=\n');
  });

  it('gestisce il file vuoto e il contenuto senza newline finale', () => {
    expect(upsertEnvTokenLine('', 'tok7').content).toBe('API_TOKEN=tok7');
    expect(upsertEnvTokenLine('A=1', 'tok8').content).toBe('A=1\nAPI_TOKEN=tok8');
  });

  it('preserva il newline finale', () => {
    const input = 'A=1\nAPI_TOKEN=\n';
    const { content } = upsertEnvTokenLine(input, 'tok9');
    expect(content).toBe('A=1\nAPI_TOKEN=tok9\n');
  });
});