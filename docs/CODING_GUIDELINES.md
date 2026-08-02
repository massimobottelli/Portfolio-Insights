# Coding Guidelines

## Language

The project uses:

- TypeScript
- strict mode enabled

---

# TypeScript Rules

Always:

- define explicit types;
- avoid any;
- prefer interfaces for contracts;
- prefer readonly data structures.

Example:

GOOD:

```ts
interface Asset {
  readonly isin: string;
  readonly ticker: string;
}

BAD:
const asset:any = {};

Functions
Prefer:
small functions;
single responsibility;
pure functions.
GOOD:
calculatePositionQuantity(orders)
BAD:
calculateEverything()
Naming
Use domain language.
Preferred:
MarketOrder
CashMovement
DailyPortfolioSnapshot
Avoid:
TransactionData
GenericEntity
FinancialObject
Files
One responsibility per file.
Example:
GOOD:
domain/
  asset.ts
  market-order.ts
  cash-movement.ts
Avoid:
domain/
  everything.ts
Error Handling
Use explicit errors.
Avoid:
throw new Error("failed")
Prefer:
throw new InvalidAssetError()
Dependencies
Dependency direction:
domain

↑

analytics

↑

application

↑

infrastructure/api

↑

frontend
Never reverse dependency direction.
Comments
Write comments only when explaining WHY.
Avoid comments describing WHAT code does.

---

# 3) `docs/ARCHITECTURE.md`

```markdown
# Architecture

## Overview

Portfolio Insights follows a modular monorepo architecture.
apps
packages
database
docs

---

# Modules

## domain

Contains:

- entities;
- value objects;
- domain rules.

No external dependencies.

---

## analytics

Contains:

- portfolio calculations;
- KPIs;
- performance;
- allocation.

Consumes domain objects.

---

## importer

Contains:

- Directa parsers;
- validation;
- normalization.

Produces domain facts.

---

## infrastructure

Contains:

- database;
- repositories;
- external implementations.

---

## api

Contains:

- HTTP endpoints;
- application services.

---

## web

Contains:

- React UI;
- components;
- user interaction.

---

# Data Flow
Directa Files
  |
Importer
  |
Domain Facts
  |
Repositories
  |
Analytics Engine
  |
API
  |
Frontend

---

# Dependency Rules

Allowed:
web -> api
api -> analytics
analytics -> domain
infrastructure -> domain

Forbidden:
domain -> database
domain -> React
analytics -> Prisma
