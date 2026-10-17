# TASK: Crea un video promozionale cinematografico per Portfolio Insights usando Remotion

## 1. Ruolo e obiettivo

Agisci come un senior creative developer specializzato in Remotion, motion design, video marketing per prodotti SaaS e interfacce fintech.

Devi realizzare un video promozionale completo per **Portfolio Insights**, un'applicazione web self-hostable per analizzare un portafoglio di investimenti importato da Directa.

Il risultato deve sembrare un video di lancio di un prodotto software curato da un team professionale di motion designer e product designer: tipografia precisa, animazioni fluide, transizioni intenzionali, grafici animati, UI credibile e una narrazione chiara.

Non realizzare una semplice slideshow, un mockup statico o una sequenza di schermate con zoom casuali. Tutte le animazioni devono essere progettate e implementate nativamente in Remotion.

### Risorse ufficiali

- Repository: https://github.com/massimobottelli/Portfolio-Insights
- Logo ufficiale: https://raw.githubusercontent.com/massimobottelli/Portfolio-Insights/refs/heads/main/client/public/android-chrome-512x512.png
- Screenshot di riferimento: immagine allegata alla conversazione.

Prima di iniziare, esamina il repository e individua le schermate, i componenti, le metriche e le funzionalità effettivamente implementate. Usa il README come punto di partenza, ma verifica il codice quando necessario.

Se il repository dell'applicazione è già disponibile nell'ambiente, riutilizzalo come riferimento. Non modificare il funzionamento dell'applicazione originale per implementare il video.

## 2. Direzione creativa

### Concept

**“Il tuo portafoglio. Una visione più chiara.”**

Portfolio Insights trasforma report finanziari e movimenti di investimento in una visione analitica del portafoglio: valore, composizione, performance e rischio.

Il video deve raccontare questa trasformazione:

1. I dati degli investimenti sono frammentati.
2. Portfolio Insights li organizza in una dashboard leggibile.
3. Le performance diventano visibili nel tempo.
4. L'allocazione e il rischio diventano più facili da analizzare.
5. L'utente ottiene una visione strutturata del proprio portafoglio.

### Tono

- Tecnologico, preciso e contemporaneo.
- Premium, ma sobrio.
- Analitico e orientato ai dati.
- Credibile, senza promesse finanziarie.
- Elegante, senza effetti vistosi fini a sé stessi.

Prendi ispirazione dal motion design dei prodotti SaaS di fascia alta e dalle presentazioni di software analytics.

Evita estetiche da trading aggressivo, criptovalute speculative, neon eccessivi, grafici da borsa generici, monete che volano, banconote, razzi o elementi stock-finance.

## 3. Specifiche del video

Realizza una composizione principale con queste caratteristiche:

- Durata: 60 secondi.
- Formato: 16:9.
- Risoluzione: 1920 × 1080.
- Frame rate: 30 fps.
- Totale: 1800 frame.
- Formato di esportazione: MP4 H.264.
- Audio: colonna sonora originale o utilizzabile legalmente, con sound design discreto.
- Lingua: italiano.
- Destinazione: landing page, GitHub README, demo del prodotto e social.
- Rendering: Remotion CLI.

Prevedi una struttura che consenta di produrre successivamente anche una versione verticale 9:16 e una versione breve da 30 secondi senza riscrivere tutte le animazioni.

Usa `staticFile()` per le risorse locali e le API ufficiali di Remotion per timeline, audio, immagini e rendering. Non dipendere da caricamenti remoti durante il rendering finale.

## 4. Identità visiva

### Palette

Usa lo screenshot allegato e il logo ufficiale come fonti primarie. La palette seguente è una base iniziale da verificare e calibrare visivamente.

- Background principale: `#0B1426`
- Background secondario: `#101B2E`
- Card: `#1E2B3F`
- Card alternative: `#202E42`
- Bordi e separatori: `#2C3B50`
- Testo primario: `#F4F7FC`
- Testo secondario: `#8D9DB3`
- Blu brand: `#4C9BFF`
- Verde brand: `#27D99A`
- Ciano per grafici: `#28B8F5`
- Giallo per metriche e accenti: `#FFBD35`
- Rosso per variazioni negative: `#F06464`

