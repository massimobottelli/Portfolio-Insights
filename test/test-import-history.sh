#!/bin/bash
# ============================================================
# Test Import Storico Patrimonio Directa
# Verifica che l'importazione del CSV Patrimonio funzioni.
# ============================================================

set -e

CSV_FILE="Directa/PatrimonioTotale_H4091_20260806.csv"

echo "=========================================="
echo "  TEST IMPORT PATRIMONIO"
echo "=========================================="

# 1. Avvia il server in background
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

# 2. Leggi il CSV e invialo via API
echo ""
echo "▶ Importazione del file CSV Patrimonio..."
CSV_CONTENT=$(cat "$CSV_FILE")
RESPONSE=$(curl -s -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs --arg csv "$CSV_CONTENT" '{fileContent: $csv, filename: "PatrimonioTotale_H4091_20260806.csv"}' <<< '{}')" 2>&1)

echo "Response: $RESPONSE" | head -5
echo "$RESPONSE" | jq .
if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
  echo "✅ Importazione completata"
  RECORDS=$(echo "$RESPONSE" | jq '.recordsImported')
  echo "   Record importati: $RECORDS"
else
  echo "❌ Importazione fallita"
fi

# 3. Verifica il database
echo ""
echo "▶ Verifica snapshot nel database..."
SNAPSHOT_COUNT=$(sqlite3 db/portfolio.db "SELECT COUNT(*) FROM daily_portfolio_snapshots;")
echo "   Snapshot nel DB: $SNAPSHOT_COUNT"

# 4. Verifica Dashboard
echo ""
echo "▶ Verifica Dashboard..."
DASHBOARD=$(curl -s http://localhost:3000/api/analytics/dashboard)
echo "$DASHBOARD" | jq .
echo "✅ Dashboard OK"

# 5. Ferma il server
echo ""
echo "▶ Fermo il server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "=========================================="
echo "  TEST COMPLETATO"
echo "=========================================="