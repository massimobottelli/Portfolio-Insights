# Performance & Risk Analytics — Design Document

## 1. Obiettivo

Introdurre in **Portfolio Insights** una nuova sezione di analisi della performance e del rischio del **portafoglio complessivo**, senza analisi storica per singolo asset/asset class e senza rendimento reale rispetto all'inflazione.

La nuova funzionalità deve calcolare e visualizzare:

* volatilità / deviazione standard annualizzata;
* Sharpe ratio con **risk-free rate configurabile dall'utente**;
* CAGR;
* rendimenti cumulativi;
* rendimenti annuali;
* rendimenti mensili;
* numero e percentuale di mesi positivi/negativi;
* numero e percentuale di anni positivi/negativi;
* miglior/peggior mese;
* miglior/peggior anno;
* maximum drawdown;
* durata del drawdown;
* tempo di recupero dal drawdown;
* curva cumulativa della performance.

La funzionalità deve utilizzare i dati finanziari già presenti nel database e mantenere il principio architetturale del progetto: **i dati importati da Directa vengono persistiti, mentre le metriche analitiche vengono calcolate a runtime**. Il repository documenta infatti `daily_portfolio_snapshots` come fonte degli snapshot giornalieri e specifica che performance e TWR non vengono persistiti.

---

# 2. Scope

## Incluso

### Performance

* TWR cumulativo;
* CAGR;
* rendimenti giornalieri intermedi;
* rendimenti mensili;
* rendimenti annuali;
* conteggio periodi positivi/negativi;
* best/worst period.

### Risk

* deviazione standard;
* volatilità annualizzata;
* Sharpe ratio;
* maximum drawdown;
* durata del drawdown;
* recovery time.

### UI

* pagina/sezione Performance & Risk;
* KPI principali;
* grafico performance cumulativa;
* grafico rendimenti annuali;
* grafico rendimenti mensili;
* sezione rischio;
* analisi drawdown;
* configurazione risk-free rate.

## Escluso

* analisi per singolo asset;
* analisi per asset class;
* rendimento reale al netto dell'inflazione;
* importazione automatica di dati di inflazione;
* importazione automatica di risk-free rate;
* benchmark comparison;
* CAPM;
* beta;
* alpha;
* VaR;
* Monte Carlo;
* persistence delle metriche calcolate.

---

# 3. Principio architetturale

La nuova funzionalità deve essere costruita sopra una **serie temporale normalizzata dei rendimenti del portafoglio**.

Il flusso concettuale deve essere:

```text
daily_portfolio_snapshots
          +
cash_movements
          ↓
   portfolio return series
          ↓
 ┌────────┼─────────┬──────────┐
 ↓        ↓         ↓          ↓
CAGR   Volatility  Sharpe   Drawdown
 ↓        ↓         ↓          ↓
Annual  Monthly   Risk-free  Recovery
returns returns     rate       time
```

Questo è il punto centrale del design.

Non implementare ogni metrica direttamente interrogando SQLite. Creare prima una funzione/motore che costruisca una **canonical return series**, poi usare quella serie per tutte le metriche.

Questo riduce drasticamente il rischio di avere formule incoerenti tra dashboard, CAGR, volatilità e drawdown.

---

# 4. Dati disponibili

Il database contiene:

* `daily_portfolio_snapshots`
* `cash_movements`
* `market_orders`
* `assets`
* `asset_prices`

La tabella `daily_portfolio_snapshots` contiene la serie storica del valore del portafoglio; `cash_movements` contiene movimenti quali conferimenti, commissioni, dividendi e tasse. Il repository indica inoltre che i calcoli analitici vengono generati a runtime.

Per questa feature le fonti primarie saranno:

### `daily_portfolio_snapshots`

Utilizzare:

* `snapshot_date`
* `portfolio_value`
* eventuali altri campi già utilizzati dall'attuale implementazione TWR.

### `cash_movements`

Utilizzare i movimenti che rappresentano **external cash flows** ai fini del rendimento.

È fondamentale non considerare ogni movimento di cassa come un deposito: commissioni, tasse e dividendi hanno un significato economico diverso.

Prima dell'implementazione verificare nel codice esistente l'attuale classificazione dei `movement_type` e riutilizzare la stessa semantica dove corretta.

---

# 5. Canonical Return Series

## 5.1 Obiettivo

Creare una struttura interna del tipo:

```ts
interface PortfolioReturnPoint {
  date: string;
  portfolioValue: number;
  externalFlow: number;
  periodReturn: number;
  cumulativeReturn: number;
}
```

La serie deve essere ordinata cronologicamente.

Esempio:

```text
date        value     flow      return
2024-01-01  10000     0          -
2024-01-02  10020     0         0.20%
2024-01-03  10520   500         0.00%
2024-01-04  10580     0         0.57%
```

Il versamento di €500 non deve diventare artificialmente un +5%.

---

# 6. TWR e period returns

L'applicazione dispone già del calcolo TWR e il README descrive il metodo come TWR con sottoperiodi delimitati dai depositi.

Il nuovo motore deve **riutilizzare o refactorizzare l'implementazione TWR esistente**, evitando due algoritmi indipendenti per la stessa informazione.

Per ogni sottoperiodo:

```text
periodReturn =
(endValue - externalFlow - startValue)
/
startValue
```

oppure la formula equivalente già adottata dal codice esistente, dopo aver verificato la semantica dei flussi.

Il risultato finale deve essere una sequenza di period returns concatenabili.

### Requisito importante

Non assumere che ogni snapshot consecutivo rappresenti necessariamente un periodo finanziariamente indipendente.

I flussi esterni devono essere trattati come boundary del TWR.

---

# 7. Frequenza della serie

La serie primaria deve rimanere **giornaliera**, quando gli snapshot disponibili lo consentono.

Da questa serie derivare:

* daily returns;
* monthly returns;
* annual returns.

Non calcolare volatilità o Sharpe direttamente sulla serie mensile se è disponibile una serie giornaliera.

Questo permette una granularità coerente e rende possibile l'annualizzazione.

---

# 8. Volatilità

## Formula

Calcolare la deviazione standard dei rendimenti giornalieri:

```text
dailyStdDev = stddev(dailyReturns)
```

Annualizzare:

```text
annualizedVolatility = dailyStdDev × sqrt(365)
```

### Convenzione

La scelta deve essere centralizzata:

```ts
const ANNUALIZATION_FACTOR = Math.sqrt(365);
```

e non duplicata nei vari calcoli.

### Output

```ts
volatility: {
  daily: number;
  annualized: number;
}
```

---

# 9. Sharpe Ratio

Lo Sharpe ratio deve essere configurabile dall'utente tramite un **risk-free rate annuale**.

UI:

```text
Risk-free rate
[ 2.50 % ]
```

Default consigliato:

```text
0.00%
```

ma il valore deve essere esplicitamente visibile all'utente.

## Formula

Convertire il risk-free annuale in rendimento coerente con la frequenza giornaliera:

```text
dailyRf = (1 + annualRf)^(1 / 365) - 1
```

Poi:

```text
excessDailyReturn =
dailyPortfolioReturn - dailyRf
```

e:

```text
Sharpe =
mean(excessDailyReturns)
/
stddev(dailyPortfolioReturns)
× sqrt(365)
```

### Alternativa

È accettabile una formulazione equivalente basata sul rendimento medio annualizzato, purché:

