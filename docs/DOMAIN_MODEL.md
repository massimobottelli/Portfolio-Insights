# DOMAIN MODEL

> Portfolio Insights Domain Model

---

# 1. Domain Philosophy

Portfolio Insights is not a portfolio management system.

It is an analytical system built on top of immutable financial facts imported from Directa.

The application does not create financial data.

It imports, normalizes and interprets existing financial information.

The domain is therefore divided into two layers:

* Persisted Facts
* Derived Insights

Only imported facts are persisted.

All analytical models are calculated.

---

# 2. Domain Architecture Principle

The core domain flow is:

```
Directa Reports

        ↓

Imported Financial Facts

        ↓

Analytics Engine

        ↓

Derived Insights
```

The application must never persist calculated portfolio states.

Examples of derived information:

* Portfolio value
* Current positions
* Allocation
* Performance
* Dashboard metrics
* KPIs

These are always calculated from imported facts.

---

# 3. Ubiquitous Language

## Asset

A financial instrument that can be traded and held inside the portfolio.

An Asset represents the identity of an instrument.

It does not represent ownership, valuation or performance.

Examples:

* ETF
* ETC
* ETN
* Stock
* Bond

---

## MarketOrder

A market operation that changes the quantity owned of an Asset.

Examples:

* Buy
* Sell

A MarketOrder affects portfolio composition.

---

## CashMovement

A financial movement that affects account liquidity but does not change asset ownership.

Examples:

* Dividend
* Coupon payment
* Tax withholding
* Commission
* Broker fee

---

## Daily Portfolio Snapshot

The official portfolio valuation imported from Directa for a specific date.

It represents external reality at a given point in time.

It is never calculated by the application.

---

## Position

The current holding of an Asset.

A Position is not persisted.

It is calculated from:

* MarketOrders
* CashMovements
* Portfolio snapshots (when applicable)

---

## Portfolio

The current state of the investment account.

A Portfolio is a derived model composed of:

* Current Positions
* Available Cash

---

## Analytics

Every calculated metric, chart or statistic generated from imported facts.

Analytics are never persisted.

---

## Import Session

Represents a single import execution.

Used for:

* traceability;
* auditing;
* import history.

---

# 4. Persisted Facts

The MVP1 domain persists only:

```
Asset

MarketOrder

CashMovement

DailyPortfolioSnapshot

ImportSession
```

---

# 5. Derived Models

The following concepts exist only in memory:

```
Portfolio

Position

Allocation

Performance

Dashboard

KPIs
```

---

# 6. Entity Model

---

# Asset

## Purpose

Represents the identity of a financial instrument.

An Asset describes what the instrument is, independently from ownership or valuation.

---

## Identity

The natural identity of an Asset is the ISIN.

The ISIN uniquely identifies the financial instrument.

Broker-specific identifiers are not used as domain identifiers.

---

## Attributes

| Attribute    | Required | Source             | Notes                  |
| ------------ | -------- | ------------------ | ---------------------- |
| ISIN         | Yes      | Directa reports    | Natural identifier     |
| Ticker       | Yes      | Directa reports    | Trading symbol         |
| Name         | Yes      | Directa reports    | Instrument description |
| Currency     | Yes      | Directa reports    | Trading currency       |
| Asset Type   | Yes      | Unknown in MVP1    | ETF, ETC, Stock, Bond  |
| Exchange     | No       | Future enrichment  | Trading venue          |
| Directa Code | No       | Future integration | Broker identifier      |

---

## Asset Type

Asset Type represents the financial category of the instrument.

Possible values:

```
ETF
ETC
ETN
STOCK
BOND
FUND
UNKNOWN
```

In MVP1:

* the attribute exists in the model;
* the default value is UNKNOWN;
* no automatic classification is performed.

Future versions may enrich this information through:

* external instrument databases;
* ISIN classification;
* manual classification.

---

## Lifecycle

An Asset is created during import when a new ISIN is encountered.

Example:

Historical Orders import:

```
ISIN:
IE00BDFL4P12

Ticker:
X.SXRS

Description:
ISHARES DIV COMM SWAP ETF
```

creates:

```
Asset

ISIN: IE00BDFL4P12
Ticker: X.SXRS
Name: ISHARES DIV COMM SWAP ETF
Currency: EUR
Asset Type: UNKNOWN
```

Rules:

* ISIN cannot change.
* Metadata can be updated.
* Historical references must remain valid.

---

## Relationships

```
Asset

    |
    +---- MarketOrders

    |
    +---- CashMovements (when asset related)

    |
    +---- Position (derived)
```

---

## Business Rules

* Two Assets cannot share the same ISIN.
* ISIN is immutable.
* Asset does not contain quantity.
* Asset does not contain price.
* Asset does not contain performance data.
* Asset deletion is forbidden if referenced by imported facts.

---

## Ownership

### Imported from

* Current Portfolio Report
* Historical Orders Report

### Updated by

* Importer only

### Used by

* Analytics Engine
* Portfolio View
* Dashboard

---

# MarketOrder

## Purpose

Represents a market operation that changes ownership of an Asset.

A MarketOrder is an immutable financial fact imported from Directa.

---

## Examples

```
Acquisto

Vendita
```

---

## Attributes

| Attribute       | Required | Notes                        |
| --------------- | -------- | ---------------------------- |
| Operation Date  | Yes      | Execution date               |
| Value Date      | Yes      | Settlement date              |
| Asset           | Yes      | Related financial instrument |
| Operation Type  | Yes      | BUY / SELL                   |
| Quantity        | Yes      | Number of units              |
| Euro Amount     | Yes      | Total monetary value         |
| Currency Amount | No       | Original currency value      |
| Currency        | Yes      | Transaction currency         |
| Order Reference | No       | Directa order identifier     |

---

## Business Rules

* A MarketOrder must reference an existing Asset.
* A MarketOrder cannot be modified after import.
* A MarketOrder changes the derived Position quantity.
* Fees and taxes are not MarketOrders.

---

## Ownership

### Imported from

* Historical Orders Report

### Updated by

* Importer only

### Used by

* Analytics Engine
* Position calculation
* Performance calculation

---

# CashMovement

## Purpose

Represents a financial movement affecting account liquidity.

A CashMovement does not change asset ownership.

---

## Examples

```
Commission

Dividend

Coupon payment

Tax withholding
```

---

## Attributes

| Attribute       | Required | Notes                        |
| --------------- | -------- | ---------------------------- |
| Operation Date  | Yes      | Movement date                |
| Value Date      | Yes      | Settlement date              |
| Movement Type   | Yes      | Commission, Dividend, Tax... |
| Asset           | No       | Optional related instrument  |
| Euro Amount     | Yes      | Signed monetary value        |
| Currency Amount | No       | Original amount              |
| Currency        | Yes      | Transaction currency         |
| Order Reference | No       | Related order                |

---

## Business Rules

* CashMovements affect available cash.
* CashMovements do not modify asset quantity.
* CashMovements are immutable after import.
* Tax and fee records belong here.

---

## Ownership

### Imported from

* Historical Orders Report

### Updated by

* Importer only

### Used by

* Cash balance calculation
* Performance calculation
* Analytics Engine

---

# 7. MVP1 Design Decisions

## FinancialTransaction

A generic FinancialTransaction entity is intentionally not introduced in MVP1.

The domain uses two explicit concepts:

```
MarketOrder

CashMovement
```

Classification rule:

```
Does the event change asset quantity?

YES → MarketOrder

NO → CashMovement
```

This keeps the model simple while preserving future evolution possibilities.

---

# 8. Architectural Rule

The frontend must never access persistence directly.

The allowed flow is:

```
Dashboard

↓

Analytics Service

↓

Repositories

↓

Database
```

Never:

```
Dashboard

↓

Database
```

Business logic belongs inside the domain and analytics layers.
