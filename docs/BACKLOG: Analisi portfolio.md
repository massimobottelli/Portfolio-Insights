# BACKLOG: Analisi portfolio

## Feature: Analisi rischio e rendimento del portafoglio

**Obiettivo:** aggiungere una sezione dedicata all'analisi quantitativa della performance del portafoglio, utilizzando lo storico di `daily_portfolio_snapshots` e, dove necessario, i movimenti di capitale. Non è necessario introdurre nuove tabelle persistenti: il repository specifica già che le metriche analitiche vengono calcolate a runtime.

---

## 1. KPI principali

La nuova sezione deve mostrare:

- **CAGR** — rendimento annuo composto dall'inizio del periodo selezionato.
- **Volatilità annualizzata** — deviazione standard dei rendimenti periodici annualizzata.
- **Sharpe Ratio** — rendimento in eccesso rispetto al risk-free diviso per la volatilità.
- **Rendimento nominale** — rendimento senza correzione per inflazione.
- **Rendimento reale** — rendimento corretto per l'inflazione.
- **Max Drawdown** — massima perdita percentuale da un precedente massimo.
- **Tempo massimo di recupero** — tempo necessario per tornare al precedente massimo dopo un drawdown.

Ogni KPI deve indicare chiaramente periodo analizzato e frequenza utilizzata per il calcolo.

---

## 2. Periodo di analisi

La feature deve supportare gli stessi periodi già utilizzati dalla Dashboard:

- 1M
- 3M
- 6M
- 1Y
- YTD
- All

In aggiunta, sarebbe utile prevedere:

- data iniziale personalizzata
- data finale personalizzata

Il filtro selezionato deve essere applicato a tutte le metriche e ai grafici, evitando che, per esempio, il CAGR venga calcolato sull'intero storico mentre il drawdown viene calcolato sull'ultimo anno.

---

## 3. Serie di rendimento

Il motore analitico deve costruire una serie temporale di rendimenti dal valore degli snapshot.

Per ogni periodo:

```
return_t = value_t / value_(t-1) - 1
```

Bisogna però tenere conto dei cash flow esterni al portafoglio. Il repository dispone già di `cash_movements` e utilizza i depositi per il calcolo TWR.

Quindi il requisito fondamentale è:

> I versamenti e i prelievi non devono essere interpretati come rendimento dell'investimento.

Dove possibile, il calcolo deve quindi riutilizzare la logica TWR già presente invece di introdurre una seconda logica indipendente.

---

## 4. Volatilità / deviazione standard

**Requisito:** calcolare la deviazione standard dei rendimenti periodici e annualizzarla.

Se si utilizzano rendimenti mensili:

```
volatilità annualizzata = std(monthly_returns) × √12
```

Se si utilizzano rendimenti giornalieri:

```
volatilità annualizzata = std(daily_returns) × √252
```

**Decisione consigliata:** utilizzare i rendimenti mensili per le metriche di lungo periodo. Questo rende la volatilità più leggibile e soprattutto coerente con l'analisi dei rendimenti mensili.

**UI:**

```
Volatilità annualizzata
12,84%
```

**Tooltip:**

> Deviazione standard dei rendimenti mensili annualizzata.

---

## 5. Sharpe Ratio

Calcolare:

```
Sharpe = (Rendimento annualizzato - Risk Free Rate) / Volatilità annualizzata
```

Deve essere configurabile il Risk Free Rate.

Per la prima versione consiglio:

- default: 0%
- parametro configurabile successivamente
- visualizzazione del valore utilizzato

Esempio:

```
Sharpe Ratio
0,87

Risk-free: 0,00%
```

È importante non hardcodare un tasso risk-free implicito, perché renderebbe il risultato difficile da interpretare e riprodurre.

---

## 6. CAGR

Calcolare il rendimento annuo composto:

```
CAGR = (end_value / start_value) ^ (1 / years) - 1
```

dove:

```
years = giorni_trascorsi / 365.25
```

Il CAGR deve essere mostrato solo quando il periodo è sufficientemente significativo.

Per periodi inferiori a un anno:

- oppure mostrare il CAGR annualizzato;
- oppure, preferibilmente, mostrare N/A quando il periodo è troppo breve per essere statisticamente significativo.

**Decisione consigliata:** calcolarlo comunque matematicamente, ma mostrare un tooltip che specifichi il periodo effettivo.