* risk-free e portfolio return siano espressi sulla stessa base temporale;
* l'annualizzazione sia coerente;
* il comportamento sia documentato e testato.

### Validazione

Il risk-free rate deve:

* essere numerico;
* essere espresso in percentuale nella UI;
* poter essere `0`;
* non essere NaN;
* avere un range ragionevole, ad esempio `-100% < rate < +100%`.

---

# 10. CAGR

Il CAGR deve essere calcolato utilizzando il rendimento cumulativo TWR e la durata effettiva dell'investimento.

Formula:

```text
CAGR = (1 + cumulativeTWR) ^ (1 / years) - 1
```

Dove:

```text
years = elapsedDays / 365.2425
```

oppure una convenzione equivalente basata sulle date reali.

Non usare semplicemente:

```text
numberOfSnapshots / 365
```

perché gli snapshot possono avere buchi.

### Caso edge

Se il periodo è inferiore a un anno, il CAGR può essere mostrato comunque come annualizzazione matematica, ma la UI dovrebbe indicare che il periodo storico è inferiore a 1 anno.

---

# 11. Rendimenti annuali

Aggregare i daily period returns per anno tramite compounding:

```text
annualReturn =
Π(1 + dailyReturn) - 1
```

Non sommare semplicemente le percentuali.

Output:

```ts
interface AnnualReturn {
  year: number;
  return: number;
}
```

Esempio:

```text
2022  -8.31%
2023  +14.27%
2024  +9.81%
2025  +11.42%
```

---

# 12. Rendimenti mensili

Stessa logica degli annuali.

Raggruppare per:

```text
YYYY-MM
```

e comporre:

```text
monthlyReturn =
Π(1 + dailyReturn) - 1
```

Output:

```ts
interface MonthlyReturn {
  year: number;
  month: number;
  return: number;
}
```

Questo dataset alimenterà sia:

* grafico a barre;
* heatmap mensile.

---

# 13. Positive / Negative periods

Per ogni rendimento mensile:

```text
return > 0 → positive
return < 0 → negative
return === 0 → flat
```

Calcolare:

```ts
{
  positive: number;
  negative: number;
  flat: number;
  total: number;
  positiveRate: number;
  negativeRate: number;
}
```

Ripetere lo stesso per gli anni.

### Non classificare lo zero come negativo.

---

# 14. Best / Worst period

Calcolare:

```text
bestMonth
worstMonth
bestYear
worstYear
```

con:

```ts
{
  period: string;
  return: number;
}
```

Se esistono più periodi con lo stesso rendimento, utilizzare il primo cronologicamente oppure documentare una scelta deterministica.

---

# 15. Cumulative performance curve

Creare una serie:

```text
cumulativeValue[0] = 1

cumulativeValue[n] =
cumulativeValue[n-1] × (1 + return[n])
```

Per visualizzazione può essere normalizzata a 100:

```text
normalizedValue = cumulativeValue × 100
```

Esempio:

```text
100
103
101
108
115
112
121
```

Questa serie deve essere utilizzata anche per il drawdown.

---

# 16. Maximum Drawdown

Per ogni punto:

```text
runningPeak[t] = max(cumulativeValue[0...t])
```

Poi:

```text
drawdown[t] =
cumulativeValue[t] / runningPeak[t] - 1
```

Il maximum drawdown è:

```text
maxDrawdown = min(drawdown[t])
```

Output:

```ts
interface DrawdownStats {
  maxDrawdown: number;
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null;
  durationDays: number;
  recoveryDays: number | null;
  isRecovered: boolean;
}
```

---

# 17. Drawdown duration

Distinguere due concetti:

### Drawdown duration

Tempo dal peak al recupero del precedente peak.

### Recovery time

Tempo dal trough al recupero del precedente peak.

Esempio:

```text
Peak
  │
  │  start drawdown
  ↓
  ────────╲
           ╲
            ╲ trough
             ╲
              ╲
               ─────────── Peak recovered
```

Quindi:

```text
drawdownDuration =
recoveryDate - peakDate

recoveryTime =
recoveryDate - troughDate
```

La UI deve preferibilmente mostrare entrambi.

---

# 18. Drawdown non recuperato

Se l'ultimo snapshot è ancora sotto il precedente peak:

```text
recoveryDate = null
isRecovered = false
```

Non inventare una recovery date.

Mostrare invece:

```text
Recovery: ongoing
Duration: 184 days
```

---

# 19. Metriche di drawdown aggiuntive

Sebbene non richieste esplicitamente, il motore dovrebbe poter produrre:

* current drawdown;
* maximum drawdown;
* drawdown start;
* trough;
* recovery;
* current drawdown duration.

Questo non richiede nuove sorgenti dati ed è utile per la UI.

Non è invece necessario implementare in questa feature:

* Ulcer Index;
* average drawdown;
* top-N drawdowns.

---

# 20. Backend architecture

Seguire l'architettura MVC già presente:

```text
models/
controllers/
routes/
client/
```

Il repository documenta attualmente il flusso:

```text
React
  ↕
Express Router
  ↕
Controllers
  ↕
Models / SQLite
```

## Nuovo modulo consigliato

Creare:

```text
models/performanceModel.js
```

oppure, se il progetto preferisce mantenere tutta la logica analytics esistente nello stesso modulo:

```text
models/analyticsModel.js
```

La soluzione preferita è un modulo separato se `analyticsModel.js` è già diventato troppo grande.

Responsabilità:

```text
loadPortfolioSnapshots()
loadCashFlows()
buildReturnSeries()
calculatePerformanceMetrics()
calculateRiskMetrics()
calculateDrawdown()
```

---

# 21. Service/API design

Endpoint consigliato:

```http
GET /api/analytics/performance
```

Parametri:

```text
?from=2020-01-01
&to=2026-08-18
&riskFreeRate=2.5
```

Tutti i parametri temporali devono essere opzionali se l'applicazione supporta già il filtro `All`.

### Response

```json
{
  "period": {
    "from": "2020-01-01",
    "to": "2026-08-18",
    "days": 2412
  },
  "riskFreeRate": 0.025,
  "performance": {
    "cumulativeReturn": 0.7421,
    "cagr": 0.0834
  },
  "risk": {
    "dailyVolatility": 0.0071,
    "annualizedVolatility": 0.1127,
    "sharpeRatio": 0.71
  },
  "periodStats": {
    "months": {
      "positive": 48,
      "negative": 19,
      "flat": 2,
      "total": 69,
      "positiveRate": 0.6957
    },
    "years": {
      "positive": 5,
      "negative": 1,
      "flat": 0,
      "total": 6,
      "positiveRate": 0.8333
    }
  },
  "bestWorst": {
    "month": {
      "best": 0.083,
      "worst": -0.062
    },
    "year": {
      "best": 0.172,
      "worst": -0.091
    }
  },
  "drawdown": {
    "current": -0.034,
    "maximum": -0.1824,
    "peakDate": "2024-03-15",
    "troughDate": "2024-10-31",
    "recoveryDate": "2025-06-12",
    "durationDays": 454,
    "recoveryDays": 224,
    "isRecovered": true
  },
  "annualReturns": [],
  "monthlyReturns": [],
  "cumulativeSeries": []
}
```

I nomi effettivi devono essere adattati alle convenzioni già presenti nel progetto.

