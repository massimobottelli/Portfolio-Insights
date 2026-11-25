
---

## 📸 Stato attuale del frontend

**Stack** (in `client/`): React 18 + Vite + Tailwind CSS 3.4 (config **praticamente vuota** — nessun tema custom), Recharts 3, lucide-react, react-router 6. Nessuna libreria di animazione.

**Diagnosi estetica** — l'app è funzionale e pulita, ma è il classico "dark Tailwind default":

| Aspetto | Oggi | Problema |
|---|---|---|
| Palette | `slate-900/800/700` + emerald/red per P&L | Palette di default, indistinguibile da mille altre dashboard |
| Tipografia | System font stack (nessun `font-family` custom nel progetto) | Zero personalità; i numeri finanziari non usano cifre tabulari |
| Superfici | Card piatte `bg-slate-800 border-slate-700` | Nessuna gerarchia visiva, nessuna atmosfera |
| Motion | Solo `transition-colors` | Nessun momento memorabile, pagina "statica" |
| Layout | Griglia di card prevedibile, hero box full-width | Corretto ma generico |
| Brand | Logo "Portfolio**Insights**" blu/verde, icona lucro Lock | Brand debole, colore blu+verde fuori da un sistema |

Per un tool **self-hosted di analisi investimenti** c'è un'occasione chiara: le interfacce finanziarie memorabili (terminal Bloomberg, private banking, report patrimoniali editoriali) giocano tutto su **tipografia numerica, gerarchie sottili e atmosfera densa** — non su gradienti sgargianti.

---

## 🎨 Direzione proposta: *"Ledger Elettorale"* — dark editorial-finanziario

Un'estetica da **registro patrimoniale di lusso**: inchiostro scuro caldo (non slate freddo), un display serif per i titoli, **cifre tabulari monospace per tutti i numeri**, accento oro/ambra + verde smeraldo solo per i segnali P&L, hairline rules al posto di bordi spessi, texture di grana sottile.

- **Font**: *Fraunces* (display serif, carattere da report finanziario d'epoca) + *IBM Plex Sans* (body) + *IBM Plex Mono* `font-variant-numeric: tabular-nums` per importi e percentuali → i numeri si allineano verticalmente nelle tabelle, dettaglio che chi usa fogli di calcolo riconosce subito.
- **Palette** (CSS variables + Tailwind `theme.extend`): base `#0c0f14 / #12161d`, superfici `#171c25`, hairlines `#2a3140`, testo `#e8e6e1` (bianco caldo), accento oro `#d4a24a`, positivo `#2fbf8f`, negativo `#e0564f`.
- **Il momento memorabile**: il hero "Valore Portafoglio" diventa una **pagina di registro** — cifra gigante in mono tabulare, delta come chip, watermark sparkline in filigrana dietro il numero, e le card della dashboard entrano con **staggered reveal CSS al load** (150ms a card, `animation-delay`).

---

## 🛠 Piano di intervento (fasi incrementali, compatibili con le regole del progetto)

**Fase 1 — Design tokens** *(file: `client/src/index.css`, `client/tailwind.config.js`)*
- Estendere il tema Tailwind: colori custom (`ink-*`, `gold`, `bull`, `bear`), `font-display`, `font-sans`, `font-mono`.
- In `index.css`: variabili CSS, texture di grana (SVG noise inline data-URI), utility `.tabular` per i numeri, `@media (prefers-reduced-motion)`.
- Punto di appoggio: i colori per asset type esistenti (`ASSET_TYPE_COLORS` hue-based in `Dashboard.tsx`) restano — si integrano con la nuova base.

**Fase 2 — Guscio: Sidebar + Layout + Login** *(file: `Layout.tsx`, `Login.tsx`, `index.html`)*
- Sidebar: active state con **barra d'accento laterale** invece del box blu; brand monogramma serif; hover con micro-traslazione.
- Login: sfondo atmosferico (gradient mesh scura + grana), card con doppio bordo hairline, Lock in cerchio oro.
- `index.html`: preload font, aggiornamento `theme-color`.

**Fase 3 — Dashboard (la vetrina)** *(file: `Dashboard.tsx`)*
- Hero di registro come sopra + chip delta animata.
- Card in ingresso con staggered reveal CSS-only.
- Grafici Recharts ritintati: griglia hairline tratteggiata, tooltip `backdrop-blur` con bordo oro sottile, gradienti di area più raffinati, assi in mono.

**Fase 4 — Tabelle e componenti Performance/Rischi** *(file: `AssetTypeIRRTable.tsx`, `PeriodStatistics.tsx`, `MonthlyReturnsHeatmap.tsx`, ecc.)*
- Righe hairline senza zebra, header sticky, allineamento destro con cifre tabulari, heatmap con scala cromatica coerente alla nuova palette.

**Vincoli rispettati**: nessuna nuova dipendenza (tutto CSS + librerie esistenti), nessun cambio di comportamento/funzionalità (solo presentazione — coerente con `.clinerules`), verifica finale con `npm run typecheck` e `npm run build:all`.

**Tradeoff**: richiede l'aggiunta dei font (via Google Fonts CDN o file self-hosted — coerente con l'app self-hostable, preferirei self-hosted in `client/public/fonts/`); i font serif hanno un carattere forte che cambia sensibilmente il feel attuale.

