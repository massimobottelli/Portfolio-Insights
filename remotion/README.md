# Portfolio Insights — Video promozionale (Remotion)

Video promozionale cinematografico per **Portfolio Insights**, l'app web
self-hostable per l'analisi del portafoglio di investimenti Directa.

**Specifiche:** 1920×1080 · 16:9 · 30 fps · 60 secondi (1800 frame) · MP4 H.264 · italiano.

> ⚠️ I dati mostrati nel video sono **dimostrativi** (finti, di esempio) e non
> rappresentano risultati ottenibili dagli utenti. Il video non contiene
> promesse di rendimento né consulenza finanziaria.

## Comandi

**Installazione**

```console
npm i --loglevel=error
```

**Anteprima interattiva (Remotion Studio)**

```console
npm run dev
```

**Render del video finale (1920×1080, 30 fps, 60s)**

```console
npx remotion render src/index.ts PortfolioInsightsVideo out/portfolio-insights.mp4 --codec=h264
```

**Anteprima a risoluzione ridotta per controlli rapidi (640×360)**

```console
npx remotion render src/index.ts PortfolioInsightsPreview out/portfolio-insights-preview.mp4 --codec=h264
```

**Controllo qualità (ESLint + TypeScript)**

```console
npm run lint
```

**Still di una singola scena (per verifica frame)**

```console
npx remotion still src/index.ts PortfolioInsightsVideo out/still.png --frame=500
```

## Struttura

```
src/
  index.ts                     # entry point Remotion
  Root.tsx                     # registrazione composizioni (video + anteprima)
  PortfolioInsightsVideo.tsx   # composizione principale (8 scene in Sequence)
  config/
    timeline.ts                # timeline dichiarativa (durata scene, fps, risoluzione)
    audio.ts                   # colonna sonora opzionale (MUSIC = null di default)
  data/
    demoPortfolio.ts           # dataset dimostrativo centralizzato + metriche derivate
    copy.ts                    # tutti i testi in italiano (facilita traduzioni)
  animations/helpers.ts        # helper deterministici (fade, rise, spring, counter, format it-IT)
  components/                  # UI riutilizzabile fedele all'app reale
    DashboardScene.tsx         # finestra app: sidebar + header + KPI + grafici
    Sidebar.tsx                # nav reale: Dashboard, Portfolio, Allocazione, ...
    MetricCard.tsx             # KPI con count-up
    PortfolioHistoryChart.tsx  # grafico storico (Portfolio/Investito EUR + TWR % assi separati)
    AllocationDonut.tsx        # anello allocazione + legenda (STOCK/BOND/FUND/...)
    MonthlyReturnsChart.tsx    # barre rendimenti mensili + heatmap
    DrawdownChart.tsx          # curva drawdown con peak/trough/recovery
    SceneHeadline.tsx          # headline di scena
    Icons.tsx                  # icone lineari SVG
  scenes/                      # le 8 scene dello storyboard
public/assets/logo.png         # logo ufficiale (asset originale, non ridisegnato)
```

## Storyboard

| Scena | Frame | Titolo |
|---|---|---|
| 1 | 0-149 | Apertura e brand |
| 2 | 150-359 | Dal dato alla visione |
| 3 | 360-659 | La dashboard |
| 4 | 660-929 | Performance nel tempo |
| 5 | 930-1199 | Allocazione e ribilanciamento |
| 6 | 1200-1439 | Performance e rischio |
| 7 | 1440-1619 | Importazione e controllo |
| 8 | 1620-1799 | Chiusura e call to action |

## Personalizzazione

- **Dati**: modifica `src/data/demoPortfolio.ts`. TWR, CAGR, volatilità,
  Sharpe, drawdown e P&L sono **derivati** dal dataset (mai hardcoded) e si
  ricalcolano automaticamente.
- **Testi**: tutti in `src/data/copy.ts` (italiano, formattazione it-IT).
- **Palette/tipografia**: `src/styles/theme.ts` (Inter caricata localmente).
- **Logo**: sostituisci `public/assets/logo.png` (512x512).
- **Durata scene**: `src/config/timeline.ts` (`SCENES`).
- **Musica**: traccia ambient/under synth generata proceduralmente con
  `node scripts/generate-music.mjs` (deterministica, nessun asset di terzi,
  nessun problema di licenza) e sincronizzata con la timeline: crescendo da
  -28 dB (scena 1) a -11 dB (CTA), beat a 90 BPM dalla scena 3, riser verso
  le transizioni chiave. La traccia si rigenera in `public/assets/music.wav`;
  per usare un'altra musica salva il file in `public/assets/` e aggiorna
  `MUSIC` in `src/config/audio.ts`.

## Versioni future (9:16 e 30 secondi)

La timeline è dichiarativa e le scene sono componenti indipendenti:

- **30 secondi**: usa `scaledTimeline(900)` in `src/config/timeline.ts` e
  registra una nuova `<Composition>` in `Root.tsx` (le scene calcolano i
  timing interni come frazioni della propria durata).
- **9:16 verticale**: crea una composizione 1080x1920 con layout dedicato
  riutilizzando gli stessi componenti (`DashboardScene`, grafici, card):
  il canvas logico 1920x1080 viene scalato automaticamente, ma il layout
  verticale richiede un rearrangiamento degli elementi nelle scene.

## Note tecniche

- Tutte le animazioni sono native Remotion (`useCurrentFrame`, `interpolate`,
  `spring`, `Sequence`) — deterministiche e renderizzabili a un frame arbitrario.
- Nessuna dipendenza dalla rete durante il rendering: font Inter e logo sono
  asset locali, i grafici sono SVG generati dal frame corrente.
- Metriche coerenti: TWR/CAGR/drawdown derivano per compounding dai rendimenti
  mensili; volatilità annualizzata radice(12) sulla serie mensile (l'app usa la
  serie giornaliera con radice(365), qui non disponibile nel dataset dimostrativo).