---

# 22. Frontend

Aggiungere una nuova pagina o sezione:

```text
Performance & Risk
```

La Dashboard esistente contiene già KPI, TWR e grafico storico; la nuova funzionalità deve quindi evitare di duplicare inutilmente gli elementi già presenti.

## Layout proposto

### Sezione 1 — Performance

```text
┌────────────┬────────────┬────────────┬────────────┐
│ Cumulative │ CAGR       │ Best Year  │ Worst Year │
│ +74.2%     │ 8.34%      │ +17.2%     │ -9.1%      │
└────────────┴────────────┴────────────┴────────────┘
```

### Sezione 2 — Cumulative performance

Line chart:

```text
Performance
125 ┤                   ╭───
115 ┤             ╭─────╯
105 ┤       ╭─────╯
100 ┼───────╯
```

---

# 23. Annual returns chart

Bar chart:

```text
       █
 █     █       █
 █  █  █   █   █
────────────────────
2022 23  24  25  26
```

* positivo sopra lo zero;
* negativo sotto lo zero;
* tooltip con valore esatto;
* asse zero sempre visibile.

Il frontend usa già **Recharts**, quindi utilizzare i componenti esistenti invece di introdurre una nuova libreria di charting.

---

# 24. Monthly returns

Preferenza: **heatmap annuale/mensile**.

```text
       Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec
2024   +   +   -   +   +   -   +   +   -   +   +   +
2025   +   -   +   +   +   +   -   +   +   +   -   +
2026   -   +   +   +   ...
```

Tooltip:

```text
March 2025
Return: +3.42%
```

Se una heatmap non è facilmente realizzabile con i componenti Recharts già presenti, utilizzare un grid CSS/React invece di aggiungere una nuova dipendenza.

---

# 25. Risk section

```text
┌──────────────────────────────────────────────┐
│ Risk                                         │
│                                              │
│ Volatility       11.73%                      │
│ Sharpe            0.71                        │
│ Max Drawdown    -18.24%                      │
│ Recovery          224 days                    │
│                                              │
│ Risk-free rate   [ 2.50 % ]                  │
└──────────────────────────────────────────────┘
```

Quando l'utente modifica il risk-free rate:

* non modificare il database;
* ricalcolare Sharpe lato server oppure lato client se l'architettura esistente lo rende appropriato;
* aggiornare immediatamente il risultato.

Preferenza: **calcolo backend**, per mantenere una singola implementazione delle formule.

---

# 26. Input risk-free rate

Il risk-free rate è un parametro analitico, non un fatto finanziario importato.

Quindi **non deve essere salvato in SQLite** nella prima versione.

Il componente UI deve inizializzare il valore a:

```text
0.00%
```

e permettere all'utente di modificarlo.

Il valore può essere mantenuto:

* nello state React;
* eventualmente in `localStorage` per comodità.

Non è necessario introdurre una tabella database.

---

# 27. Period filters

La feature deve supportare almeno i periodi già utilizzati dal grafico storico:

* 1M;
* 3M;
* 6M;
* 1Y;
* YTD;
* All.

Il README conferma che questi filtri sono già presenti nel grafico storico.

### Regola

Le metriche devono essere ricalcolate sul periodo selezionato.

Ad esempio:

```text
1Y
↓
volatility = ultimi 12 mesi
CAGR       = ultimo anno
maxDD      = ultimo anno
Sharpe     = ultimo anno
```

Per `All` usare tutta la storia disponibile.

---

# 28. Attenzione al filtro temporale

Non tagliare semplicemente la serie dopo aver calcolato il TWR totale.

Il periodo deve essere filtrato **prima** del calcolo delle metriche.

Inoltre, se il periodo inizia dopo un cash flow, il motore deve conoscere correttamente il valore iniziale e i flussi successivi.

Questo è particolarmente importante per:

* TWR;
* CAGR;
* volatility;
* Sharpe.

---

# 29. Edge cases

## Nessun dato

Mostrare:

```text
No performance data available.
```

Non restituire `0` per tutte le metriche.

## Un solo snapshot

Non è possibile calcolare:

* volatility;
* Sharpe;
* drawdown significativo;
* CAGR.

Restituire `null`.

## Nessun rendimento valido

Le metriche dipendenti dai returns devono essere `null`.

## Volatilità = 0

Sharpe:

```text
null
```

non:

```text
Infinity
```

## Risk-free rate non valido

Risposta HTTP 400:

```json
{
  "error": "Invalid risk-free rate"
}
```

## Periodo < 1 anno

CAGR comunque calcolabile come annualizzazione, ma mostrare la durata del periodo.

## Drawdown non recuperato

`recoveryDate = null`.

## Periodi senza snapshot

Non interpolare automaticamente il valore del portafoglio.

I buchi temporali devono rimanere espliciti.

---

# 30. Precisione numerica

Le formule devono essere calcolate con `Number` JavaScript, coerentemente con il resto dell'applicazione.

Arrotondare **solo nella presentazione**, non durante i calcoli.

Esempio:

```text
backend:
0.08342173912

frontend:
8.34%
```

Non:

```text
backend:
0.08
```

prima del calcolo del CAGR o Sharpe.

---

# 31. Separazione calculation / presentation

Il backend deve restituire valori numerici grezzi.

Non restituire:

```json
{
  "cagr": "8.34%"
}
```

ma:

```json
{
  "cagr": 0.083421
}
```

Il frontend gestisce:

* `%`;
* numero di decimali;
* segno;
* valuta;
* localizzazione.

---

# 32. Test strategy

Creare unit test per ogni livello.

## Return series

Testare:

1. nessun flusso;
2. deposito;
3. più depositi;
4. serie crescente;
5. serie decrescente;
6. deposito nello stesso giorno di snapshot;
7. più movimenti nello stesso periodo.

## CAGR

Dataset deterministico:

```text
100 → 121
2 anni
```

Risultato:

```text
10%
```

## Monthly return

```text
+10%
-10%
```

non deve risultare:

```text
0%
```

ma:

```text
-1%
```

## Volatility

Usare un dataset con deviazione standard nota e verificare l'annualizzazione.

## Sharpe

Testare:

```text
riskFree = 0
riskFree > 0
riskFree < 0
volatility = 0
```

## Drawdown

Dataset:

```text
100
120
90
110
130
```

Expected:

```text
peak = 120
trough = 90
maxDrawdown = -25%
recovery = 130
```

## Recovery

Verificare separatamente:

* recovery immediata;
* recovery dopo molti periodi;
* nessuna recovery;
* nuovo peak prima del trough precedente.

---

# 33. Regression tests

Prima di modificare il calcolo TWR, creare test che garantiscano che l'attuale risultato TWR rimanga invariato sui dataset esistenti.

Questo è fondamentale perché tutte le nuove metriche dipendono dalla correttezza della serie di rendimento.

Il README identifica già il TWR come una funzionalità esistente della Dashboard.

---

# 34. API tests

Testare:

```http
GET /api/analytics/performance
```

con:

* default parameters;
* period filters;
* risk-free rate;
* invalid risk-free rate;
* date range invalido;
* database vuoto.

Verificare anche che l'API non esponga `NaN` o `Infinity` come JSON.

---

# 35. Performance

La serie storica può crescere nel tempo, ma dovrebbe comunque essere piccola rispetto ai normali dataset finanziari.

Preferire:

1. una query SQL per gli snapshot;
2. una query SQL per i cash flows;
3. elaborazione in memoria.

Evitare query SQL per ogni giorno.

Non introdurre caching prematuramente.

---

# 36. Database migration

**Nessuna migration necessaria.**

La funzionalità utilizza dati già presenti:

```text
daily_portfolio_snapshots
cash_movements
```

e le metriche rimangono calcolate a runtime, coerentemente con l'architettura documentata del progetto.

---

# 37. File/componenti previsti

La struttura esatta deve essere verificata dal coding agent prima di modificare i file, ma il design previsto è:

```text
models/
  analyticsModel.js
  performanceModel.js          # nuovo

controllers/
  performanceController.js     # nuovo

routes/
  performanceRoutes.js         # nuovo

client/src/
  pages/
    Performance.tsx            # nuovo
  components/performance/
    PerformanceKpi.tsx         # nuovo
    CumulativePerformanceChart.tsx  # nuovo
    AnnualReturnsChart.tsx     # nuovo
    MonthlyReturnsHeatmap.tsx  # nuovo
    RiskMetrics.tsx            # nuovo
    DrawdownChart.tsx          # nuovo
    RiskFreeRateInput.tsx      # nuovo
```

Non creare duplicati se componenti equivalenti sono già presenti.

---

# 38. Acceptance criteria

La feature è completa quando:

* [ ] Il portafoglio può essere analizzato per un intervallo temporale.
* [ ] Il TWR esistente continua a produrre gli stessi risultati.
* [ ] Viene generata una canonical daily return series.
* [ ] Viene calcolata la volatilità giornaliera.
* [ ] Viene calcolata la volatilità annualizzata.
* [ ] L'utente può inserire un risk-free rate.
* [ ] Lo Sharpe ratio cambia quando cambia il risk-free rate.
* [ ] Un risk-free rate pari a 0 produce uno Sharpe valido.
* [ ] Viene calcolato il CAGR.
* [ ] Vengono calcolati i rendimenti annuali.
* [ ] Vengono calcolati i rendimenti mensili.
* [ ] Vengono conteggiati mesi positivi, negativi e flat.
* [ ] Vengono conteggiati anni positivi, negativi e flat.
* [ ] Sono disponibili best/worst month.
* [ ] Sono disponibili best/worst year.
* [ ] Viene calcolato il cumulative return.
* [ ] Viene calcolato il maximum drawdown.
* [ ] Viene identificato il peak del maximum drawdown.
* [ ] Viene identificato il trough.
* [ ] Viene identificato il recovery, quando esiste.
* [ ] Viene calcolata la durata del drawdown.
* [ ] Viene calcolato il recovery time.
* [ ] Un drawdown non recuperato viene rappresentato correttamente.
* [ ] Non viene aggiunta alcuna tabella SQLite.
* [ ] Non vengono richiesti dati di inflazione.
* [ ] Non vengono calcolate metriche per singolo asset.
* [ ] Non viene introdotta una dipendenza esterna per i grafici.
* [ ] I calcoli non arrotondano i valori intermedi.
* [ ] Non vengono restituiti `NaN` o `Infinity`.
* [ ] Sono presenti test per le formule principali.
* [ ] Sono presenti regression test per il TWR.

---

# 39. Decisioni progettuali definitive

| Decisione                 | Scelta                                   |
| ------------------------- | ---------------------------------------- |
| Livello analisi           | Portfolio complessivo                    |
| Asset-level analytics     | Esclusa                                  |
| Inflazione                | Esclusa                                  |
| Fonte performance         | `daily_portfolio_snapshots` + cash flows |
| Metodo performance        | TWR                                      |
| Serie base                | Daily returns                            |
| CAGR                      | Sì                                       |
| Volatilità                | Daily + annualizzata                     |
| Sharpe                    | Sì                                       |
| Risk-free                 | Input utente                             |
| Risk-free persistence     | No DB                                    |
| Rendimenti mensili        | Sì                                       |
| Rendimenti annuali        | Sì                                       |
| Positive/negative periods | Sì                                       |
| Drawdown                  | Sì                                       |
| Recovery time             | Sì                                       |
| Nuove tabelle DB          | No                                       |
| Persistenza metriche      | No                                       |
| Chart library             | Recharts esistente                       |
| Backend                   | Node.js/Express                          |
| Frontend                  | React/TypeScript                         |
| Test formule              | Obbligatori                              |
| Annualization factor      | √365                                     |
| Debug endpoint            | Individuali durante sviluppo             |
| Endpoint aggregato        | Fase 8                                   |

---

# 40. Nota per il coding AI agent

**Prima di implementare, ispezionare il repository reale e adattare questo design alla struttura attuale.**

Non introdurre una nuova architettura se quella esistente può essere estesa.

In particolare:

1. non duplicare il calcolo TWR;
2. non creare una seconda interpretazione dei cash flows;
3. non modificare lo schema SQLite senza necessità;
4. non introdurre librerie per statistiche o charting se le funzionalità possono essere implementate con lo stack attuale;
5. non arrotondare durante i calcoli;
6. non usare `portfolio_value` raw per calcolare rendimenti quando sono presenti cash flows;
7. mantenere compatibilità con gli endpoint e componenti analytics esistenti;
8. aggiungere test prima di modificare la logica finanziaria esistente.

L'obiettivo principale non è semplicemente aggiungere KPI alla UI, ma costruire un **unico motore affidabile di performance/risk analytics** dal quale derivino tutte le metriche.


# Piano di implementazione

Trasformare il design in una sequenza di **vertical slice piccoli**, in cui ogni fase produce qualcosa di funzionante e testabile, evitando di chiedere all'AI di implementare contemporaneamente motore statistico, API e UI.

Struttura: **13 fasi** (0-12) con dipendenze lineari fino alla Fase 8, poi UI parallele. Ogni fase ha un `Definition of Done` esplicito e può essere affidata separatamente a un coding agent.

| Fase | Funzionalità                                       | Dipendenze |
| ---- | -------------------------------------------------- | ---------- |
| 0    | Baseline e analisi del codice                      | —          |
| 1    | Canonical Daily Return Series                      | 0          |
| 2    | Cumulative Performance + CAGR                      | 1          |
| 3    | Rendimenti mensili                                 | 1          |
| 4    | Rendimenti annuali + statistiche                   | 3          |
| 5    | Volatilità                                         | 1          |
| 6    | Sharpe + risk-free configurabile                   | 5          |
| 7    | Drawdown + recovery                                | 2          |
| 8    | API aggregata + integration test                   | 1-7        |
| 9    | UI: Performance (KPI + cumulative chart)           | 8          |
| 10   | UI: Monthly & Annual Returns                       | 8          |
| 11   | UI: Risk & Drawdown                                | 8          |
| 12   | Hardening, regression e documentazione             | 9-11       |

Durante lo sviluppo si mantengono endpoint individuali per debugging (es. `/api/analytics/volatility`, `/api/analytics/drawdown`). In Fase 8 si consolida tutto nell'endpoint aggregato.

La **Fase 1 è il vero foundation layer**: se la canonical return series è corretta, quasi tutte le metriche successive diventano piccole funzioni pure, facilmente testabili. Se invece la si salta, il rischio è ottenere CAGR, volatilità, Sharpe e drawdown calcolati con quattro interpretazioni diverse dei cash flow.

