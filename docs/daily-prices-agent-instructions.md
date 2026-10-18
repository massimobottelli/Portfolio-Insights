# Implementazione: storico e aggiornamento prezzi giornalieri tramite EODHD

## Istruzioni per il coding agent

Implementa questa funzionalità **dopo aver letto integralmente
`README.md`, tutti i documenti pertinenti in `/docs` e le regole di
sviluppo del repository (incluso `.clinerules`, se applicabile)**.
Questi documenti e il codice esistente sono la fonte di verità per
architettura, naming, convenzioni, schema SQLite, test e workflow.

Repository: https://github.com/massimobottelli/Portfolio-Insights

Prima di modificare il codice: 

1. Esamina `/docs` e individua eventuali
decisioni già documentate su prezzi, asset, database, configurazione e script. 
2. Ispeziona `database.js`, i model relativi ad `assets` e
`asset_prices`, i controller/route pertinenti, `scripts/`,
`package.json` e i test esistenti. 
3. Riutilizza lo schema e le convenzioni esistenti ove possibile. Non introdurre un secondo livello di persistenza o un framework diverso. 
4. Se il codice o la documentazione contraddicono questo documento, fermati e descrivi la discrepanza prima di introdurre una modifica incompatibile.

## 1. Obiettivo

Aggiungere la raccolta e la persistenza dei prezzi di chiusura
giornalieri degli strumenti finanziari quotati posseduti nel
portafoglio, usando EODHD come provider per gli aggiornamenti
incrementali.

L'app è locale, mono-utente e non commerciale. Il numero di strumenti è
ridotto (circa 20).

### Decisioni funzionali già prese

-   Provider per aggiornamenti incrementali: **EODHD**.
-   L'utente dispone già di una API key EODHD.
-   Il caricamento iniziale dello storico sarà eseguito manualmente
    dall'utente scaricando i dati dal provider o da altra fonte e
    preparando file CSV.
-   Va realizzato uno script one-time per importare in blocco questi CSV
    nel database SQLite locale.
-   Successivamente, EODHD sarà usato per scaricare soltanto i dati
    mancanti/nuovi dall'ultimo prezzo disponibile fino all'ultima data
    disponibile.
-   Conservare esclusivamente: **strumento, data, prezzo di chiusura**.
-   Non scaricare né memorizzare OHLC, volume, dividendi, split o altri
    dati corporate action.
-   Escludere i BTP e, in generale, le obbligazioni.
-   Includere soltanto ETF, ETN, ETC e azioni.
-   Usare come chiave funzionale il ticker della specifica
    quotazione/mercato detenuta nel portafoglio, secondo il campo
    esistente `asset.exchange` (verificarne il significato reale nel
    codice prima di usarlo). Non usare l'ISIN per interrogare EODHD,
    salvo che il progetto lo richieda esplicitamente per una mappatura;
    non sostituire il ticker di mercato con un ticker generico.
-   Non introdurre funzionalità di trading, ordini o raccomandazioni.
-   Nessuna modifica UI è richiesta, salvo che sia necessaria secondo i
    pattern del progetto per esporre l'operazione all'utente. Preferire
    inizialmente uno script/servizio backend riutilizzabile.

## 2. Ispezione obbligatoria del modello dati

Il repository usa Node.js + Express e SQLite (`node:sqlite` secondo la
documentazione pubblica del progetto), con separazione MVC. La struttura
effettiva del codice e i documenti in `/docs` prevalgono su questa
descrizione sintetica.

Prima di decidere dove salvare i dati: - Verifica lo schema attuale
della tabella `asset_prices` e il suo significato (potrebbe già
contenere prezzi correnti/medi importati dal broker, non uno storico). -
Verifica come sono rappresentati `assets`, il campo `exchange`, il
ticker e il tipo di asset. - Verifica le migrazioni/inizializzazione DB
e le convenzioni SQL esistenti. - Non sovraccaricare una tabella
esistente con una semantica incompatibile.

Se `asset_prices` non è adatta allo storico giornaliero, crea una
tabella dedicata con nome coerente con le convenzioni del progetto, per
esempio `daily_asset_closing_prices`, con almeno:

-   `asset_id` o la chiave di strumento già usata nel progetto;
-   `price_date` in formato ISO `YYYY-MM-DD`;
-   `close_price` numerico;
-   vincolo univoco su `(asset_id, price_date)` o su
    `(ticker/market key, price_date)`, in coerenza con il modello
    esistente.

Preferire una foreign key verso `assets` se lo schema e le convenzioni
del progetto la supportano. Non duplicare inutilmente nome, ISIN o
ticker nella tabella prezzi se possono essere derivati dalla tabella
asset. Se il ticker/mercato non è stabile o non è univoco nel modello
attuale, documentare il problema e proporre una soluzione coerente prima
di implementarla.

Il database deve contenere solo i tre dati funzionali richiesti:
strumento, data e prezzo di chiusura. Metadati tecnici di
sincronizzazione possono essere aggiunti solo se necessari e separati
dalla tabella dei prezzi.

## 3. Identificazione degli strumenti eleggibili

Aggiorna solo gli asset effettivamente posseduti e con un simbolo di
mercato utilizzabile.

-   Includere ETF, ETN, ETC e azioni.
-   Escludere BTP e tutte le altre obbligazioni.
-   Escludere liquidità e strumenti senza quotazione azionaria/ETF
    compatibile.
-   Basarsi sul modello e sulle classificazioni esistenti; non creare
    una seconda tassonomia parallela.
-   Il progetto usa attualmente categorie come `BOND`, `STOCK`, `FUND`,
    `COMMODITY`, `CASH`: ispezionare la classificazione reale.
    ETF/ETN/ETC potrebbero essere rappresentati da `FUND` e/o
    `COMMODITY`; includerli soltanto quando il tipo e la quotazione
    confermano che sono eleggibili. Non includere indiscriminatamente
    ogni `FUND` o `COMMODITY` se possono contenere strumenti non
    quotati.
-   La fonte primaria del simbolo da interrogare è il ticker della
    quotazione registrato nell'asset, in particolare `asset.exchange`
    come indicato dall'utente. Verificare il formato esatto e non
    assumere che il campo sia un exchange MIC o un ticker finché il
    codice non lo conferma.
-   Gestire asset senza ticker o con simbolo vuoto con un messaggio di
    warning, senza interrompere l'intero aggiornamento.

## 4. Configurazione e sicurezza della API key

Leggere la chiave da una variabile d'ambiente, ad esempio
`EODHD_API_KEY`, usando il sistema di configurazione già adottato dal
repository.

Requisiti: - Non inserire mai la chiave nel codice, in file versionati,
nei log o nelle risposte API. - Non esporre la chiave al frontend. - Non
stampare URL completi contenenti `api_token` nei log. - Se la variabile
manca, terminare con un messaggio chiaro che spieghi come
configurarla. - Se il progetto usa già `.env`, verificare che sia
ignorato da Git e documentare solo il nome della variabile in un file di
esempio privo di segreti, se coerente con le convenzioni esistenti. -
Non aggiungere una dipendenza dotenv se il progetto non la usa già,
senza una motivazione necessaria.

## 5. Integrazione EODHD

Usare l'endpoint storico EOD di EODHD, nella forma generale:

`GET https://eodhd.com/api/eod/{SYMBOL}?api_token=...&fmt=json&from=YYYY-MM-DD&to=YYYY-MM-DD`

Consultare la documentazione ufficiale EODHD aggiornata per confermare
il formato richiesto dal provider, la sintassi del simbolo per ciascuna
borsa e il comportamento dei parametri. Il simbolo passato deve essere
quello della quotazione detenuta e presente nel modello dati; non
inventare suffissi di mercato.

La risposta EODHD può contenere vari campi, ma l'app deve estrarre e
conservare **solo `date` e `close`**, collegandoli all'asset corretto.

