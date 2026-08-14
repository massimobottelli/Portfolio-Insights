# BACKLOG: Pianificazione asset allocation

## Feature: Asset allocation target e attuale, ribilanciamenti necessari

**Obiettivo:** aggiungere una sezione dedicata alla pianificazione dell'asset allocation del portafoglio. L'utente definisce un'allocazione target per categoria di asset, il sistema calcola l'allocazione attuale e mostra le divergenze, suggerendo i ribilanciamenti necessari (compra/vendi) per allinearsi al target.

---

## 1. Catalogo Asset Type

### Stato attuale

Il catalogo asset type è definito in `config/assetTypes.js` con 9 tipi:

```
ETF
ETC
ETN
STOCK
BOND
FUND
COMMODITY
CASH
UNKNOWN
```

L'associazione asset → tipo è nella colonna `assets.asset_type` (default `UNKNOWN`), modificabile via PATCH `/api/assets/:id/type`.

### Nuovo catalogo

Il catalogo diventa una tabella DB dedicata `asset_types` con 6 tipi:

```
BOND
STOCK
CASH
FUND
COMMODITY
UNKNOWN
```

- `UNKNOWN` è un tipo **tecnico** per le nuove importazioni, **non target-abile**.
- I tipi `ETF`, `ETC`, `ETN` vengono **decommissionati**.

### Migrazione

- Gli asset esistenti con tipi decommissionati (`ETF`, `ETC`, `ETN`) vengono assegnati a `UNKNOWN`.
- L'utente riclassifica manualmente gli asset `UNKNOWN` tramite il dropdown nella pagina Portfolio (limitato ai 5 tipi validi).
- La migrazione è **manuale**: nessuna mappatura automatica ETF/ETC/ETN → FUND.

---

## 2. Modello dati

### Tabella `asset_types`

| Colonna   | Tipo   | Note                          |
|-----------|--------|-------------------------------|
| id        | TEXT   | PK                            |
| name      | TEXT   | BOND, STOCK, CASH, FUND, COMMODITY, UNKNOWN |
| is_targetable | INTEGER | 1 per i 5 tipi, 0 per UNKNOWN |

### Tabella `allocation_targets`

| Colonna        | Tipo    | Note                                    |
|----------------|---------|-----------------------------------------|
| id             | TEXT    | PK                                      |
| asset_type_id  | TEXT    | FK → asset_types.id                     |
| target_percent | REAL    | Percentuale target (0-100)              |
| tolerance      | REAL    | Soglia di tolleranza globale (default 5%) |

### Vincoli

- `UNIQUE(asset_type_id)` — un solo target per categoria.
- La somma dei `target_percent` deve essere **100%** (validata a livello applicativo e UI).
- `assets.asset_type` mantiene FK verso `asset_types.name` (o `asset_types.id`).

---

## 3. Allocazione attuale (calcolata a runtime)

L'allocazione attuale è un **insight derivato**, mai persistito. Viene calcolata a runtime.

### Categorie

L'allocazione attuale è raggruppata per `asset_type`:

- **BOND** — asset con tipo BOND (con correzione BTP: quantità / 100)
- **STOCK** — asset con tipo STOCK
- **FUND** — asset con tipo FUND
- **COMMODITY** — asset con tipo COMMODITY
- **CASH** — `available_cash` dall'ultimo snapshot + asset con tipo CASH
- **UNKNOWN** — asset non classificati (mostrati ma non target-abili)

### Base di calcolo

La base totale per le percentuali è:

```
totale = somma(valore mercato posizioni) + available_cash
```

dove:

- `valore mercato posizione = quantità × prezzo corrente` (con correzione BTP)
- `available_cash` = campo `available_cash` dell'ultimo snapshot (`daily_portfolio_snapshots`)

### Formula

Per ogni categoria:

```
allocazione_attuale_% = (valore_categoria / totale) × 100
```

---

## 4. Allocazione target

### Configurazione utente

L'utente definisce la percentuale target per ciascuna delle 5 categorie target-abili:

```
BOND       40%
STOCK      30%
FUND       20%
COMMODITY   5%
CASH        5%
```

### Validazione

- La somma dei target deve essere **esattamente 100%**.
- La UI mostra un **errore in tempo reale** se la somma ≠ 100%.
- Il salvataggio è **bloccato** finché la somma non è 100%.

### Persistenza

Il target è persistito nella tabella `allocation_targets`.

---

## 5. Divergenza e ribilanciamento

### Soglia di tolleranza

- Soglia **globale**, configurabile dall'utente.
- **Default: 5%**.
- Il ribilanciamento viene suggerito solo se la deviazione assoluta supera la soglia.

### Calcolo divergenza

Per ogni categoria:

```
divergenza_% = allocazione_attuale_% - target_%
divergenza_€ = (allocazione_attuale_% - target_%) / 100 × totale
```

La base è il **totale incluso il cash**.

### Suggerimenti compra/vendi

Quando la divergenza supera la soglia:

- **Sotto target** (divergenza negativa oltre soglia) → suggerimento **COMPRA**:
  ```
  COMPRA €X di BOND
  ```
- **Sopra target** (divergenza positiva oltre soglia) → suggerimento **VENDI**:
  ```
  VENDI €X di STOCK
  ```

L'importo suggerito è l'**importo esatto** per allinearsi al target (differenza in €), non per rientrare nella soglia.

I suggerimenti sono a **livello di categoria**, senza indicare quale asset specifico comprare/vendere.

---

## 6. API backend

Seguendo l'architettura MVC esistente:

```
React
  ↓
Express Route
  ↓
Controller
  ↓
Models / SQLite
```

### Endpoint

#### `GET /api/asset-types`

Restituisce il catalogo asset type:

```json
{
  "assetTypes": [
    { "name": "BOND", "isTargetable": true },
    { "name": "STOCK", "isTargetable": true },
    { "name": "CASH", "isTargetable": true },
    { "name": "FUND", "isTargetable": true },
    { "name": "COMMODITY", "isTargetable": true },
    { "name": "UNKNOWN", "isTargetable": false }
  ]
}
```

#### `GET /api/allocation/current`

Restituisce l'allocazione attuale calcolata a runtime:

```json
{
  "totalValue": 100000,
  "categories": [
    {
      "assetType": "BOND",
      "value": 40000,
      "percent": 40.0
    },
    {
      "assetType": "STOCK",
      "value": 30000,
      "percent": 30.0
    }
  ]
}
```

#### `GET /api/allocation/target`

Restituisce il target configurato:

```json
{
  "tolerance": 5.0,
  "targets": [
    { "assetType": "BOND", "targetPercent": 40.0 },
    { "assetType": "STOCK", "targetPercent": 30.0 }
  ]
}
```

#### `PUT /api/allocation/target`

Salva il target. Validazioni:

- Somma target = 100% (altrimenti `400 Bad Request`).
- Solo categorie target-abili.
- `tolerance` > 0.

```json
{
  "tolerance": 5.0,
  "targets": [
    { "assetType": "BOND", "targetPercent": 40.0 },
    { "assetType": "STOCK", "targetPercent": 30.0 }
  ]
}
```

### Moduli

Suggerisco un modulo dedicato:

```
models/
  allocationModel.js
```

con funzioni:

```
getAssetTypes()
getAllocationTargets()
saveAllocationTarget()
calculateCurrentAllocation()
calculateDivergences()
calculateRebalancingSuggestions()
```

---

## 7. Frontend — pagina Allocazione Portfolio

### Navigazione

Nuova pagina dedicata:

```
Dashboard
Portfolio
Allocazione   ← nuova
Analytics
Movimenti
Import
```

### Layout suggerito

```
┌──────────────────────────────────────────────────────┐
│ Allocazione Portfolio                                │
├──────────────────────────────────────────────────────┤
│ Target Allocation                    [Salva]         │
│                                                      │
│ BOND       [40] %                                   │
│ STOCK      [30] %                                   │
│ FUND       [20] %                                   │
│ COMMODITY   [5] %                                   │
│ CASH        [5] %                                   │
│                                                      │
│ Somma: 100%  ✅                                     │
│ (oppure: Somma: 95%  ❌ Deve essere 100%)           │
├──────────────────────────────────────────────────────┤
│ Soglia di tolleranza: [5] %                         │
├──────────────────────────────────────────────────────┤
│ Allocazione attuale vs target                       │
│                                                      │
│ Categoria  Attuale  Target  Divergenza  Azione      │
│ BOND       42,3%    40%     +2,3%      —            │
│ STOCK      25,1%    30%     -4,9%      COMPRA €4.900│
│ FUND       20,0%    20%      0,0%      —            │
│ COMMODITY   4,2%     5%     -0,8%      —            │
│ CASH        8,4%     5%     +3,4%      —            │
├──────────────────────────────────────────────────────┤
│ Suggerimenti ribilanciamento                        │
│                                                      │
│ ⚠️ COMPRA €4.900 di STOCK                           │
│ (deviazione -4,9% oltre soglia 5%)                  │
└──────────────────────────────────────────────────────┘
```

### Componenti

- **TargetEditor** — input percentuali per categoria, somma in tempo reale, errore se ≠ 100%, blocco salvataggio.
- **ToleranceInput** — input soglia globale (default 5%).
- **AllocationTable** — tabella attuale vs target vs divergenza (% e €).
- **RebalancingSuggestions** — lista suggerimenti compra/vendi.
- **UnknownAssetsBanner** — banner "N asset non classificati" se esistono asset UNKNOWN.