Questi valori sono indicativi. Verifica il logo e i colori effettivi dell'app, quindi crea token CSS o costanti condivise per mantenere coerenza.

### Regole cromatiche

- Usa il navy come colore dominante.
- Usa il blu per il capitale investito, elementi informativi e dettagli dell'interfaccia.
- Usa il verde per risultati positivi e accenti del brand.
- Usa il ciano per linee, selezioni e grafici secondari.
- Riserva giallo e rosso alle informazioni che ne giustificano l'uso.
- Non colorare ogni elemento con un colore diverso.
- Evita gradienti saturi su tutta la schermata.

I gradienti devono essere leggeri e utilizzati solo per dare profondità a sfondi, logo o superfici selezionate.

### Logo

Scarica il logo ufficiale dalla URL indicata e salvalo tra gli asset locali del progetto Remotion.

Verifica il risultato dopo averlo importato: il logo ufficiale contiene un monogramma PI blu e verde su fondo scuro, con un trattamento tridimensionale.

Non ridisegnare il monogramma, non modificarne le proporzioni e non sostituirlo con un logo generico.

Puoi creare una versione di presentazione del logo tramite maschere, dissolvenze, leggere traslazioni e illuminazione controllata, mantenendo intatto il disegno originale.

### Tipografia

Utilizza una sans-serif moderna, leggibile e coerente con un prodotto analytics.

Preferenze:
- Inter, se disponibile localmente.
- In alternativa, una sans-serif equivalente già presente nel progetto.

Definisci una gerarchia chiara:
- Headline: 64–88 px.
- Titoli di sezione: 34–48 px.
- Metriche principali: 54–80 px.
- Testi descrittivi: 24–30 px.
- Etichette UI: 14–20 px.

Le dimensioni devono essere calibrate sulla composizione reale, non applicate meccanicamente.

Le headline devono essere leggibili anche quando il video viene visualizzato in un player più piccolo.

### Linguaggio delle interfacce

Ricrea il linguaggio visivo dello screenshot:

- Sidebar verticale scura.
- Card con angoli arrotondati.
- KPI in evidenza.
- Grafico storico con griglia sottile.
- Grafico ad anello per l'allocazione.
- Legende compatte.
- Icone lineari.
- Bordi poco contrastati.
- Spaziatura generosa.
- Contrasto elevato tra valori e sfondo.

Non mostrare l'interfaccia del browser, la barra degli indirizzi o il desktop del computer.

La UI deve apparire come una finestra applicativa pulita, centrata su uno sfondo scuro e pronta per essere presentata.

## 5. Architettura tecnica

Utilizza Remotion con React e TypeScript.

Prima di installare dipendenze o modificare file:
1. Analizza la struttura del progetto esistente.
2. Controlla `package.json` e la versione di Remotion eventualmente già installata.
3. Identifica eventuali componenti riutilizzabili.
4. Scegli una struttura che non interferisca con l'applicazione originale.
5. Documenta le decisioni tecniche essenziali.

Se non esiste un progetto video, crea una directory dedicata, ad esempio `video/`, con un progetto Remotion autonomo.

Se esiste già un progetto Remotion, integrati nella struttura attuale invece di crearne uno duplicato.

### Struttura suggerita

- `src/Root.tsx`: registrazione delle composizioni.
- `src/PortfolioInsightsVideo.tsx`: composizione principale.
- `src/components/`: elementi UI riutilizzabili.
- `src/scenes/`: scene narrative.
- `src/animations/`: helper per grafici, contatori e transizioni.
- `src/data/`: dataset dimostrativi espliciti.
- `src/styles/`: palette, tipografia e token.
- `public/assets/`: logo, eventuali font e risorse audio.

Puoi adattare questa struttura se una diversa organizzazione migliora il progetto.

### Requisiti Remotion

- Usa `useCurrentFrame()` e `useVideoConfig()` per tutte le animazioni temporali.
- Usa `interpolate()` e `spring()` per transizioni, entrate e movimenti.
- Usa `Sequence` o una struttura equivalente per segmentare la timeline.
- Usa `AbsoluteFill` per le composizioni a schermo intero.
- Usa `staticFile()` per gli asset locali.
- Usa `Audio` e i controlli di volume appropriati per la colonna sonora.
- Usa `Easing` e interpolazioni con clamp quando necessario.
- Mantieni le animazioni deterministiche e riproducibili.