## Fase 0 — Baseline e analisi del codice

**Obiettivo:** non modificare il comportamento esistente. Verificare che tutto funzioni PRIMA di qualsiasi cambiamento.

L'agent deve:

* ispezionare struttura del repository;
* identificare modello/controller/routes analytics (`analyticsModel.js`, `analyticsController.js`, `analyticsRoutes.js`);
* identificare implementazione TWR esistente (`calculateTWR()` in `analyticsModel.js`);
* identificare schema `daily_portfolio_snapshots` (colonne: `snapshot_date`, `portfolio_value`, `available_cash`, `invested_capital`);
* identificare tutti i `movement_type` di `cash_movements` (DEPOSIT, WITHDRAWAL, OTHER, DIVIDEND, INTEREST, COMMISSION, TAX, STAMP_DUTY);
* identificare test esistenti (verificare se esistono script `npm test`, `vitest`, ecc.);
* verificare script di build (`npm run build`) e lint;
* eseguire test/lint/build attuali;
* documentare eventuali problemi preesistenti.

**Output:** nessuna nuova funzionalità, ma baseline verificata.

**Definition of Done:**

* [ ] Test esistenti passano (o problemi preesistenti sono documentati)
* [ ] Build passa
* [ ] Implementazione TWR attuale è identificata (funzione `calculateTWR()`, linee ~501-629 di `analyticsModel.js`)
* [ ] Semantica dei cash flow è documentata: DEPOSIT/WITHDRAWAL/OTHER = flussi esterni reali; DIVIDEND/INTEREST/COMMISSION/TAX/STAMP_DUTY = già inclusi nel portfolio_value
* [ ] Endpoint analytics esistenti documentati: `/dashboard`, `/portfolio`, `/allocation`, `/history`, `/twr`, `/rates`, `/asset/:id`

---

## Fase 1 — Canonical Daily Return Series

Questa è **la fase più importante**. Costruire qui la fiducia: se la return series è corretta, tutto ciò che segue lo sarà.

Non implementare ancora CAGR, volatilità, Sharpe o UI.

Creare `models/performanceModel.js` con una funzione che produce una serie standardizzata, filtrata per data range:

```ts
interface PortfolioReturnPoint {
  date: string;
  portfolioValue: number;
  externalFlow: number;
  periodReturn: number;
  cumulativeReturn: number;
}
```

La funzione deve accettare parametri `from` e `to` per il filtering temporale (preparazione per le fasi UI con period filter).

Partire da:

```text
daily_portfolio_snapshots  +  cash_movements
        ↓
canonical daily returns
```

Gestire correttamente i cash flow secondo la logica TWR esistente:
- **DEPOSIT** → segno negativo (soldi versati dal proprietario)
- **WITHDRAWAL** → segno positivo (prelievi)
- **OTHER** → positivo/negativo (trasferimenti, rimborsi)
- DIVIDEND/INTEREST/COMMISSION/TAX/STAMP_DUTY → **ESCLUSI** (già inclusi nel portfolio_value)

La funzione deve anche restituire `cumulativeReturn` nella output, per riutilizzo nella Fase 2.


`buildReturnSeries()` è il **single source of truth** da cui tutte le funzioni di calcolo derivano i dati.

---

### Architettura dati

```
                    buildReturnSeries()
                         ↓
         ┌─────────────────────────────────┐
         │   series = [{                   │
         │     date,                       │
         │     portfolioValue,             │  ← Serie canonica
         │     externalFlow,               │  ← Letta UNA SOLA VOLTA
         │     periodReturn,               │  ← dal DB
         │     cumulativeReturn            │
         │   }, ...]                        │
         └──────────────┬──────────────────┘
                        │
        ┌───────────────┼───────────────┬───────────────┬──────────┐
        ↓               ↓               ↓               ↓          ↓
   twrFromReturns()  calculateCAGR()  calculateVolatility()  calculateSharpe()  calculateDrawdown()
        ↓               ↓               ↓               ↓          ↓
    number           number           {daily,       {ratio}     {maxDD,
                                  annualized}                  peak, trough,
                                                                  recovery...}
```

---

### Principio chiave: leggere il DB UNA SOLA VOLTA

Prima della Fase 1, ogni metrica avrebbe dovuto fare la propria query al database:
- TWR legge snapshots + cash flows
- CAGR leggerebbe snapshots
- Volatilità leggerebbe snapshots
- Drawdown leggerebbe snapshots

Risultato: **4 letture diverse**, con rischio di formule incoerenti.

Con `buildReturnSeries()`:
- **Una sola lettura** al database
- Tutti i calcoli successivi operano su un array in memoria
- **Coerenza assoluta** perché tutti partono dagli stessi dati

---

### Esempio pratico

```js
// Una volta, una sola volta
const series = buildReturnSeries({ from: '2024-01-01', to: '2026-08-19' });

// Poi: tutte le metriche dalla stessa serie
const twr = twrFromReturns(series);
const cagr = calculateCAGR(series);        // Fase 2
const volatility = calculateVolatility(series);  // Fase 5
const sharpe = calculateSharpe(series, 2.5);   // Fase 6
const drawdown = calculateDrawdown(series);     // Fase 7
```

Questo è esattamente ciò che il design document descrive al punto 5:

> *"Creare prima una funzione/motore che costruisca una canonical return series, poi usare quella serie per tutte le metriche."*

> *"Questo riduce drasticamente il rischio di avere formule incoerenti tra dashboard, CAGR, volatilità e drawdown."*


### Test

Creare dataset artificiali con:

* crescita senza versamenti;
* versamento;
* prelievo, se supportato;
* più flussi;
* valore invariato;
* perdita;
* giorni consecutivi;
* deposito nello stesso giorno di snapshot;
* più movimenti nello stesso periodo.

**Regression test:** eseguire `calculateTWR()` esistente sui dati reali e verificare che il risultato sia identico a quello prodotto dalla nuova `buildReturnSeries()`.

**Definition of Done:**

- [ ] Esiste una sola funzione `buildReturnSeries({ from, to })` affidabile
- [ ] Restituisce `{ date, portfolioValue, externalFlow, periodReturn, cumulativeReturn }[]`
- [ ] Il TWR calcolato dalla serie canonica è identico a `calculateTWR()` esistente
- [ ] Tutti i test unit passano

---

## Fase 2 — Cumulative Performance + CAGR

Usare esclusivamente la serie della Fase 1.

Implementare:

* cumulative return;
* cumulative performance series;
* CAGR.

La serie cumulativa sarà anche la base futura del drawdown.

Output:

```text
{
  cumulativeReturn,
  cagr,
  cumulativeSeries
}
```

# Dettaglio Funzioni Fase 2

---

## 1. `calculateCumulativePerformance(returnSeries)`

### Scopo
Trasforma la serie canonica di rendimenti giornalieri in una **serie temporale normalizzata** che rappresenta l'andamento cumulativo del portafoglio, partendo dal valore base 1 (o 100 se moltiplicato per 100).

Questa serie è fondamentale perché:
- Alimenta il **grafico cumulative performance** (Fase 9 UI)
- È la base per calcolare il **drawdown** (Fase 7)
- Permette di visualizzare l'evoluzione nel tempo in modo leggibile

### Definizione

```ts
function calculateCumulativePerformance(returnSeries): PerformanceSeries
```