---

## 7. Rendimenti annuali

Creare una tabella contenente tutti gli anni disponibili:

| Anno | Rendimento |
|------|------------|
| 2026 | +8,42%     |
| 2025 | +14,31%    |
| 2024 | -3,72%     |
| 2023 | +11,08%    |

Requisiti:

- ordinamento dal migliore al peggiore;
- rendimento positivo visualizzato distintamente dal negativo;
- anni incompleti marcati come tali;
- non confondere anno solare con YTD.

**Grafico:** aggiungere un bar chart con:

- asse X → anno
- asse Y → rendimento %
- barra sopra/sotto lo zero
- ordinamento dal migliore al peggiore

Recharts è già presente nel frontend, quindi non è necessario introdurre una nuova libreria di chart.

---

## 8. Rendimenti mensili

Creare analoga analisi mensile.

Esempio:

| Mese          | Rendimento |
|---------------|------------|
| Marzo 2025    | +6,21%     |
| Novembre 2024 | +4,87%     |
| …             | …          |
| Agosto 2025   | -5,43%     |

Requisiti:

- tutti i mesi disponibili;
- ordinamento dal migliore al peggiore;
- possibilità di distinguere positivi/negativi;
- mese incompleto identificabile;
- rendimento calcolato in maniera coerente con TWR/cash flow.

**Grafico:** bar chart:

```
Rendimento mensile
        █
   █    █
───┼────┼───────
   █
```

Con ordinamento:

```
migliore
   ↓
peggiore
```

---

## 9. Mesi positivi / negativi

Mostrare KPI:

```
Mesi positivi     74
Mesi negativi     38
Mesi flat          5
```

Aggiungerei anche i mesi flat, anche se non erano esplicitamente richiesti, perché evita che:

```
positivi + negativi != totale mesi
```

Requisiti:

- `positive_months`
- `negative_months`
- `flat_months`
- `total_months`

Definizione:

- `positive > 0`
- `negative < 0`
- `flat = 0`

Eventualmente prevedere una soglia epsilon per evitare problemi numerici.

---

## 10. Anni positivi / negativi

Stessa logica:

```
Anni positivi    7
Anni negativi    2
Anni flat        0
```

Gli anni parziali devono essere identificabili.

Per esempio:

```
2026 YTD
```

non deve essere presentato graficamente come se fosse un anno completo.

---

## 11. Rendimento nominale vs rendimento reale

Questa è una delle parti che richiede maggiore attenzione.

**Nominale:** il rendimento nominale è quello effettivamente ottenuto dal portafoglio:

```
R_nominale
```

**Reale:** il rendimento reale deve essere corretto per l'inflazione:

```
R_reale = (1 + R_nominale) / (1 + R_inflazione) - 1
```

Non:

```
R_nominale - inflazione
```

se si vuole un calcolo finanziariamente corretto.

**Requisito dati:** serve una fonte per i dati di inflazione.

Poiché l'applicazione è attualmente progettata per funzionare offline dopo l'importazione, suggerisco di non introdurre una chiamata API obbligatoria nella prima implementazione.

Possibili modalità:

1. dataset inflazione locale;
2. import CSV;
3. configurazione manuale;
4. futura API opzionale.

La soluzione più coerente con il progetto è: mantenere l'app offline e aggiungere una configurazione/dataset locale per l'inflazione.

Per l'Italia, la serie dovrebbe essere coerente con la valuta e con il mercato di riferimento del portafoglio.

---

## 12. Drawdown

Creare una serie di drawdown a partire dal valore cumulato del portafoglio.

Per ogni punto:

```
peak_t = max(value_0 ... value_t)
drawdown_t = (value_t / peak_t) - 1
```

Esempio:

```
Portfolio
       /\        /\
      /  \      /  \
     /    \____/    \

Drawdown
       0%
        \        /
         \______/
           -18%
```

**KPI:** mostrare:

```
Max Drawdown
-18,42%
```

e la relativa data.

---

## 13. Tempo di recupero

Per ogni drawdown significativo bisogna identificare:

1. data del precedente massimo;
2. data del minimo;
3. data del recupero;
4. durata del drawdown;
5. durata del recupero.

Esempio:

```
Peak       15/02/2022
Trough     20/10/2022
Recovery   12/05/2023

Drawdown   -21,4%
Recovery   204 giorni
```

