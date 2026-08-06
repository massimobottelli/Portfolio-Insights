#!/bin/bash
# ============================================================
# Test Portfolio Report
# Verifica che gli endpoint del report portafoglio funzionino.
# ============================================================

set -e

echo "=========================================="
echo "  TEST REPORT PORTAFOGLIO"
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

# 2. Test Dashboard
echo ""
echo "▶ Test GET /api/analytics/dashboard"
DASHBOARD=$(curl -s http://localhost:3000/api/analytics/dashboard)
echo "$DASHBOARD" | jq .
if echo "$DASHBOARD" | jq -e '.portfolioValue' > /dev/null 2>&1; then
  echo "✅ Dashboard OK"
else
  echo "❌ Dashboard fallita"
fi

# 3. Test Portfolio
echo ""
echo "▶ Test GET /api/analytics/portfolio"
PORTFOLIO=$(curl -s http://localhost:3000/api/analytics/portfolio)
echo "$PORTFOLIO" | jq .
if echo "$PORTFOLIO" | jq -e 'type == "array"' > /dev/null 2>&1; then
  echo "✅ Portfolio OK"
else
  echo "❌ Portfolio fallito"
fi

# 4. Test Allocation
echo ""
echo "▶ Test GET /api/analytics/allocation"
ALLOCATION=$(curl -s http://localhost:3000/api/analytics/allocation)
echo "$ALLOCATION" | jq .
if echo "$ALLOCATION" | jq -e 'type == "array"' > /dev/null 2>&1; then
  echo "✅ Allocation OK"
else
  echo "❌ Allocation fallita"
fi

# 5. Ferma il server
echo ""
echo "▶ Fermo il server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "=========================================="
echo "  TEST COMPLETATO"
echo "=========================================="