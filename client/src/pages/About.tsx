import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
// Icone coerenti con la navigazione della sidebar (Layout.tsx)
import {
  LayoutDashboard, BarChart3, PieChart, TrendingUp, ArrowLeftRight, Download,
  Sparkles, BookOpen, FileDown, Upload, Compass,
} from 'lucide-react';

// Logo GitHub ufficiale (octicon "mark-github") — come in Layout.tsx,
// lucide-react non espone più icone brand
function GithubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

// Sezione "Funzionalità": contenuto speculare al README.md,
// dall'introduzione fino alla sezione "Importazione" inclusa.
interface FeatureSection {
  icon: LucideIcon;
  title: string;
  items: ReactNode[];
}

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    items: [
      <><strong>KPI principali</strong>: Valore portafoglio, Capitale investito, Liquidità, Profit &amp; Loss</>,
      <><strong>TWR</strong> (Time-Weighted Rate of Return): calcolo con sottoperiodi delimitati dai depositi</>,
      <><strong>Grafico storico</strong>: evoluzione del portafoglio con filtri temporali (1M, 3M, 6M, 1Y, YTD, All)</>,
      <><strong>Allocazione</strong>: grafico a torta interattivo con legenda e colori per tipologia di asset</>,
    ],
  },
  {
    icon: BarChart3,
    title: 'Portafoglio',
    items: [
      <><strong>Tabella posizioni</strong>: dettaglio di tutti gli strumenti con ordinamento per qualsiasi colonna</>,
      <><strong>Prezzi correnti e medi</strong>: importati automaticamente dal report Directa P_TOTALE</>,
      <><strong>Gain/Loss</strong>: calcolato per ogni posizione (€ e %), con link alla scheda di dettaglio asset</>,
      <><strong>Classificazione manuale</strong>: dropdown per assegnare il tipo di asset (BOND, STOCK, FUND, COMMODITY, CASH)</>,
      <><strong>Tabella riepilogativa Asset Class</strong>: totali per categoria con Gain/Loss aggregato</>,
    ],
  },
  {
    icon: PieChart,
    title: 'Allocazione',
    items: [
      <><strong>Editor target</strong>: percentuali obiettivo per categoria di asset + soglia di tolleranza globale</>,
      <><strong>Grafico a torta in tempo reale</strong>: anteprima dell'allocazione durante la configurazione</>,
      <><strong>Tabella attuale vs target</strong>: deviazioni percentuali ed economiche per categoria</>,
      <><strong>Suggerimenti di ribilanciamento</strong>: COMPRA/VENDI quando la deviazione supera la tolleranza</>,
      <><strong>Validazione</strong>: somma dei target deve essere 100%, solo categorie target-abili</>,
    ],
  },
  {
    icon: TrendingUp,
    title: 'Performance & Risk',
    items: [
      <><strong>KPI</strong>: rendimento cumulativo TWR, CAGR, best/worst mese e anno</>,
      <><strong>Rendimenti mensili</strong>: grafico a barre + heatmap anno × mese con tooltip</>,
      <><strong>Statistiche periodi</strong>: mesi/anni positivi, negativi e flat con tassi</>,
      <><strong>Metriche di rischio</strong>: volatilità giornaliera e annualizzata (√365), Sharpe ratio con <strong>risk-free rate configurabile dall'utente</strong></>,
      <><strong>Analisi drawdown</strong>: maximum drawdown, peak/trough/recovery, durata e tempo di recupero, grafico della curva di drawdown</>,
      <>Le metriche sono calcolate sull'intero periodo di investimento dalla <strong>canonical return series</strong> (serie unica di rendimenti giornalieri condivisa da tutte le metriche)</>,
    ],
  },
  {
    icon: ArrowLeftRight,
    title: 'Movimenti',
    items: [
      <><strong>Elenco completo</strong>: tutti i movimenti di cassa (commissioni, dividendi, bolli, tasse, conferimenti)</>,
      <><strong>Filtri avanzati</strong>: intervallo date, tipo movimento, simbolo, ricerca testuale</>,
      <><strong>Ordinamento</strong>: cliccabile su ogni colonna</>,
      <><strong>Legenda tipologie</strong>: descrizione estesa per ogni tipo di movimento</>,
    ],
  },
  {
    icon: Download,
    title: 'Importazione',
    items: [
      <><strong>3 report supportati</strong>: Movimenti, Patrimonio Totale, Portafoglio Corrente</>,
      <><strong>Parsing CSV nativo</strong>: senza librerie esterne</>,
      <><strong>Idempotenza</strong>: re-import sicuro senza duplicati</>,
      <><strong>Filtro incrementale</strong>: importa solo i movimenti successivi all'ultima data presente</>,
      <><strong>Storico import</strong>: tracciamento di tutte le sessioni di importazione</>,
      <><strong>Cancellazione database</strong>: funzione di reset con conferma</>,
    ],
  },
];