### Comportamento

- La tabella mostra solo le 5 categorie target-abili.
- Gli asset UNKNOWN non compaiono nella tabella ma attivano il banner.
- I suggerimenti compaiono solo per categorie con deviazione assoluta > soglia.
- L'importo suggerito è l'importo esatto per allinearsi al target.

---

## 8. Test obbligatori

### Unit test — calcolo

**Allocazione attuale**

- posizioni per categoria correttamente aggregate;
- correzione BTP (quantità / 100);
- categoria CASH = available_cash + asset type cash;
- base totale = posizioni + cash;
- asset senza prezzo esclusi.

**Divergenza**

- categoria sotto target;
- categoria sopra target;
- categoria allineata;
- divergenza % e € corretti.

**Suggerimenti**

- deviazione sotto soglia → nessun suggerimento;
- deviazione sopra soglia → suggerimento COMPRA/VENDI;
- importo esatto per allineare al target;
- soglia default 5%.

**Validazione target**

- somma = 100% → valido;
- somma ≠ 100% → invalido;
- categoria non target-abile → invalido;
- tolerance ≤ 0 → invalido.

### API test

- `GET /api/asset-types` → 200, catalogo corretto;
- `GET /api/allocation/current` → 200, struttura corretta;
- `GET /api/allocation/target` → 200, target e tolerance;
- `PUT /api/allocation/target` → 200 con somma 100%;
- `PUT /api/allocation/target` → 400 con somma ≠ 100%;
- `PUT /api/allocation/target` → 400 con categoria non target-abile;
- `PUT /api/allocation/target` → 400 con tolerance ≤ 0.

### Frontend test

- validazione somma in tempo reale (errore se ≠ 100%);
- blocco salvataggio con somma ≠ 100%;
- rendering tabella attuale vs target;
- rendering suggerimenti compra/vendi;
- banner asset non classificati.

---

## 9. Acceptance criteria

La feature può essere considerata completata quando:

- [ ] Il catalogo asset type è una tabella DB (`asset_types`) con 6 tipi (BOND, STOCK, CASH, FUND, COMMODITY, UNKNOWN).
- [ ] I tipi ETF, ETC, ETN sono decommissionati.
- [ ] Gli asset esistenti con tipi decommissionati sono migrati a UNKNOWN.
- [ ] UNKNOWN è un tipo tecnico non target-abile.
- [ ] Il dropdown in Portfolio mostra solo i 5 tipi validi.
- [ ] È disponibile una nuova pagina "Allocazione Portfolio".
- [ ] L'utente può configurare il target per le 5 categorie.
- [ ] La somma dei target deve essere 100% (errore in tempo reale, blocco salvataggio).
- [ ] La soglia di tolleranza è configurabile (default 5%).
- [ ] L'allocazione attuale è calcolata a runtime per categoria.
- [ ] La categoria CASH include available_cash + asset type cash.
- [ ] La base di calcolo è il totale incluso il cash.
- [ ] La divergenza è mostrata in % e in € per categoria.
- [ ] I suggerimenti compra/vendi compaiono solo oltre la soglia.
- [ ] L'importo suggerito è l'importo esatto per allinearsi al target.
- [ ] I suggerimenti sono a livello di categoria (senza asset specifico).
- [ ] Gli asset UNKNOWN attivano un banner informativo.
- [ ] Il target è persistito in tabella DB dedicata (`allocation_targets`).
- [ ] L'allocazione attuale non è persistita (calcolata a runtime).
- [ ] Tutti i calcoli hanno test automatici.
- [ ] L'implementazione mantiene il funzionamento offline dell'applicazione.
- [ ] La UI è responsive.

---

## 10. Struttura della feature

In termini di sviluppo la dividerei in 5 task principali:

1. **Catalogo Asset Type**
   - Tabella `asset_types`
   - Migrazione ETF/ETC/ETN → UNKNOWN
   - Aggiornamento `config/assetTypes.js` e frontend

2. **Modello dati target**
   - Tabella `allocation_targets`
   - CRUD target

3. **Backend API**
   - `GET /api/asset-types`
   - `GET /api/allocation/current`
   - `GET /api/allocation/target`
   - `PUT /api/allocation/target`

4. **Frontend — pagina Allocazione Portfolio**
   - Target editor con validazione somma 100%
   - Tabella attuale vs target vs divergenza
   - Suggerimenti ribilanciamento
   - Banner asset non classificati

5. **Test**
   - Unit (calcolo, divergenza, suggerimenti, validazione)
   - API (CRUD target, validazioni)
   - Frontend (validazione in tempo reale, rendering)