# 💻 Guida al Setup dell'Ambiente di Sviluppo

Questa guida spiega come configurare un ambiente di sviluppo locale, isolato e altamente produttivo su **macOS** utilizzando **VS Code**, sfruttando al massimo le funzionalità native di Node.js 22+.

---

## 🛠️ 1. Requisiti di Sistema (macOS)

Per evitare conflitti di permessi o versioni di Node globali sul sistema, utilizzeremo **Homebrew** e **fnm** (Fast Node Manager).

| Strumento | Scopo | Comando di Installazione |
|---|---|---|
| **Homebrew** | Gestore di pacchetti per macOS | `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"` |
| **fnm** | Gestore di versioni Node.js rapido isolato | `brew install fnm` |
| **Git** | Controllo di versione del codice | `brew install git` |

### Configurazione della Shell (Zsh)
Dopo aver installato `fnm`, esegui questo comando nel terminale per configurare l'auto-attivazione al cambio cartella:

```bash
echo 'eval "$(fnm env --use-on-cd)"' >> ~/.zshrc
source ~/.zshrc
```

---

## 📁 2. Inizializzazione del Progetto

Esegui questi comandi all'interno della cartella in cui desideri salvare il progetto:

```bash
# 1. Crea la cartella e accedi
mkdir portfolio-insights
cd portfolio-insights

# 2. Installa e imposta Node.js v22 (LTS)
fnm install 22
fnm use 22

# 3. Salva la versione di Node per il caricamento automatico futuro
node -v > .node-version

# 4. Inizializza il package.json nativo
npm init -y
```

### Configurazione del `package.json`
Apri il file `package.json` e assicurati di configurare l'applicazione come modulo ES nativo e di impostare gli script di avvio:

```json
{
  "name": "portfolio-insights",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  }
}
```

---

## ⚙️ 3. Configurazione di VS Code (Isolata)

Crea una cartella nascosta `.vscode` nella root del progetto e crea i seguenti file per isolare l'ambiente di lavoro.

### `.vscode/settings.json`
Questo file configura la formattazione automatica e pulisce le ricerche escludendo il database binario e i moduli.

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "files.exclude": {
    "**/.git": true,
    "**/node_modules": true,
    "**/db/*.db": false
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/db/*.db": true
  }
}
```

### `.vscode/extensions.json`
Suggerimenti per le estensioni di VS Code consigliate per questo progetto.

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "qwtel.sqlite-viewer"
  ]
}
```

*Nota: L'estensione **SQLite Viewer** ti permetterà di ispezionare le tabelle del database locale cliccando direttamente sul file `portfolio.db` all'interno di VS Code.*

---

## 🚀 4. Avvio dell'Ambiente in Sviluppo

Una volta completato il setup dei file sorgente (`server.js`, `database.js`, ecc.), puoi avviare l'applicazione con il comando:

```bash

fnm use 22 && npm run dev 2>&1 || echo "---TRYING_ALT---" && eval "$(fnm env --use-on-cd)" && npm run dev 2>&1


npm run dev
```

### 💡 Vantaggi di questo Setup
* **Zero ricaricamenti manuali:** Grazie al comando `node --watch`, ogni modifica salvata sul backend riavvierà il server istantaneamente.
* **Auto-Inizializzazione:** All'avvio del server, la cartella `db/` e il file `portfolio.db` verranno creati e strutturati in automatico se non presenti.
```

---