### Tipo di ritorno

```ts
interface PerformanceSeries {
  points: PerformancePoint[];
  cumulativeReturn: number; // valore finale - 1 (es. 0.7421 = +74.21%)
}

interface PerformancePoint {
  date: string;        // YYYY-MM-DD
  value: number;       // fattore cumulativo (1 = punto di partenza)
}
```

### Formula

Due approcci equivalenti — si usa il secondo perché più diretto (la serie ha già `cumulativeReturn`):

**Approccio A** (da `periodReturn`, iterativo):
```
points[0].value = 1
points[n].value = points[n-1].value × (1 + periodReturn[n])
```

**Approccio B** (da `cumulativeReturn`, diretto) ← **USATO**:
```
points[n].value = 1 + returnSeries[n].cumulativeReturn
```

Poiché `buildReturnSeries()` calcola già `cumulativeReturn` come TWR cumulativo, l'approccio B è esatto e più efficiente (un solo passaggio, nessuna propagazione di errori floating-point).

### Esempio

Input: serie con 5 punti, cumulativeReturn = [0, 0.02, 0.05, 0.03, 0.08]

Output:
```json
{
  "points": [
    { "date": "2024-01-01", "value": 1.0000 },
    { "date": "2024-01-02", "value": 1.0200 },
    { "date": "2024-01-03", "value": 1.0500 },
    { "date": "2024-01-04", "value": 1.0300 },
    { "date": "2024-01-05", "value": 1.0800 }
  ],
  "cumulativeReturn": 0.08
}
```

Visualizzazione grafica (line chart):
```
value
1.08 ┤                              ╭───
1.05 ┤                      ╭───────╯
1.02 ┤              ╭───────╯
1.00 ┼──────────────╯
     └──────────────────────────────────
     01/01   01/02   01/03   01/04   01/05
```

### Edge cases

| Caso | Comportamento |
|------|---------------|
| Serie vuota `[]` | `{ points: [], cumulativeReturn: 0 }` |
| Single point | `{ points: [{ value: 1 }], cumulativeReturn: 0 }` |
| Valore invariato | Tutti i `value = 1`, `cumulativeReturn = 0` |
| Perdita cumulativa | `value < 1`, `cumulativeReturn` negativo |

### Uso nel codice

```js
// Nel controller o direttamente chiamato dai test
const series = buildReturnSeries({ from: '2024-01-01', to: '2026-08-18' });
const perf = calculateCumulativePerformance(series);

// perf.points → alimente il grafico React
// perf.cumulativeReturn → KPI "Cumulative Return" nella dashboard
```

---

## 2. `calculateCAGR(returnSeries)`

### Scopo
Calcolare il **Compound Annual Growth Rate**, ovvero il tasso di crescita annuo composto del portafoglio nel periodo analizzato. Il CAGR risponde alla domanda: *"A che tasso annuo sarebbe cresciuto il portafoglio se fosse cresciuto in modo costante?"*

### Definizione

```ts
function calculateCAGR(returnSeries): CAGRResult
```

### Tipo di ritorno

```ts
interface CAGRResult {
  cagr: number | null;             // Tasso annuo composto (es. 0.0834 = 8.34% annui)
  years: number | null;            // Durata in anni decimali (days / 365.2425)
  periodLessThanOneYear: boolean;  // true se years < 1
}
```

### Formula

```
// Calcola durata del periodo
firstDate = returnSeries[0].date
lastDate = returnSeries[returnSeries.length - 1].date
elapsedDays = (lastDate - firstDate) in giorni

years = elapsedDays / 365.2425

// Ottieni cumulative return dall'ultimo punto
cumulativeReturn = returnSeries[lastIndex].cumulativeReturn

// CAGR
CAGR = (1 + cumulativeReturn) ^ (1 / years) - 1
```

**Perché 365.2425?** Tiene conto degli anni bisestili (media di 365.2425 giorni/anno).

### Esempio deterministico (test case)

Dataset:
```
data          portfolio_value  cumulativeReturn
2022-01-01    10000            0
2024-01-02    12100            0.21
```

Calcolo:
```
elapsedDays = 731 (approssimato, ~2 anni)
years = 731 / 365.2425 ≈ 2.0017

CAGR = (1 + 0.21) ^ (1 / 2.0017) - 1
     = 1.21 ^ 0.4996 - 1
     ≈ 0.10 (10% annui)
```

Il design doc specifica questo caso esatto: **100→121 in 2 anni = 10% CAGR**.

### Output JSON atteso

```json
{
  "cagr": 0.0834,
  "years": 2.45,
  "periodLessThanOneYear": false
}
```

UI mostrerebbe: **"CAGR: 8.34%"**

### Edge cases

| Caso | `cagr` | `years` | `periodLessThanOneYear` | Note UI |
|------|--------|---------|------------------------|---------|
| Serie vuota | `null` | `null` | `false` | "No data" |
| Single point | `null` | `null` | `false` | "Insufficient data" |
| Periodo < 1 anno | calcolato | < 1 | `true` | "CAGR: X% (period < 1 yr)" |
| `cumulativeReturn ≤ -1` | `null` | calcolato | flag | CAGR non definito |
| Periodo molto corto (< 30gg) | calcolato | << 1 | `true` | Warning visivo |

### Perché non usare semplicemente `(end/start)^(1/years) - 1`?

Perché il CAGR deve essere basato sul **TWR cumulativo** (che normalizza i flussi esterni), non sul semplice rapporto tra valori finali e iniziali. Usare `cumulativeReturn` dalla serie canonica garantisce coerenza con tutte le altre metriche che dipendono dallo stesso motore TWR.

Formula alternativa equivalente ma meno coerente:
```
(endValue - externalFlows) / startValue → NON USATO
```

La formula corretta usa il TWR:
```
CAGR = (1 + TWR_cumulative) ^ (1 / years) - 1
```

### Uso nel codice

```js
// Nel controller
const series = buildReturnSeries({ from: '2024-01-01', to: '2026-08-18' });
const cagr = calculateCAGR(series);

// cagr.cagr → KPI "CAGR" nella dashboard
// cagr.periodLessThanOneYear → flag per messaggio informativo UI
```

---

## Relazione tra le due funzioni

```
buildReturnSeries()
       │
       ▼
  { periodReturn, cumulativeReturn }
       │
       ├──────────────────────────────────┐
       │                                  │
       ▼                                  ▼
calculateCumulativePerformance    calculateCAGR
       │                                  │
       ▼                                  ▼
  { points[], cumulativeReturn }    { cagr, years, flag }
       │                                  │
       └──────────┬───────────────────────┘
                  │
                  ▼
         Dati per la UI (Fase 9)
         - Cumulative Return KPI ← da cumulativeReturn
         - CAGR KPI              ← da cagr.cagr
         - Line chart            ← da points[]
```

Entrambe le funzioni operano sulla **stessa input** (`buildReturnSeries()`) e producono output complementari per la stessa sezione UI.

---

Se il livello di dettaglio è sufficiente, **toggle to Act mode** e procedo con l'implementazione.

### Test

Caso semplice:

```text
100 → 110
1 anno
```

deve produrre:

```text
Cumulative = 10%
CAGR       = 10%
```

**Definition of Done:**