Regole di acquisizione: - Validare status HTTP e forma del payload prima
di elaborarlo. - Gestire errori HTTP, limiti quota, JSON non valido,
risposte vuote e messaggi di errore del provider. - Non trattare
automaticamente una risposta vuota come un errore: può essere un giorno
non di negoziazione o un simbolo senza dati. Registrare un warning
leggibile. - Verificare che `date` sia una data valida `YYYY-MM-DD` e
`close` sia un numero finito e positivo. Ignorare o segnalare righe non
valide senza far fallire gli altri asset. - Conservare il prezzo `close`
così come restituito dall'endpoint. Non usare `adjusted_close`: è
esplicitamente fuori perimetro. Non calcolare rettifiche per dividendi o
split. - Usare timeout di rete ragionevole e gestire gli errori senza
lasciare transazioni aperte. - Elaborare gli asset in modo sequenziale o
con concorrenza molto limitata, rispettando la quota API del piano
utente.

## 6. Aggiornamento incrementale

Implementare una funzione di servizio riutilizzabile e un comando/script
CLI adatto al repository, ad esempio
`scripts/update-daily-closing-prices.js` (il nome definitivo deve
seguire le convenzioni esistenti).

Per ciascun asset eleggibile: 1. Recuperare la data più recente già
presente nello storico locale per quell'asset. 2. Se esiste uno storico,
richiedere dati da una finestra che includa la data più recente
memorizzata (overlap di un giorno di borsa o pochi giorni di calendario)
fino alla data odierna, così da poter correggere in modo idempotente
l'ultima osservazione se necessario. 3. Se non esiste alcun prezzo
storico, non tentare di scaricare tre anni automaticamente: lo storico
iniziale viene importato con lo script CSV. Segnalare l'asset come
"nessuno storico locale" e saltarlo, a meno che il comportamento già
documentato nel progetto stabilisca esplicitamente una diversa
procedura. 4. Interrogare EODHD usando il simbolo di mercato dell'asset.
5. Inserire o aggiornare i record tramite
`INSERT ... ON CONFLICT ... DO UPDATE` (o il pattern SQLite equivalente
già usato nel progetto), garantendo unicità per asset e data. 6. Non
duplicare prezzi a ogni esecuzione. Eseguire la scrittura in transazione
per batch piccoli/asset, seguendo i pattern del repository. 7. Per i
giorni in cui la borsa è chiusa, non sintetizzare un prezzo e non creare
righe. 8. Un eventuale prezzo della data corrente va salvato solo se
EODHD lo restituisce come chiusura giornaliera effettivamente
disponibile. Non presumere che la quotazione di oggi sia già definitiva.

L'aggiornamento deve essere idempotente: eseguirlo due volte con la
stessa risposta provider non deve cambiare il numero di righe né
produrre duplicati.

## 7. Import iniziale one-time da CSV

Implementare uno script CLI separato, per esempio
`scripts/import-daily-closing-prices.js`, che importi i CSV storici
scaricati manualmente dall'utente nel database locale.

Prima di implementarlo, controllare se il progetto ha già parser CSV o
convenzioni di importazione riutilizzabili (`utils/`, script e import
controller). Riutilizzare quanto possibile.

Requisiti: - Supportare uno o più CSV, con percorso passato da CLI. -
Documentare il formato CSV atteso e gestire in modo esplicito le
intestazioni. - Formato canonico consigliato per l'import normalizzato:
`symbol,date,close`, con date ISO `YYYY-MM-DD`. Se la fonte scaricata
usa altre intestazioni o formati, consentire di normalizzarli o fornire
un'opzione esplicita; non indovinare silenziosamente date ambigue. - Il
simbolo deve essere associato a un asset esistente tramite il
ticker/chiave di mercato. Se non è possibile identificare un solo asset,
rifiutare la riga con errore diagnostico; non creare asset
automaticamente. - Accettare decimali con punto nel formato canonico. Se
si supportano CSV locali con virgola decimale, gestire correttamente
delimitatori e quoting e documentarlo. - Importare esclusivamente data e
prezzo di chiusura. Ignorare gli altri campi. - Validare data e prezzo.
Rifiutare o riportare le righe malformate senza interrompere
l'importazione delle righe valide. - Usare transazioni e upsert per
rendere sicuro il re-import dello stesso file. - Produrre un riepilogo
finale: file elaborati, righe lette, inserite, aggiornate/già presenti,
scartate, asset non riconosciuti e errori. - Non cancellare mai in massa
lo storico esistente e non effettuare operazioni distruttive
implicite. - Deve essere possibile eseguire un dry-run (se coerente con
le convenzioni CLI) per validare il file prima di scrivere nel DB.

