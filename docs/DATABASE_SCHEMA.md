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
ISIN (Internal database ID is generated, but ISIN remains a unique business key).

Fields:
- id: String (UUID or Auto-increment)
- isin: String (Unique, Indexed)
- ticker: String
- name: String
- currency: String (e.g., "EUR", "USD")
- assetType: AssetType (Enum: ETF, ETC, ETN, STOCK, BOND, FUND, COMMODITY, CASH, UNKNOWN)
- exchange: String (Nullable)
- directaCode: String (Nullable, mapping internal Directa code if present, e.g., M.512272)

Rules:
- ISIN unique
- ISIN immutable
- Asset type can be manually updated by the user via PATCH `/api/assets/:id/type`
- On re-import, if the user has manually classified an asset (e.g. "ETF"), the type is preserved and not overwritten by "UNKNOWN"

---

## MarketOrder
Purpose:
Represents ownership changing operations (BUY/SELL).

Fields:
- id: String (UUID)
- assetId: String (FK to Asset)
- operationDate: DateTime (Operation Date)
- valueDate: DateTime (Value Date/Settlement)
- type: OrderType (Enum: BUY, SELL)
- quantity: Decimal (To support fractional shares if broker allows, or Int)
- euroAmount: Decimal (Negative for BUY, Positive for SELL)
- currencyAmount: Decimal (Amount in original asset currency, Nullable)
- currency: String (Transaction currency, e.g., "EUR", "USD")
- orderReference: String (Indexed. Directa order identifier used for grouping orders, commissions, and taxes)
- importSessionId: String (FK to ImportSession)

Rules:
- Immutable after import.
- Duplicates are allowed (Directa may generate identical CSV rows for partial executions).

---

## CashMovement
Purpose:
Represents liquidity changes that do not alter asset quantity.

Fields:
- id: String (UUID)
- assetId: String (FK to Asset, Nullable — null for taxes, deposits, withdrawals)
- operationDate: DateTime
- valueDate: DateTime
- movementType: MovementType (Enum: DEPOSIT, WITHDRAWAL, DIVIDEND, INTEREST, TAX, COMMISSION, STAMP_DUTY, OTHER)
- euroAmount: Decimal (Signed value: positive for inflows/dividends, negative for taxes/fees)
- currencyAmount: Decimal (Nullable)
- currency: String (e.g., "EUR")
- protocol: String (Unique transaction protocol from Directa, Nullable but highly recommended for tracking)
- orderReference: String (FK to MarketOrder.orderReference, Nullable. Links commissions/taxes directly to an order)
- importSessionId: String (FK to ImportSession)

Rules:
- Immutable after import.
- Unique constraint on `protocol` (when present) or (operationDate, movementType, euroAmount, assetId) to guarantee idempotency.

### Causali Directa → MovementType

Il mapping deterministico delle causali in italiano dai report Directa ai `MovementType` è definito nella sezione 9 del `DOMAIN_MODEL`. Le causali attualmente supportate sono:

| Causale Directa (IT) | MovementType | Segno Atteso |
|---|---|---|
| Acquisto | `MarketOrder` (BUY) | Negativo (`-`) |
| Vendita | `MarketOrder` (SELL) | Positivo (`+`) |
| Cedola obb. | `INTEREST` | Positivo (`+`) |
| Rit.cedola obb. | `TAX` | Negativo (`-`) |
| Rit. etf | `TAX` | Negativo (`-`) |
| Commissioni | `COMMISSION` | Negativo (`-`) |
| Bollo portafoglio titoli\* | `STAMP_DUTY` | Negativo (`-`) |
| Conferimento con bonifico | `DEPOSIT` | Positivo (`+`) |
| Incasso dividendi italia | `DIVIDEND` | Positivo (`+`) |
| Ritenuta dividendi italia | `TAX` | Negativo (`-`) |
| Tobin tax italia | `TAX` | Negativo (`-`) |
| St.rimborso obbl. a scade | `OTHER` | Variabile |
| St.rit.debito disaggio | `OTHER` | Variabile |
| Rit.debito disaggio | `TAX` | Negativo (`-`) |
| Rimborso obbl. a scadenza | `OTHER` | Positivo (`+`) |
| Ratei pass.obb. | `OTHER` | Negativo (`-`) |
| Rit.ratei pass.obb. | `TAX` | Positivo (`+`) |
| Rit.credito disaggio | `OTHER` | Positivo (`+`) |

---

## DailyPortfolioSnapshot
Purpose:
External portfolio valuation imported from Directa. Represents the exact valuation of the portfolio at a specific date.

Fields:
- id: String (UUID)
- snapshotDate: DateTime (Unique index)
- portfolioValue: Decimal (Total portfolio value in EUR)
- availableCash: Decimal (Total cash on hand)
- investedCapital: Decimal (Book value / Valore di carico total)
- importSessionId: String (FK to ImportSession)

---

## AssetPrice
Purpose:
Stores the current market price and average book price for each asset, extracted from the Directa portfolio report (P_TOTALE).

Fields:
- id: String (UUID)
- assetId: String (FK to Asset)
- currentPrice: Decimal (Current unit market price)
- averagePrice: Decimal (Average book cost per unit)
- extractionDate: DateTime (Date when the portfolio report was generated)
- importSessionId: String (FK to ImportSession)

Rules:
- Unique constraint on (assetId, extractionDate)
- On re-import of the same report, the existing record is replaced (INSERT OR REPLACE logic)
- Used by the Analytics Engine to calculate current position values and gain/loss

---

## ImportSession
Purpose:
Import traceability.

Fields:
- id: String (UUID)
- filename: String
- importDate: DateTime
- status: ImportStatus (Enum: SUCCESS, FAILED)
- recordsImported: Int
- errors: String (Nullable, error logs if failed)