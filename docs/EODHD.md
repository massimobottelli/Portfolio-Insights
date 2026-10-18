# EODHD



## Requisiti e decisioni

1. **Aggiornamento incrementale:** utilizzare EODHD per aggiornare periodicamente i prezzi di mercato.
 3. **Caricamento iniziale dello storico:** lo storico iniziale sarà scaricato manualmente.
4. **Importazione massiva:** creare uno script da eseguire una sola volta (*one-time*) per caricare lo storico iniziale nel database locale.
5. **Strumenti inclusi:** ETF, ETN, ETC e azioni. I BTP sono esclusi dal monitoraggio.
6. **Chiave identificativa dello strumento:** utilizzare il ticker della borsa sulla quale è detenuto l'asset, nel formato `TICKER.EXCHANGE` previsto da EODHD.


## Lista degli asset per ticker ed exchange

| Simbolo EODHD | ISIN | Descrizione |
|---|---|---|
| `IEVL.XETRA` | `IE00BQN1K901` | iShares Edge MSCI Europe Value Factor UCITS ETF Acc |
| `SLS.US` | `US81642T2096` | SELLAS Life Sciences Group Inc. |
| `UIQ4.XETRA` | `IE00BLDGHT92` | UBS Euro Equity Defensive Put |
| `VUAA.XETRA` | `IE00BFMXXD54` | Vanguard S&P 500 UCITS ETF Acc |
| `XEON.XETRA` | `LU0290358497` | Xtrackers II EUR Overnight Rate Swap UCITS ETF |
| `EXUS.XETRA` | `IE0006WW1TQ4` | Xtrackers MSCI World ex USA UCITS ETF |
| `DBMFE.PA` | `LU2951555403` | iMGP DBi Managed Futures Fund R EUR UCITS |
| `SXRS.XETRA` | `IE00BDFL4P12` | iShares Diversified Commodity Swap UCITS ETF |

*Nota: i simboli EODHD riportati devono essere verificati rispetto al catalogo ufficiale e ai rispettivi ISIN prima dell'utilizzo in produzione.*

## API scarico storico un anno per ticker

```http
https://eodhd.com/api/eod/TICKET_EXCHANGE?api_token=YOUR_API_KEY&from=2025-10-18&to=2026-10-18&period=d&fmt=json
```

## API key

`6ad48a3fcf7100.83868425`