---

# 📋 Piano — Redesign "Ledger Editoriale" per Portfolio Insights

## Impatto rilevato
25 file usano classi slate/emerald/blue — il piano li tocca **in fasi indipendenti e verificabili**, senza mai cambiare logica o comportamento (solo presentazione, come richiede `.clinerules`).

## Sistema di design (Fondamenta)

**Palette** — in `client/src/index.css` come CSS variables + estensione in `client/tailwind.config.js`:

```js
// tailwind.config.js → theme.extend.colors
ink:      { 950:'#0b0e13', 900:'#10141b', 800:'#161b24', 700:'#1e2530', 600:'#2a3140' }, // base calda (al posto di slate)
paper:    '#e8e6e1',        // testo primario (bianco caldo, non bianco puro)
gold:     { 400:'#d4a24a', 500:'#c08c35' },   // accento (al posto del blu)
bull:     '#2fbf8f',        // positivo (sostituisce emerald-400, tinta più profonda)
bear:     '#e0564f',        // negativo
muted:    '#8b93a3',        // testo secondario
```

**Tipografia** (self-hosted, coerente con app self-hostable — font in `client/public/fonts/`, `@font-face` in `index.css`):
- `font-display`: **Fraunces** (solo titoli, hero, brand — peso 500-600, `font-feature-settings` per il carattere editoriale)
- `font-sans`: **IBM Plex Sans** (body, UI, label)
- `font-num`: **IBM Plex Mono** con `font-variant-numeric: tabular-nums` → utility `.num` applicata a tutti gli importi/percentuali (hero, card, tabelle, tooltip)

**Atmosfera**:
- Body: base `ink-950` + **gradient wash radiale** sottile in alto + **grana SVG** (data-URI, opacity ~0.03) fissa su `body::before`
- Card: `bg-ink-800` con bordo hairline `border-ink-600` + inner shadow top (`inset 0 1px 0 rgba(255,255,255,.04)`) per il rilievo
- Divisori: hairline 1px al posto dei bordi marcati

**Motion** (solo CSS, rispettando `prefers-reduced-motion`):
- `@keyframes rise-in` + classi `.reveal` con `animation-delay` incrementale per lo **staggered reveal** delle card al load
- Hover card: `translateY(-2px)` + leggero lift d'ombra
- Chip delta: transizione di colore al cambio di time range

## Fasi di lavoro

| Fase | File | Contenuto |
|---|---|---|
| **1. Tokens** | `index.css`, `tailwind.config.js`, `index.html` | Palette, font (`@font-face`), grana, `.num`, `.reveal`, reduced-motion; `theme-color` aggiornato |
| **2. Guscio** | `Layout.tsx`, `Login.tsx` | Sidebar: barra d'accento oro sull'active state, monogramma serif "P|I", hover micro-motion; Login: sfondo atmosferico + card doppio bordo |
| **3. Dashboard** | `Dashboard.tsx` | Hero di registro (cifra gigante `.num` 5xl-7xl, watermark sparkline in filigrana, chip delta), staggered reveal card, grafici Recharts ritintati (grid hairline dashed, tooltip blur con bordo oro, assi mono) |
| **4. Tabelle & Performance/Rischi** | 9 file in `components/performance/` + tabelle di `Orders/Movements/Portfolio` | Swap slate→ink, righe hairline sticky-header, numeri `.num` allineati a destra, heatmap ritintata sulla nuova scala |
| **5. Pagine secondarie** | `Allocation, AssetDetail, Movements, Orders, Import, Settings, About, ErrorBoundary` | Migrazione classi + allineamento ai nuovi token |
| **6. Verifica** | — | `npm run typecheck`, `npm run build:all`, revisione visiva delle 12 rotte (desktop + mobile via `useIsMobile`), controllo contrasto WCAG AA |

## Note e vincoli
- **Nessuna nuova dipendenza** JS: solo CSS + librerie esistenti (Tailwind 3.4, Recharts 3, lucide-react).
- `ASSET_TYPE_COLORS` hue-based in `Dashboard.tsx` resta invariato — le tinte per asset type si integrano con la nuova base.
- I colori semantici P&L (bull/bear) restano **ridondanti e immediatamente leggibili** — è un requisito funzionale di una dashboard finanziaria, non li sacrificherò all'estetica.
- Font self-hosted ≈ +120-180KB woff2 (subset latin), caricati con `font-display: swap`.

---