Non usare CSS animation, `setTimeout`, `setInterval`, animazioni dipendenti dall'orologio reale o stati casuali per pilotare il video.

Evita dipendenze da browser API, chiamate di rete durante il rendering e componenti che non funzionano in un ambiente headless.

Tutte le scene devono essere renderizzabili a un frame arbitrario, senza dipendere dai frame precedenti.

## 6. Storyboard dettagliata

La timeline seguente è vincolante come struttura narrativa. Puoi rifinire i singoli timing per rendere le transizioni più naturali, mantenendo la durata totale di 60 secondi.

### SCENA 1 — Apertura e brand
**00:00–00:05 | Frame 0–149**

Obiettivo: introdurre il brand con un'apertura elegante e memorabile.

Visual:
- Sfondo navy quasi nero.
- Leggera trama geometrica o griglia finanziaria, quasi impercettibile.
- Piccoli punti luminosi si connettono formando linee sottili.
- Il logo PI emerge progressivamente dal buio.
- Leggera profondità con movimento di camera simulato.
- Il logo si stabilizza al centro.

Testo:

“Portfolio Insights”

Sottotitolo:

“Una visione più chiara dei tuoi investimenti.”

Animazioni:
- Fade-in del background.
- Logo con scala da circa 94% a 100%.
- Opacità da 0 a 1.
- Headline con entrata verticale di pochi pixel.
- Un breve accento luminoso blu-verde, senza bagliori eccessivi.

La musica inizia con un impulso morbido e un leggero sound design digitale.

Transizione: il logo si sposta verso l'angolo superiore sinistro e diventa il brand della successiva interfaccia.

### SCENA 2 — Dal dato alla visione
**00:05–00:12 | Frame 150–359**

Obiettivo: mostrare il problema e introdurre la soluzione.

Apertura:
- Breve sequenza di righe, numeri e colonne che richiamano report finanziari.
- Elementi tabellari astratti, ordinati ma inizialmente frammentati.
- Non mostrare documenti o loghi di terze parti non necessari.

Headline:

“Dal dato alla visione.”

Sottotitolo:

“Organizza il tuo portafoglio in un'unica dashboard.”

Trasformazione:
- Le colonne si allineano.
- I dati convergono in card.
- Le card formano progressivamente la dashboard di Portfolio Insights.
- La sidebar entra da sinistra.
- Il grafico storico si disegna.
- I KPI compaiono con una sequenza di entrate sfalsate.

La transizione deve sembrare una trasformazione ordinata dei dati, non una dissolvenza generica.

### SCENA 3 — La dashboard
**00:12–00:22 | Frame 360–659**

Obiettivo: presentare il valore immediato del prodotto.

Visual principale:
- Dashboard ricostruita in React e CSS.
- Sidebar simile a quella dello screenshot.
- Card del valore del portafoglio.
- Profit & Loss.
- Capitale investito.
- Liquidità.
- Grafico storico.
- Grafico ad anello dell'allocazione.

Headline:

“Tutto il tuo portafoglio. A colpo d'occhio.”

Animazione:
1. La dashboard entra con una scala delicata.
2. Le card si assestano con un leggero effetto spring.
3. Il valore totale cresce da zero al valore dimostrativo.
4. Il Profit & Loss compare in verde.
5. Il grafico storico si disegna da sinistra a destra.
6. L'area sottostante la curva si illumina gradualmente.
7. Il grafico ad anello si costruisce segmento per segmento.

Usa il layout reale dello screenshot come riferimento. Non cercare di animare lo screenshot come fosse un video: ricostruisci i componenti principali per ottenere testo nitido e movimenti controllati.

I valori finanziari devono provenire da un dataset dimostrativo definito nel progetto. Puoi ispirarti allo screenshot, ma non presentare quei numeri come risultati tipici o garantiti.

Se utilizzi i valori visibili nello screenshot, specifica che si tratta di dati dimostrativi.

### SCENA 4 — Performance nel tempo
**00:22–00:31 | Frame 660–929**

Obiettivo: rendere visibile l'evoluzione storica del portafoglio.

