#!/bin/bash
# ============================================================
# Test Import Movimenti Directa
# Verifica che l'importazione del CSV movimenti funzioni.
# ============================================================

set -e

CSV_FILE="Directa/Movimenti_H4091_6-8-2026.csv"

echo "=========================================="
echo "  TEST IMPORT MOVIMENTI"
echo "=========================================="

# 1. Verifica che il file CSV esista
echo ""
echo "▶ Verifico il file CSV..."
if [ ! -f "$CSV_FILE" ]; then
  echo "❌ File $CSV_FILE non trovato"
  exit 1
fi
echo "✅ File trovato: $CSV_FILE"

# 2. Avvia il server in background
echo ""
echo "▶ Avvio del server..."
node server.js &
SERVER_PID=$!

# Attendi che il server sia pronto (max 10 secondi)
echo "▶ Attendo che il server sia pronto..."
for i in $(seq 1 20); do
  if curl -s http://localhost:3000/api/analytics/dashboard > /dev/null 2>&1; then
    echo "✅ Server pronto dopo ${i} tentativi"
    break
  fi
  if [ $i -eq 20 ]; then
    echo "❌ Server non risponde dopo 10 secondi"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
  fi
  sleep 0.5
done

# 3. Leggi il CSV e invialo via API
echo ""
echo "▶ Importazione del file CSV..."
CSV_CONTENT=$(cat "$CSV_FILE")
RESPONSE=$(curl -s -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs --arg csv "$CSV_CONTENT" '{fileContent: $csv, filename: "Movimenti_H4091_6-8-2026.csv"}' <<< '{}')" 2>&1)

echo "$RESPONSE" | jq .
if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
  echo "✅ Importazione completata"
  RECORDS=$(echo "$RESPONSE" | jq '.recordsImported')
  echo "   Record importati: $RECORDS"
else
  echo "❌ Importazione fallita"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

# 4. Verifica Dashboard dopo l'import
echo ""
echo "▶ Verifica Dashboard post-import..."
DASHBOARD=$(curl -s http://localhost:3000/api/analytics/dashboard)
echo "$DASHBOARD" | jq .
echo "✅ Dashboard OK"

# 5. Verifica le sessioni di import
echo ""
echo "▶ Verifica sessioni di import..."
SESSIONS=$(curl -s http://localhost:3000/api/import/sessions)
echo "$SESSIONS" | jq .
echo "✅ Sessioni OK"

# 6. Ferma il server
echo ""
echo "▶ Fermo il server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "=========================================="
echo "  TEST COMPLETATO"
echo "=========================================="