export default function About() {
  return (
    <div className="max-w-4xl space-y-8">
      {/* Introduzione */}
      <div>
        <h2 className="text-2xl font-bold text-white">
          <span className="text-blue-400">Portfolio</span>
          <span className="text-green-400">Insights</span>
        </h2>
        <blockquote className="mt-3 border-l-4 border-blue-500/60 pl-4 text-slate-400 text-sm italic">
          Applicazione web self-hostable per l'analisi avanzata del portafoglio
          di investimenti Directa.
        </blockquote>
        <p className="mt-4 text-slate-300 text-sm leading-relaxed">
          Portfolio Insights è un'applicazione web{' '}
          <strong className="text-white font-semibold">self-hostable</strong> che
          analizza un portafoglio di investimenti esportato dal broker{' '}
          <strong className="text-white font-semibold">Directa</strong>. Si concentra
          su investimenti a lungo termine (Obbligazioni, Azioni, Fondi, Commodities)
          e fornisce analisi avanzate sulla composizione del portafoglio,
          l'evoluzione storica, le performance di investimento e il profilo di rischio.
        </p>
      </div>

      {/* Funzionalità */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-2.5 text-xl font-bold text-white">
          <Sparkles size={20} className="text-blue-400 shrink-0" />
          Funzionalità
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURE_SECTIONS.map(({ icon: Icon, title, items }) => (
            <div
              key={title}
              className="bg-slate-800 rounded-xl border border-slate-700 p-6"
            >
              <h4 className="flex items-center gap-2.5 text-lg font-semibold text-white mb-3">
                <Icon size={20} className="text-blue-400 shrink-0" />
                {title}
              </h4>
              <ul className="space-y-2 [&_strong]:text-white [&_strong]:font-semibold">
                {items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-slate-400 text-sm leading-relaxed">
                    <span className="text-blue-400" aria-hidden="true">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Come Usare — box a piena larghezza (contenuto dal README.md) */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 [&_strong]:text-white [&_strong]:font-semibold">
        <h3 className="flex items-center gap-2.5 text-xl font-bold text-white mb-6">
          <BookOpen size={22} className="text-blue-400 shrink-0" />
          Come Usare Portfolio Insights
        </h3>

        <div className="space-y-8">
          {/* Passo 1: download report */}
          <div>
            <h4 className="flex items-center gap-2.5 font-semibold text-white mb-3">
              <span className="w-6 h-6 shrink-0 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400">1</span>
              <FileDown size={16} className="text-slate-400" />
              Scarica i report da Directa
            </h4>
            <p className="text-slate-400 text-sm mb-3">
              Accedi all'area personale Directa e scarica i seguenti report in formato CSV:
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wide">Report</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wide">Percorso Directa</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-300 uppercase tracking-wide">Nome file tipico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  <tr className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-white">Movimenti</td>
                    <td className="px-4 py-2.5 text-slate-400">Conto → Movimenti</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">Movimenti_*.csv</td>
                  </tr>
                  <tr className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-white">Patrimonio Totale</td>
                    <td className="px-4 py-2.5 text-slate-400">Conto → Patrimonio → Rendimento</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">PatrimonioTotale_*.csv</td>
                  </tr>
                  <tr className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-white">Portafoglio Corrente</td>
                    <td className="px-4 py-2.5 text-slate-400">Investimenti</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">P_TOTALE_*.csv</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Passo 2: importazione */}
          <div>
            <h4 className="flex items-center gap-2.5 font-semibold text-white mb-3">
              <span className="w-6 h-6 shrink-0 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400">2</span>
              <Upload size={16} className="text-slate-400" />
              Importa i file
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400 text-sm leading-relaxed">
              <li>Vai su <strong>Import</strong> nell'applicazione</li>
              <li>Carica i file CSV uno alla volta (trascina o clicca per selezionare)</li>
              <li>L'ordine consigliato: prima <strong>Movimenti</strong>, poi <strong>Patrimonio Totale</strong>, infine <strong>Portafoglio Corrente</strong></li>
            </ol>
          </div>

          {/* Passo 3: esplorazione */}
          <div>
            <h4 className="flex items-center gap-2.5 font-semibold text-white mb-3">
              <span className="w-6 h-6 shrink-0 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400">3</span>
              <Compass size={16} className="text-slate-400" />
              Esplora i dati
            </h4>
            <ul className="space-y-1.5 text-slate-400 text-sm leading-relaxed">
              <li><strong>Dashboard</strong>: panoramica con KPI e grafico storico</li>
              <li><strong>Portfolio</strong>: dettaglio delle posizioni, classifica gli asset manualmente</li>
              <li><strong>Allocazione</strong>: definisci i target per categoria e verifica le divergenze</li>
              <li><strong>Performance</strong>: analizza rendimento, rischio e drawdown</li>
              <li><strong>Movimenti</strong>: analizza i flussi di cassa con i filtri</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Repository GitHub — link in fondo alla pagina */}
      <div className="pt-6 border-t border-slate-700 flex justify-center">
        <a
          href="https://github.com/massimobottelli/Portfolio-Insights"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
          title="Repository GitHub"
        >
          <GithubIcon size={18} />
          <span>github.com/massimobottelli/Portfolio-Insights</span>
        </a>
      </div>
    </div>
  );
}