La dashboard si espande e il grafico storico occupa gran parte dello schermo.

Headline:

“Le performance, nel loro contesto.”

Sottotitolo:

“Segui l'evoluzione del portafoglio nel tempo.”

Animazione del grafico:
- Disegna la curva del valore del portafoglio da sinistra a destra.
- Mostra separatamente il capitale investito.
- Anima la linea TWR come serie distinta.
- Evidenzia il punto corrente con un marker discreto.
- Visualizza una linea verticale di tracking che avanza lungo il grafico.
- Evidenzia un intervallo temporale con una selezione sottile.
- Fai apparire le etichette con transizioni brevi e leggibili.

Utilizza le tre serie coerenti con l'app: Portfolio, Investito e TWR, se confermate nel codice.

Assicurati che le scale siano corrette: il valore monetario del portafoglio e il rendimento percentuale TWR non devono condividere impropriamente lo stesso asse.

La curva deve essere generata da dati espliciti e deterministici, con una progressione credibile. Non usare rumore casuale.

Non costruire una curva che mostri una crescita costante e perfetta. La sequenza deve sembrare un esempio di storico reale, con variazioni, fasi laterali e oscillazioni.

Testo conclusivo:

“Capisci come si è mosso il tuo capitale.”

### SCENA 5 — Allocazione e ribilanciamento
**00:31–00:40 | Frame 930–1199**

Obiettivo: mostrare la capacità di leggere la composizione del portafoglio e confrontarla con gli obiettivi.

Visual:
- Il grafico storico si riduce e si sposta sullo sfondo.
- Il grafico ad anello diventa protagonista.
- Le categorie di asset compaiono in sequenza.
- Una vista attuale-versus-target si affianca al grafico.
- Le deviazioni vengono evidenziate con accenti cromatici controllati.

Headline:

“Una composizione più leggibile.”

Sottotitolo:

“Confronta l'allocazione attuale con i tuoi obiettivi.”

Se la funzionalità è confermata nel codice, mostra un esempio di soglia di tolleranza e una deviazione che supera la soglia.

Puoi quindi animare un'indicazione “COMPRA” o “VENDI” per rappresentare il comportamento implementato nell'applicazione.

Queste indicazioni devono essere chiaramente presentate come output dimostrativi dell'analisi rispetto ai target configurati, non come raccomandazioni finanziarie autonome.

Le animazioni devono:
- Far crescere i segmenti dell'anello secondo le percentuali.
- Conservare la somma del 100%.
- Usare colori coerenti con la legenda.
- Evidenziare una categoria selezionata.
- Far comparire la differenza tra percentuale attuale e target.

Non inventare categorie o algoritmi di ribilanciamento che non siano supportati dal prodotto.

### SCENA 6 — Performance e rischio
**00:40–00:48 | Frame 1200–1439**

Obiettivo: differenziare Portfolio Insights da una dashboard che mostra soltanto il saldo.

Headline:

“Non solo rendimento. Anche rischio.”

Mostra una sequenza di metriche, utilizzando quelle realmente disponibili:
- TWR cumulativo.
- CAGR.
- Volatilità.
- Sharpe Ratio.
- Maximum Drawdown.
- Rendimenti mensili e annuali.

Non tentare di visualizzarle tutte contemporaneamente. Seleziona quattro metriche principali e anima il passaggio tra le relative schede.

Visual:
- KPI numerici.
- Barre mensili positive e negative.
- Heatmap dei rendimenti.
- Curva di drawdown con area evidenziata.
- Brevi annotazioni tecniche.

Animazioni:
- Contatori numerici deterministici.
- Barre che crescono o scendono da una linea di riferimento.
- Heatmap che si rivela progressivamente.
- Evidenziazione del massimo drawdown e della successiva fase di recupero, se i dati dimostrativi lo supportano.

Headline secondaria:

“Più strumenti per leggere la storia del tuo portafoglio.”

Non utilizzare un indicatore verde come sinonimo universale di qualità. Le metriche negative devono essere rappresentate con una semantica appropriata.

### SCENA 7 — Importazione e controllo
**00:48–00:54 | Frame 1440–1619**

Obiettivo: mostrare come i dati entrano nell'applicazione e chiarire il modello di utilizzo.

Headline:

“Parti dai tuoi dati.”

Visual:
- Tre file CSV stilizzati.
- Etichette: “Movimenti”, “Patrimonio Totale”, “Portafoglio Corrente”.
- I file entrano in un'area di importazione.
- Un indicatore di completamento mostra l'elaborazione.
- La dashboard si aggiorna con i dati importati.

Sottotitolo:

“Importa i report Directa e analizza il tuo portafoglio.”

Se supportato dal codice, aggiungi una breve transizione che mostri la persistenza locale dei dati e l'architettura self-hostable.

Non dichiarare che l'applicazione è completamente offline in ogni circostanza: il recupero dei tassi di cambio BCE può richiedere accesso alla rete.

Non utilizzare claim come “sicurezza assoluta”, “dati sempre protetti” o “nessun rischio”.

### SCENA 8 — Chiusura e call to action
**00:54–01:00 | Frame 1620–1799**

Obiettivo: chiudere con un messaggio memorabile e invitare alla scoperta del progetto.

Visual:
- La UI si riduce lentamente.
- Gli elementi si ricompongono in una composizione pulita.
- Il logo PI ritorna al centro.
- Il nome Portfolio Insights compare sotto il logo.
- La musica raggiunge il punto conclusivo e si attenua.

Headline:

“Portfolio Insights”

Sottotitolo:

“Il tuo portafoglio. Una visione più chiara.”

Call to action:

“Scopri il progetto su GitHub.”

Mostra l'indirizzo:

`github.com/massimobottelli/Portfolio-Insights`

Se la demo live è ancora disponibile e verificata, puoi aggiungere una seconda call to action più discreta:

“Prova la demo.”

Includi un disclaimer breve e leggibile nella parte inferiore:

“Progetto amatoriale e sperimentale. Informazioni a scopo informativo, non consulenza finanziaria.”

Mantieni il disclaimer sufficientemente visibile, senza ridurlo a testo illeggibile.

La schermata finale deve restare stabile abbastanza a lungo da consentire la lettura del link.

## 7. Componenti UI da implementare

Crea componenti React riutilizzabili per ricostruire l'interfaccia.

### Dashboard

`DashboardScene`
- Sidebar.
- Header.
- Card del valore del portafoglio.
- Card Profit & Loss.
- Card capitale investito.
- Card liquidità.
- Grafico storico.
- Grafico di allocazione.

### KPI

`MetricCard`
- Titolo.
- Valore.
- Eventuale variazione.
- Colore semantico.
- Icona lineare.
- Animazione di entrata.
- Animazione del valore opzionale.

### Grafici

`PortfolioHistoryChart`
- Linea valore portafoglio.
- Linea capitale investito.
- Serie TWR.
- Griglia.
- Assi distinti.
- Marker corrente.
- Area riempita.
- Animazione progressiva.

`AllocationDonut`
- Segmenti SVG.
- Percentuali.
- Legenda.
- Evidenziazione di categoria.
- Animazione del disegno.

`MonthlyReturnsChart`
- Barre positive e negative.
- Linea di riferimento.
- Entrata progressiva delle barre.

`DrawdownChart`
- Serie di drawdown.
- Area evidenziata.
- Marker peak/trough quando supportati dai dati.

Preferisci SVG e componenti React per i grafici animati. Se utilizzi Recharts, verifica che le animazioni siano pienamente controllate dal frame Remotion e non dipendano dal tempo del browser. Per grafici personalizzati, preferisci coordinate SVG derivate direttamente dal frame corrente.

Non usare screenshot statici dei grafici come sostituti delle animazioni.

## 8. Sistema di animazione

Definisci un sistema coerente di motion design.

### Principi

- Entrate rapide ma non brusche.
- Transizioni con accelerazione e decelerazione naturali.
- Movimento minimo quando l'informazione è già chiara.
- Profondità ottenuta con scala, traslazione e opacità.
- Nessun movimento casuale.
- Nessun effetto elastico eccessivo.
- Nessun elemento che si muova senza una funzione narrativa.

### Durate indicative

- Fade-in: 8–15 frame.
- Entrata di card: 12–20 frame.
- Transizioni tra scene: 15–24 frame.
- Disegno dei grafici: 35–75 frame.
- Contatori numerici: 25–45 frame.
- Assestamento finale: 8–12 frame.

