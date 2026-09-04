# Allineare branch DEMO con le modifiche del branch MAIN

Per portare le modifiche più recenti di main dentro demo, mantenendo le specificità di demo, occorre fare un merge di main dentro demo.

```bash
 cd /opt/portfolio-insights
```

# 1. Vai sul branch demo

```bash
git checkout demo
```

# 2. Assicurati che demo sia aggiornato dal remoto

```bash
git pull origin demo
```
# 3. Recupera le ultime modifiche di tutti i branch

```bash
git fetch origin
```

# 4. Unisci main dentro demo

```bash
git merge origin/main
```

Se non ci sono conflitti, Git farà il merge automaticamente:

```bash
git push origin demo
```