Questo import è un'operazione one-time in termini di workflow, ma deve
comunque essere idempotente e sicuro in caso di riesecuzione
accidentale.

## 8. Interfaccia operativa e log

Preferire CLI/backend nella prima versione; non è richiesta una pagina
frontend.

I comandi devono: - fornire `--help` o istruzioni equivalenti; -
indicare chiaramente il numero di asset eleggibili, aggiornati, saltati
e falliti; - continuare con gli asset successivi quando fallisce un
singolo simbolo; - restituire exit code non-zero se ci sono errori che
rendono l'operazione incompleta, mantenendo comunque un riepilogo; - non
registrare API key o URL completi contenenti segreti; - non mostrare
falsi successi se l'API restituisce un errore.

Documentare in un file Markdown coerente con la struttura `/docs`: -
configurazione `EODHD_API_KEY`; - formato CSV; - comandi di import
iniziale; - comando di aggiornamento incrementale; - limiti e
comportamenti noti.

## 9. Test richiesti

Aggiungere test con Vitest e seguire gli standard già presenti. Non
usare chiamate reali a EODHD nei test automatici: mockare `fetch` o
isolare il client HTTP.

Copertura minima:

1.  Selezione degli asset: ETF/ETN/ETC/azioni incluse;
    BTP/obbligazioni/liquidità escluse.
2.  Asset senza simbolo ignorato con warning.
3.  Parsing EODHD: memorizza solo `date` e `close`, ignora
    open/high/low/adjusted_close/volume.
4.  Validazione di date e prezzi invalidi.
5.  Incrementalità: la data di partenza è determinata dall'ultimo record
    locale con overlap per l'ultima osservazione.
6.  Asset senza storico locale: non scarica automaticamente anni di
    dati.
7.  Upsert idempotente su `(asset, date)`, inclusa l'eventuale
    correzione dell'ultimo prezzo.
8.  Import CSV con righe valide, duplicate, non valide e ticker
    sconosciuto.
9.  CSV importato due volte non crea duplicati.
10. API key mancante, errore HTTP, JSON malformato e risposta vuota.
11. Un asset in errore non impedisce di processare gli altri.
12. Tutti i test esistenti continuano a passare.

## 10. Criteri di accettazione

La funzionalità è completata quando:

-   [x] Il coding agent ha letto `/docs` e seguito le convenzioni
    documentate.
-   [x] Lo schema persistente memorizza soltanto asset, data e prezzo
    close per la serie storica.
-   [x] BTP, bond e cash sono esclusi; ETF, ETN, ETC e stock eleggibili
    sono inclusi.
-   [x] Il simbolo EODHD deriva dal ticker della quotazione memorizzato
    nel progetto, senza suffissi inventati.
-   [x] La API key è solo lato server/CLI e non appare nei log o nel
    repository.
-   [x] È possibile importare uno storico CSV in blocco in modo
    idempotente e non distruttivo.
-   [x] L'aggiornamento incrementale opera solo sugli asset con storico
    locale, usa un intervallo incrementale con overlap e aggiorna
    tramite upsert.
-   [x] Sono gestiti errori per singolo asset e prodotto un riepilogo
    operativo.
-   [x] I test automatici coprono i casi sopra e non chiamano la rete
    reale.
-   [x] Test suite e build/typecheck previsti dal progetto passano.
-   [x] La documentazione descrive come configurare ed eseguire entrambe
    le operazioni.

## 11. Vincoli di implementazione

-   Non rifattorizzare parti non correlate.
-   Non cambiare la semantica delle tabelle `asset_prices` o degli
    import Directa esistenti senza una necessità verificata.
-   Non alterare i calcoli di performance/rischio esistenti in questa
    attività.
-   Non introdurre una UI, scheduler o job automatico in background non
    richiesti. L'aggiornamento può essere lanciato manualmente da CLI
    nella prima versione.
-   Non includere API key, dati personali del broker o CSV del
    portafoglio nel repository.
-   Prima di concludere, riepilogare file modificati, schema scelto,
    comandi d'uso, test eseguiti e ogni limite residuo.