**KPI:** mostrare almeno:

```
Tempo massimo di recupero
204 giorni
```

Aggiungerei anche:

```
Tempo attuale di recupero
123 giorni
```

se il portafoglio si trova ancora sotto il precedente massimo.

Questo è molto utile perché distingue:

- drawdown storico già recuperato;
- drawdown attualmente aperto.

---

## 14. Grafico Drawdown

Aggiungere un grafico temporale:

- X → data
- Y → drawdown %
- linea che parte da 0%;
- valori sotto zero;
- evidenziare il massimo drawdown;
- tooltip con data e valore.

Questo grafico dovrebbe essere temporale, non ordinato per grandezza, perché il rapporto temporale è fondamentale.

---

## 15. API backend

Seguendo l'architettura MVC esistente:

```
React
  ↓
Express Route
  ↓
Controller
  ↓
Models / SQLite
  ↓
Analytics Engine
```

Il repository separa già route, controller, model e utility.

Suggerisco di introdurre un modulo dedicato:

```
utils/
  analytics/
    returns.js
    volatility.js
    sharpe.js
    cagr.js
    drawdown.js
    inflation.js
    performance.js
```

oppure, ancora meglio, un unico service:

```
services/
  portfolioAnalytics.js
```

con funzioni pure:

```
calculateReturns()
calculateVolatility()
calculateSharpe()
calculateCagr()
calculateAnnualReturns()
calculateMonthlyReturns()
calculateDrawdowns()
calculateRecoveryPeriods()
calculateRealReturns()
```

In questo modo la logica finanziaria rimane separata dai controller HTTP.

---

## 16. Endpoint proposto

Un endpoint principale sarebbe sufficiente:

```
GET /api/analytics/performance
```

Parametri:

```
?from=2020-01-01
&to=2026-08-10
&riskFreeRate=0
```

Response concettuale:

```json
{
  "period": {
    "from": "2020-01-01",
    "to": "2026-08-10"
  },
  "summary": {
    "cagr": 0.0842,
    "volatility": 0.1284,
    "sharpe": 0.87,
    "nominalReturn": 0.674,
    "realReturn": 0.412,
    "maxDrawdown": -0.1842,
    "maxRecoveryDays": 204
  },
  "monthlyReturns": [],
  "annualReturns": [],
  "drawdowns": [],
  "positiveNegative": {
    "months": {},
    "years": {}
  }
}
```

I valori sono solo struttura d'esempio, non risultati reali.

---

## 17. Frontend

Aggiungere una nuova pagina:

```
Analytics
```

oppure una nuova sezione della Dashboard.

Io preferirei una pagina separata:

```
Dashboard
Portfolio
Analytics   ← nuova
Movimenti
Import
```

Perché la quantità di informazioni è significativa.

Layout suggerito:

```
┌──────────────────────────────────────────────────────┐
│ Analisi Performance                    [All ▼]       │
├────────────┬────────────┬────────────┬───────────────┤
│ CAGR       │ Volatilità │ Sharpe     │ Max Drawdown  │
│ 8,42%      │ 12,84%     │ 0,87       │ -18,42%      │
├────────────┴────────────┴────────────┴───────────────┤
│                                                      │
│ Drawdown                                             │
│                                                      │
├──────────────────────────────────────────────────────┤
│ Rendimenti annuali                                   │
│ █                                                   │
│ █       █                                           │
│─────────┼────────────────                            │
├──────────────────────────────────────────────────────┤
│ Rendimenti mensili                                  │
│                                                      │
├────────────────────────┬─────────────────────────────┤
│ Mesi positivi          │ Anni positivi              │
│ 74 / 117               │ 7 / 9                     │
├────────────────────────┴─────────────────────────────┤
│ Nominale              │ Reale                        │
│ +67,4%                │ +41,2%                       │
└──────────────────────────────────────────────────────┘
```

---

## 18. Test obbligatori

Questa feature richiede test particolarmente rigorosi perché piccoli errori nei calcoli possono produrre risultati finanziari errati.

Creare test unitari per:

**CAGR**

- rendimento positivo;
- perdita;
- periodo esattamente 1 anno;
- periodo inferiore a 1 anno;
- valore iniziale zero/null.

**Volatilità**