Sono valori di partenza da adattare alla durata di ogni scena.

Usa `spring()` per gli elementi UI che devono assestarsi naturalmente. Usa `interpolate()` con curve di easing appropriate per grafici, dissolvenze e progressioni.

Prevedi entrate sfalsate tra card e testi, evitando che tutti gli elementi appaiano contemporaneamente.

### Transizioni tra scene

Utilizza una combinazione controllata di:
- Morphing visivo tra layout.
- Zoom leggero su una card.
- Scorrimento orizzontale.
- Maschere di rivelazione.
- Dissolvenza.
- Trasformazione di un grafico da componente della dashboard a visual principale.

Quando possibile, riutilizza lo stesso elemento tra una scena e la successiva. Per esempio, una linea del grafico può espandersi fino a occupare lo schermo e diventare il grafico principale della scena successiva.

Questo crea continuità narrativa e riduce l'effetto di sequenza di slide indipendenti.

## 9. Dataset e correttezza finanziaria

Tutti i dati del video devono essere espliciti, centralizzati e deterministici.

Crea un file dedicato, ad esempio `src/data/demoPortfolio.ts`, che contenga:
- Valore del portafoglio.
- Capitale investito.
- Liquidità.
- Profit & Loss.
- Serie storica.
- Serie TWR.
- Allocazione.
- Rendimenti mensili.
- Dati per drawdown e metriche di rischio.

Non distribuire valori finanziari arbitrari direttamente nei componenti.

### Regole

1. Usa dati di esempio chiaramente identificabili.
2. Non inventare funzionalità presentate come esistenti.
3. Non presentare i numeri dimostrativi come risultati ottenibili dagli utenti.
4. Se mostri valori finanziari coerenti tra loro, calcolali o derivali da un unico dataset.
5. Rispetta la distinzione tra rendimento ponderato per il tempo e rendimento ponderato per i flussi monetari.
6. Non sommare rendimenti mensili in modo aritmetico quando la metrica richiede capitalizzazione composta.
7. Non mostrare contemporaneamente valori monetari e percentuali sulla stessa scala senza una giustificazione corretta.
8. Evita risultati numerici che contraddicano le formule implementate nel progetto.

Se possibile, riutilizza formule e logiche effettive dell'applicazione senza importare nel progetto Remotion dipendenze backend non necessarie.

Se non è possibile ottenere dati reali, utilizza dati sintetici coerenti e dichiarali come dimostrativi.

## 10. Voce narrante e sound design

Prevedi una colonna sonora elettronica minimalista, con una progressione elegante e controllata.

Caratteristiche:
- Atmosfera tecnologica e analitica.
- Ritmo moderato.
- Bassi morbidi.
- Texture digitali discrete.
- Piccoli accenti sonori durante la comparsa dei KPI.
- Transizioni sonore leggere.
- Chiusura musicale pulita.

Evita musica epica, aggressiva o simile a una pubblicità bancaria tradizionale.

Se non disponi di una traccia audio con licenza appropriata, crea il progetto in modo che la traccia possa essere sostituita facilmente. Non scaricare o incorporare musica senza verificarne i diritti.

Prevedi un voice-over italiano facoltativo, sincronizzato con le scene.

### Testo proposto per la voce narrante

“Il tuo portafoglio racconta una storia.

Portfolio Insights ti aiuta a leggerla con maggiore chiarezza.

Riunisci i dati dei tuoi investimenti in un'unica dashboard.

Segui l'evoluzione del portafoglio, confronta il capitale investito e analizza le performance nel tempo.

Esplora l'allocazione, verifica gli scostamenti dai tuoi obiettivi e approfondisci le metriche di rischio.

Importa i report Directa e trasforma i dati in una visione più strutturata.

Portfolio Insights. Il tuo portafoglio, una visione più chiara.

Scopri il progetto su GitHub.”

La voce deve avere un tono italiano naturale, adulto e professionale. Evita una lettura enfatica da spot televisivo.

Se non è disponibile un file di voice-over, il video deve poter essere renderizzato integralmente con i testi a schermo e la musica. Non generare un falso file vocale o lasciare riferimenti ad asset inesistenti.

## 11. Testi e localizzazione

