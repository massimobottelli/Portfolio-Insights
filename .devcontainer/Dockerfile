# Utilizziamo l'immagine ufficiale di Node.js 20 basata su Debian Bookworm (stabile e leggera)
FROM mcr.microsoft.com/devcontainers/javascript-node:20-bookworm

# Installiamo SQLite3 (necessario per il database locale del progetto)
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# Abilitiamo Corepack per gestire pnpm automaticamente (leggerà la versione dal package.json)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Impostiamo l'utente non-root predefinito fornito dall'immagine per motivi di sicurezza
USER node
