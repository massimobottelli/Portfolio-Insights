# =============================================================================
#  Portfolio Insights — Dockerfile (multi-stage)
# =============================================================================
#  Build:
#    docker build -t portfolio-insights .
#
#  Run:
#    docker run -d --name portfolio-insights --init -p 3000:3000 \
#      -v portfolio-data:/app/db portfolio-insights
#
#  Oppure con Compose:  docker compose up -d
#
#  Note:
#    - Node 22.13+ è obbligatorio: il backend usa il modulo nativo node:sqlite
#      (senza il flag --experimental-sqlite a partire dalla 22.13.0).
#    - I dati persistono in /app/db (volume): db/portfolio.db + db/.api-token.
#    - Se API_TOKEN non è impostato, l'app genera un token al primo avvio e lo
#      stampa nei log (docker logs portfolio-insights).
#    - Serve connettività in uscita verso data-api.ecb.europa.eu (tassi ECB).
# =============================================================================

# ---------- Stage 1: build del frontend React --------------------------------
FROM node:22-slim AS client-builder

# Il build del client richiede config/ perché:
#   - vite.config.ts risolve l'alias "@config" in ../config
#   - client/tsconfig.json include "../config"
WORKDIR /app
COPY config/ ./config/

# Dipendenze del client in un layer separato (cache-friendly)
COPY client/package.json client/package-lock.json ./client/
RUN npm --prefix client ci

# Sorgenti del client e build: l'output viene scritto in /app/public
# (vite.config.ts: outDir = ../public)
COPY client/ ./client/
RUN npm --prefix client run build

# ---------- Stage 2: immagine di runtime -------------------------------------
FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Solo dipendenze di produzione (express): vitest è devDependency.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Backend (pattern MVC: routes -> controllers -> models -> node:sqlite)
COPY app.js server.js database.js ./
COPY config/ ./config/
COPY controllers/ ./controllers/
COPY middleware/ ./middleware/
COPY models/ ./models/
COPY routes/ ./routes/
COPY utils/ ./utils/

# Frontend compilato nello stage precedente
COPY --from=client-builder /app/public ./public

# Cartella dati persistente (SQLite + token API), scrivibile dall'utente non-root
RUN mkdir -p /app/db && chown -R node:node /app/db
VOLUME ["/app/db"]

USER node

EXPOSE 3000

# Healthcheck senza curl (node:22-slim non lo include): usa fetch() globale
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