Tutti i testi promozionali devono essere in italiano.

Utilizza la formattazione italiana dei numeri:
- Separatore delle migliaia: punto.
- Separatore decimale: virgola.
- Valuta: euro.

Evita testo troppo piccolo, paragrafi lunghi e animazioni che rendono impossibile la lettura.

Non utilizzare inglese nelle headline promozionali, ma conserva le etichette inglesi presenti nell'applicazione quando fanno parte della UI reale, ad esempio Profit & Loss o TWR.

Mantieni i testi delle scene in un file centralizzato per facilitare future traduzioni.

## 12. Qualità visiva e criteri di accettazione

Il video finale deve rispettare tutti i seguenti criteri.

### Identità
- Logo ufficiale corretto.
- Palette coerente con screenshot e logo.
- Interfaccia visivamente fedele all'applicazione.
- Tipografia nitida.
- Gerarchia visiva evidente.

### Motion design
- Nessuna scena completamente statica, salvo pause intenzionali.
- Grafici animati progressivamente.
- KPI animati in modo controllato.
- Transizioni coerenti tra scene.
- Nessun elemento fuori dai margini.
- Nessun testo tagliato o sovrapposto.
- Nessun movimento casuale.

### Correttezza
- Tutte le funzionalità mostrate sono verificate nel repository.
- I dati dimostrativi sono identificabili.
- Le metriche sono rappresentate correttamente.
- Nessuna promessa di rendimento.
- Nessuna affermazione di consulenza finanziaria.
- Disclaimer presente nella chiusura.

### Qualità tecnica
- TypeScript compilabile.
- Nessun errore di rendering.
- Nessun asset mancante.
- Nessuna dipendenza dalla rete durante il rendering finale.
- Timeline deterministica.
- Rendering completo a 1920 × 1080, 30 fps e 60 secondi.
- Audio sincronizzato e con volume controllato.

## 13. Procedura di implementazione

Procedi in questo ordine.

**Fase 1 — Analisi**
- Esamina repository e screenshot.
- Verifica le funzionalità.
- Definisci la palette finale.
- Crea una breve mappa delle scene.

**Fase 2 — Setup**
- Configura Remotion.
- Prepara gli asset.
- Definisci composizione, risoluzione e frame rate.
- Implementa i token grafici.

**Fase 3 — Componenti**
- Realizza i componenti UI.
- Implementa i grafici SVG.
- Crea il sistema di transizioni.
- Centralizza i dati.

**Fase 4 — Storyboard**
- Implementa tutte le otto scene.
- Sincronizza testi, grafici e transizioni.
- Integra musica e voice-over, se disponibile.

**Fase 5 — Rendering e controllo**
- Genera un'anteprima di tutte le scene.
- Controlla i frame iniziali, centrali e finali.
- Verifica i punti di transizione.
- Correggi eventuali problemi di layout, leggibilità o sincronizzazione.
- Esegui il rendering completo.

Non fermarti a un'implementazione teorica o a un singolo componente dimostrativo. Completa l'intera composizione e verifica il risultato esportato.

## 14. Deliverable finali

Consegna:

1. Il progetto Remotion completo e funzionante.
2. Il video promozionale finale MP4, 1920 × 1080, 30 fps, 60 secondi.
3. Una versione di anteprima a risoluzione ridotta per controlli rapidi.
4. Tutti gli asset locali necessari al rendering.
5. Il dataset dimostrativo centralizzato.
6. Un README con istruzioni per installazione, anteprima, rendering e modifica della durata.
7. Una breve documentazione per sostituire logo, palette, dati, musica e testi.
8. La struttura predisposta per creare successivamente le versioni 9:16 e 30 secondi.

Aggiungi comandi npm chiari per avviare Remotion Studio e generare il video MP4.

Al termine, riporta:
- I file principali creati.
- Il comando esatto per renderizzare il video.
- Il percorso effettivo del file MP4 generato.
- Eventuali limitazioni, asset mancanti o verifiche ancora necessarie.

**Priorità assoluta:** un video completo, elegante, coerente con Portfolio Insights e con animazioni native Remotion. La qualità della narrazione, la fedeltà visiva alla UI e la leggibilità dei dati sono più importanti della quantità di effetti.
