# Database Schema

## Philosophy

The database stores immutable financial facts imported from Directa.

Calculated information is never stored.

---

# Persisted Entities

## Asset

Purpose:

Represents the identity of a financial instrument.

Key:

ISIN


Fields:

- id
- isin
- ticker
- name
- currency
- assetType
- exchange
- directaCode


Rules:

- ISIN unique
- ISIN immutable

---

# MarketOrder

Purpose:

Represents ownership changing operations.

Examples:

- BUY
- SELL


Fields:

- id
- assetId
- operationDate
- valueDate
- type
- quantity
- euroAmount
- currency
- orderReference


Immutable after import.

---

# CashMovement

Purpose:

Represents liquidity changes.

Examples:

- dividend
- commission
- tax


Fields:

- id
- assetId nullable
- operationDate
- valueDate
- movementType
- euroAmount
- currency
- orderReference


Immutable after import.

---

# DailyPortfolioSnapshot

Purpose:

External portfolio valuation imported from Directa.

It represents reality at a specific date.

Never calculated.

---

# ImportSession

Purpose:

Import traceability.

Fields:

- id
- filename
- importDate
- status
- recordsImported
- errors