- [ ] Metriche disponibili backend/unit test, senza UI
- [ ] CAGR calcolato correttamente su periodo ≥ 1 anno
- [ ] Flag `periodLessThanOneYear` su periodo < 1 anno

---

## Fase 3 — Rendimenti mensili

Implementare l'aggregazione:

```text
daily returns
      ↓
YYYY-MM
      ↓
compound returns
```

Non fare somme aritmetiche.

Output:

```ts
[
  {
    year: 2025,
    month: 1,
    return: 0.021
  }
]
```

Aggiungere test con rendimenti multipli nello stesso mese.

**Definition of Done:**

- [ ] Serie mensile corretta e testata
- [ ] Compounding corretto: +10% poi -10% = -1% (non 0%)

---

## Fase 4 — Rendimenti annuali + statistiche

Riutilizzare la stessa funzione di aggregazione della Fase 3.

Implementare:

* rendimenti annuali;
* mesi positivi;
* mesi negativi;
* mesi flat;
* anni positivi;
* anni negativi;
* anni flat;
* best month;
* worst month;
* best year;
* worst year.

Output:

```text
monthlyStats
annualStats
bestWorst
```

### Nota

Zero deve essere classificato come **flat**, non negativo.

**Definition of Done:**

- [ ] Tutte le statistiche sono calcolate dalla stessa serie mensile/annuale
- [ ] Sono testate
- [ ] Flat period (return = 0) non classificato come negativo

---

## Fase 5 — Volatilità

Solo ora aggiungiamo la parte statistica. Dipende dalla Fase 1 (return series).

La serie contiene **tutti i giorni di calendario** (non solo trading days), perché i report Directa includono weekend e festività.

Costanti centralizzate in un unico file (es. `models/constants.js`):

```js
export const ANNUALIZATION_FACTOR = Math.sqrt(365);
// Uso: sqrt(365) perché Directa fornisce snapshot su tutti i giorni, non solo trading days.
```

Implementare:

```ts
function calculateVolatility(returnSeries) {
  if (returnSeries.length < 2) return { daily: null, annualized: null };
  const dailyStdDev = stddev(returnSeries.map(r => r.periodReturn));
  return {
    daily: dailyStdDev,
    annualized: dailyStdDev * ANNUALIZATION_FACTOR
  };
}
```

Calcolare:

* daily standard deviation;
* annualized volatility (`dailyStdDev × √365`).

Non eliminare weekend/festività dalla serie.

### Test

* Dataset deterministico con deviazione standard nota → verificare annualizzazione.
* Serie con rendimento costante (volatilità = 0) → gestire gracefully.

**Definition of Done:**

- [ ] Volatilità giornaliera corretta
- [ ] Volatilità annualizzata usa `√365` (costante centralizzata)
- [ ] Con meno di 2 punti → `{ daily: null, annualized: null }`
- [ ] Tutti i test unit passano

---

## Fase 6 — Sharpe Ratio

Dipende dalla Fase 5 (volatilità).

Il risk-free rate è un **parametro della richiesta HTTP**, non un dato persistito in DB.

Flusso:

```text
annual risk-free rate  (es. 2.5 = 2.5%)
        ↓  (1 + annualRf)^(1/365) - 1
daily risk-free rate
        ↓  excessDailyReturn = dailyPortfolioReturn - dailyRf
excess daily returns
        ↓  mean(excess) / stddev(dailyReturns) × √365
Sharpe
```

Formula:

```ts
function calculateSharpe(returnSeries, annualRf) {
  if (returnSeries.length < 2) return null;
  const dailyRf = Math.pow(1 + annualRf / 100, 1 / 365) - 1;
  const excessReturns = returnSeries.map(r => r.periodReturn - dailyRf);
  const meanExcess = excessReturns.reduce((s, v) => s + v, 0) / excessReturns.length;
  const stdDev = stddev(returnSeries.map(r => r.periodReturn));
  if (stdDev === 0 || stdDev === null) return null; // evitare Infinity
  return (meanExcess / stdDev) * ANNUALIZATION_FACTOR;
}
```

Validazione input:

- `riskFreeRate` deve essere numerico
- Range ragionevole: `-100 < rate < 100` (percentuale)
- Non NaN
- Se invalido → HTTP 400 con `{ error: "Invalid risk-free rate" }`

Endpoint di sviluppo (individual, per debugging):

```http
GET /api/analytics/volatility?from=&to=
GET /api/analytics/sharpe?from=&to=&riskFreeRate=0
```

### Test

* RF = 0% → Sharpe con excess return = return stesso
* RF > 0% → Sharpe ridotto
* RF < 0% → Sharpe aumentato
* Volatilità = 0 → Sharpe = `null` (non `Infinity`)
* Input non valido → HTTP 400

**Definition of Done:**

- [ ] Sharpe ricalcolabile con qualsiasi RF valido
- [ ] RF = 0 produce Sharpe valido
- [ ] Volatilità = 0 → Sharpe = `null`
- [ ] Input non valido → HTTP 400
- [ ] Tutti i test unit passano

---

## Fase 7 — Drawdown + Recovery

Dipende dalla serie cumulativa della Fase 2 (cumulative performance series).

Costruire:

```text
cumulative performance  (da Fase 2)
        ↓
running peak  (max di ogni punto)
        ↓
drawdown series  (value/peak - 1)
        ↓
max drawdown + peak/trough/recovery
```

Calcolare:

```ts
interface DrawdownStats {
  currentDrawdown: number;
  maxDrawdown: number;
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null;
  durationDays: number;       // recoveryDate - peakDate
  recoveryDays: number | null; // recoveryDate - troughDate
  isRecovered: boolean;
}
```

Distinzioni importanti:
- **Drawdown duration** = tempo dal peak al recupero del peak
- **Recovery time** = tempo dal trough al recupero del peak

### Test fondamentali

**Test A — Dataset base:**

```text
100 → 120 → 90 → 110 → 130
```

Expected:

```text
Peak       120  (indice 1)
Trough      90  (indice 2)
Max DD     -25%  ((90-120)/120)
Recovered  yes  (130 > 120)
PeakDate   indice 1
RecoveryDate  indice 4
Duration   4 giorni
Recovery   3 giorni
```

**Test B — Drawdown che si approfondisce:**

```text
100 → 120 → 90 → 100 → 80 → 130
```

Expected:

```text
MaxDD trough = 80 (non 90)
Peak         = 120
Recovery     = quando supera 120
```

Verificare che il massimo drawdown sia calcolato sul trough assoluto (80), non sul primo calo.

**Test C — Drawdown non recuperato:**

Serie che termina sotto il precedente peak:

```text
recoveryDate = null
isRecovered = false
```

Non inventare mai una recovery date.

**Definition of Done:**

- [ ] Algoritmo di drawdown completamente indipendente dalla UI
- [ ] Test A: peak=120, trough=90, maxDD=-25%, recovered=yes
- [ ] Test B: maxDD calcolato sul trough assoluto (80), non primo calo
- [ ] Test C: drawdown non recuperato → `recoveryDate=null`, `isRecovered=false`
- [ ] Tutti i test unit passano

---

## Fase 8 — API aggregata + integration test

A questo punto tutte le metriche esistono (Fasi 1-7). Consolidare tutto in un endpoint unico.

Durante lo sviluppo (Fasi 1-7) si sono usati endpoint individuali per debugging:

```
GET /api/analytics/volatility?from=&to=
GET /api/analytics/sharpe?from=&to=&riskFreeRate=0
GET /api/analytics/drawdown?from=&to=
...
```

Ora creare l'endpoint aggregato:

```http
GET /api/analytics/performance?from=&to=&riskFreeRate=0
```

Parametri opzionali:

| Parametro      | Tipo   | Default | Descrizione                        |
| -------------- | ------ | ------- | ---------------------------------- |
| `from`         | string | null    | Data inizio (YYYY-MM-DD)           |
| `to`           | string | null    | Data fine (YYYY-MM-DD)             |
| `riskFreeRate` | number | 0       | Risk-free rate annuale in %       |

Response:

```json
{
  "period": { "from": "...", "to": "...", "days": N },
  "riskFreeRate": 0.025,
  "metadata": {
    "dataPoints": 500,
    "hasGaps": false,
    "periodLessThanOneYear": false
  },
  "performance": {
    "cumulativeReturn": 0.7421,
    "cagr": 0.0834
  },
  "risk": {
    "dailyVolatility": 0.0071,
    "annualizedVolatility": 0.1127,
    "sharpeRatio": 0.71
  },
  "periodStats": {
    "months": { "positive": 48, "negative": 19, "flat": 2, "total": 69, "positiveRate": 0.6957 },
    "years": { "positive": 5, "negative": 1, "flat": 0, "total": 6, "positiveRate": 0.8333 }
  },
  "bestWorst": {
    "month": { "best": 0.083, "worst": -0.062 },
    "year": { "best": 0.172, "worst": -0.091 }
  },
  "drawdown": {
    "current": -0.034,
    "maximum": -0.1824,
    "peakDate": "2024-03-15",
    "troughDate": "2024-10-31",
    "recoveryDate": "2025-06-12",
    "durationDays": 454,
    "recoveryDays": 224,
    "isRecovered": true
  },
  "annualReturns": [{ "year": 2024, "return": 0.0981 }],
  "monthlyReturns": [{ "year": 2024, "month": 3, "return": 0.0342 }],
  "cumulativeSeries": [{ "date": "2024-01-01", "value": 1.0 }]
}
```

Campi aggiuntivi rispetto alle singole API:

- **`metadata`**: info sul contesto (data points, buchi temporali, periodo < 1 anno)
- **`bestWorst`**: best/worst month e year (dalla Fase 4)

### Integration test

PRIMA di iniziare lo sviluppo frontend (Fase 9), verificare che l'API restituisca dati coerenti su un dataset noto:

1. Creare dataset di test nel database (snapshot + cash flows)
2. Chiamare `GET /api/analytics/performance`
3. Verificare che ogni metrica corrisponda al valore atteso
4. Verificare che non ci siano `NaN` o `Infinity` nella response JSON
5. Verificare edge cases: database vuoto, un solo snapshot, periodo < 1 anno

**Definition of Done:**

- [ ] Una chiamata `GET /api/analytics/performance` restituisce TUTTO ciò che serve alla pagina
- [ ] Integration test passa su dataset noto
- [ ] Nessun `NaN` o `Infinity` nella response JSON
- [ ] Edge cases gestiti correttamente (vuoto, 1 snapshot, < 1 anno)
- [ ] Endpoint individuali rimangono disponibili per debugging

---

## Fase 9 — UI: Performance

Prima vertical slice frontend.

Implementare soltanto:

* KPI cumulative return;
* CAGR;
* cumulative performance chart.

Aggiungere i period filter già esistenti (1M, 3M, 6M, 1Y, YTD, All).

Non implementare ancora risk o monthly returns.

**Definition of Done:**

- [ ] L'utente può selezionare un periodo e vedere correttamente performance cumulativa e CAGR
- [ ] Il grafico mostra la curva cumulativa per il periodo selezionato

---

## Fase 10 — UI: Monthly & Annual Returns

Aggiungere:

### Annual returns

Bar chart con Recharts:

```text
       █
 █     █       █
 █  █  █   █   █
────────────────────
2022 23  24  25  26
```

* positivo sopra lo zero;
* negativo sotto lo zero;
* tooltip con valore esatto;
* asse zero sempre visibile.

### Monthly returns

Heatmap (grid CSS/React, NO nuove dipendenze):

```text
       Jan Feb Mar Apr ...
2024    +   +   -   +
2025    +   -   +   +
2026    -   +   +   +
```

Aggiungere:

* positive/negative count;
* best/worst month;
* best/worst year.

**Definition of Done:**

- [ ] Tutta la sezione Performance è completa
- [ ] Nessuna nuova dipendenza charting introdotta (Recharts esistente)

---

## Fase 11 — UI: Risk & Drawdown

Ultima vertical slice UI.

Aggiungere:

```text
┌──────────────────────────────────────────────┐
│ Risk                                         │
│                                              │
│ Volatility       11.73%                      │
│ Sharpe            0.71                        │
│ Max Drawdown    -18.24%                      │
│ Recovery          224 days                    │
│                                              │
│ Risk-free rate   [ 2.50 % ]                  │
└──────────────────────────────────────────────┘
```

Modificando il risk-free:

```text
API
 ↓
Sharpe aggiornato
```

Aggiungere eventualmente il grafico del drawdown.

**Definition of Done:**

- [ ] Sezione Risk completa e interattiva
- [ ] Risk-free rate ricalcola Sharpe via backend

---

## Fase 12 — Hardening

Ultima fase dedicata alla qualità.

Verificare:

* dati insufficienti;
* database vuoto;
* un solo snapshot;
* periodi inferiori a un anno;
* drawdown non recuperato;
* volatilità zero;
* RF invalido;
* date con buchi;
* cash flow nello stesso giorno;
* `NaN`;
* `Infinity`;
* precisione numerica;
* performance con tutta la storia.

Poi:

* regression test TWR;
* API integration test;
* frontend build;
* lint;
* documentazione (aggiornare `docs/API.md`).

**Definition of Done:**

- [ ] Tutti gli edge cases gestiti
- [ ] Regression test TWR passano
- [ ] Frontend build senza errori
- [ ] Documentazione aggiornata

---

## Come darei le istruzioni al coding agent

Non gli darei tutto il design document a ogni iterazione. Gli passerei **un prompt per fase**, con tre elementi fissi:

```text
CONTEXT
Leggi il design doc generale e il codice esistente.

TASK
Implementa esclusivamente la Fase X.

CONSTRAINTS
- Non implementare fasi successive.
- Non modificare funzionalità non coinvolte.
- Riutilizza il codice esistente.
- Aggiungi test.
- Non modificare lo schema DB salvo esplicita necessità.
- Alla fine esegui test/lint/build.

DONE WHEN
[criteri specifici della fase]
```

Questo evita soprattutto che un coding agent, davanti a "implementa Performance & Risk", inizi a modificare contemporaneamente model, API e React introducendo una grossa superficie di regressione.

### Sequenza che consiglio

**Fase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12**

Le dipendenze sono volutamente lineari fino alla Fase 8. Dopo l'API, le fasi UI possono essere implementate separatamente.

La **Fase 1 è il vero foundation layer**: se la canonical return series è corretta, quasi tutte le metriche successive diventano piccole funzioni pure, facilmente testabili. Se invece la si salta, il rischio è ottenere CAGR, volatilità, Sharpe e drawdown calcolati con quattro interpretazioni diverse dei cash flow.