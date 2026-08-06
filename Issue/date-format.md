# Bug: `getLatestSnapshot()` restituisce record sbagliato — date in formato M/D/YY non ordinabili cronologicamente

## Descrizione

Il metodo `getLatestSnapshot()` in `models/analyticsModel.js` utilizza `ORDER BY snapshot_date DESC LIMIT 1` per ottenere l'ultimo snapshot di portafoglio. Tuttavia, le date nella tabella `daily_portfolio_snapshots` sono salvate come stringhe nel formato `M/D/YY` (es. `8/6/26`, `9/9/25`), non come date ISO normalizzate. L'ordinamento alfabetico delle stringhe **non corrisponde** all'ordinamento cronologico.

## Impatto

La Dashboard mostra valori errati perché il "Valore Portafoglio" viene letto dallo snapshot sbagliato:

| Valore Reale (DB) | Valore Mostrato (Dashboard) |
|---|---|
| **284.214,53 €** (08/06/2026) | **230.758,56 €** (09/09/2025) |

**Causa:** `'9'` > `'8'` in ordine alfabetico, quindi `09/09/2025` viene considerato "più recente" di `08/06/2026`.

## Conseguenze

Tutti i KPI della Dashboard che dipendono dallo snapshot più recente sono errati:
- **Valore Portafoglio** → mostra 230.758€ invece di 284.214€
- **Profit & Loss** → calcolato su un valore vecchio
- **Rapporto Liquidità/Patrimonio** → distorto
- **Data ultimo aggiornamento** → mostra "09/09/2025" invece di "06/08/2026"
- **`getSnapshotHistory()`** → la serie storica è ordinata alfabeticamente, non cronologicamente

## Riproduzione

1. Avviare il server
2. Chiamare `GET /api/analytics/dashboard`
3. Osservare `portfolioValue = 230758.56` e `snapshotDate = "9/9/25"`
4. Confrontare con il dato raw nel database:
   ```sql
   sqlite3 db/portfolio.db "SELECT snapshot_date, portfolio_value FROM daily_portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 3;"
   ```

## Causa Radice

Il parser `parseDirectaHistoryCSV()` in `utils/csvParser.js` (riga 408) salva la data esattamente come letta dal CSV Directa (`8/6/26`, `9/9/25`) senza normalizzarla in formato ISO (`2026-08-06`, `2025-09-09`).

Lo stesso problema potrebbe interessare anche le tabelle `market_orders` e `cash_movements` (campi `operation_date`, `value_date`).

## Fix Proposto

1. **Parser (`utils/csvParser.js`):** Aggiungere una funzione di normalizzazione delle date che converta `M/D/YY` → `YYYY-MM-DD` in `parseDirectaHistoryCSV()`
2. **Migrazione dati:** Eseguire una query di UPDATE sui 793 record esistenti per convertire le date
3. **Verifica estesa:** Controllare se lo stesso problema esiste in `market_orders` e `cash_movements` e applicare la stessa normalizzazione
4. **Test:** Verificare che `getLatestSnapshot()` ora restituisca il record corretto

## Dati di Riferimento

- **Record totali in `daily_portfolio_snapshots`:** 793
- **Ultimo record corretto:** `8/6/26 | 284214.5329 | 1437.13`
- **Record erroneamente considerato "ultimo":** `9/9/25 | 230758.56 | 680.57`

## Ambiente

- Node.js 22+
- SQLite nativo (`node:sqlite`)
- Database: `db/portfolio.db`