- tutti i rendimenti uguali → volatilità 0;
- rendimenti positivi/negativi;
- serie con un solo dato;
- annualizzazione.

**Sharpe**

- volatilità zero;
- risk-free zero;
- risk-free positivo;
- rendimento inferiore al risk-free.

**Drawdown**

- portafoglio sempre crescente → 0%;
- un singolo drawdown;
- più drawdown;
- nuovo massimo dopo drawdown;
- drawdown ancora aperto.

**Recovery**

- recupero immediato;
- recupero dopo N giorni;
- drawdown non ancora recuperato;
- più drawdown consecutivi.

**Cash flow**

Test fondamentale:

```
Giorno 1: €10.000
Giorno 2: deposito €5.000
Giorno 3: €15.000
```

Il sistema non deve interpretare il deposito come +50% di rendimento.

Questo è particolarmente importante perché l'applicazione già basa il TWR sui sottoperiodi delimitati dai depositi.

---

## 19. Acceptance criteria

La feature può essere considerata completata quando:

- [ ] È disponibile una nuova sezione Analisi.
- [ ] È possibile selezionare il periodo di analisi.
- [ ] Viene mostrato il CAGR.
- [ ] Viene mostrata la volatilità annualizzata.
- [ ] Viene mostrato lo Sharpe Ratio.
- [ ] Il risk-free rate è esplicitamente configurabile/documentato.
- [ ] Sono mostrati rendimento nominale e reale.
- [ ] L'inflazione utilizzata è identificabile dall'utente.
- [ ] Sono mostrati i rendimenti di tutti gli anni disponibili.
- [ ] Gli anni sono ordinabili dal migliore al peggiore.
- [ ] È presente il bar chart dei rendimenti annuali.
- [ ] Sono mostrati tutti i rendimenti mensili.
- [ ] I mesi sono ordinabili dal migliore al peggiore.
- [ ] È presente il bar chart dei rendimenti mensili.
- [ ] Sono mostrati mesi positivi, negativi e flat.
- [ ] Sono mostrati anni positivi, negativi e flat.
- [ ] È calcolato il Max Drawdown.
- [ ] È mostrata la data del Max Drawdown.
- [ ] È calcolato il tempo di recupero.
- [ ] È identificato un eventuale drawdown ancora aperto.
- [ ] È presente il grafico temporale del drawdown.
- [ ] Versamenti e prelievi non vengono contabilizzati come performance.
- [ ] Tutti i calcoli hanno test automatici.
- [ ] I dati non vengono persistiti nel database.
- [ ] L'implementazione mantiene il funzionamento offline dell'applicazione.
- [ ] La UI è responsive.
- [ ] Le metriche mostrano tooltip/descrizioni delle formule utilizzate.

---

## Struttura della feature

In termini di sviluppo la dividerei in 5 task principali:

1. **Analytics Engine**
   - returns
   - CAGR
   - volatility
   - Sharpe
   - nominal/real return
   - drawdown/recovery

2. **Backend API**
   - `GET /api/analytics/performance`

3. **Frontend Analytics Page**
   - KPI
   - annual returns
   - monthly returns
   - drawdown

4. **Inflation / configuration**
   - dataset + metodologia

5. **Test**
   - unit
   - cash flow
   - edge cases

Una scelta progettuale che farei subito: non implementerei queste metriche come calcoli indipendenti direttamente nei componenti React. Creerei un Analytics Engine backend riutilizzabile, perché in futuro permetterebbe facilmente di aggiungere Sortino Ratio, Calmar Ratio, downside deviation, best/worst month, rolling volatility, rolling Sharpe e confronto con benchmark.

Il punto chiave è che il repository è già predisposto per questo approccio: SQLite conserva gli snapshot e i fatti finanziari, mentre performance e allocazione sono già calcolate a runtime.

---

## Valutare per futuro

- [ ] (3) Supporto multi utente: registrazione e login, profilo utente, isolamento dati.

---

## Modalità Focus

Understand the request → do exactly what was requested → make the minimum necessary changes → stop.

You are working on a task with a strict scope contract:

1. Implement exactly what the user asked for. Nothing more.
2. Do not refactor code that is not directly relevant to the request.
3. Do not "improve" or "fix" unrelated things you notice along the way.
4. If you believe a change outside the request is necessary, state it as a suggestion at the end — do not perform it.
5. Minimum necessary changes, smallest possible diff.