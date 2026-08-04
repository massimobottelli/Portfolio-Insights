# Portfolio Insights

> Technical Design Document

---

# 1. Vision

## Project Overview

Portfolio Insights is a self-hostable web application that analyzes a single investment portfolio exported from the Directa broker.

The application focuses on long-term investments (ETFs, ETCs, ETNs and Stocks) and provides advanced insights into portfolio composition, historical evolution and investment performance.

---

## Problem Statement

Although Directa provides portfolio information, long-term investors often need richer analytics and a clearer overview of their investments.

Portfolio Insights consolidates Directa exports into a normalized local database and generates meaningful analytics through an internal Analytics Engine.

---

# 2. Goals & Scope

## MVP1 Goals

The first release focuses on providing a complete overview of the current portfolio.

### Supported Pages

- Dashboard
- Portfolio
- Import Manager
- Settings

### Features

- Import Directa reports
- Normalize imported data
- Persist normalized data
- Display portfolio overview
- Portfolio allocation
- Portfolio KPIs
- Basic charts
- Safe re-import without duplicates

---

## MVP2

### Pages

- Asset Detail
- Portfolio History

### Features

- Historical portfolio evolution
- Asset analytics
- Advanced charts
- Historical comparisons

---

# 3. User Workflow

## Initial Setup

The user imports Directa export files.

Supported reports:

- Current Portfolio
- Portfolio Value History
- Order History

The application parses, validates and normalizes imported data before storing it in the local database.

No manual data entry is required.

---

# 4. Architecture Principles

## Simplicity First

Introduce new technologies only when they provide a measurable benefit.

Avoid unnecessary infrastructure.

---

## Self Hostable

The application must run on any machine without depending on cloud services.

---

## Offline Capable

After importing Directa reports, the application must continue working without Internet access.

---

## AI-Friendly

The project should be optimized for AI-assisted development.

Characteristics include:

- Explicit modules
- Strong typing
- Predictable folder structure
- Low coupling
- High cohesion
- Small services

---

# 5. Data Source Strategy

Directa reports are the single source of truth.
No external APIs are required for the MVP.
The application parses three distinct export files to reconstruct the portfolio:
1. **Current Portfolio:** Used for real-time asset alignment and checking the "Valore attuale" and "Valore di carico".
2. **Portfolio Value History (Movimenti Patrimonio):** Daily balance snapshot containing Liquidità, Portafoglio, and Patrimonio.
3. **Order & Movement History (Storico Ordini/Movimenti):** The ledger of all financial transactions (BUY, SELL, Cedole, Bolli, Ritenute, Commissioni).

To guarantee idempotent imports, the importer must leverage Directa's natural transaction identifiers (`Riferimento ordine` and `Protocollo`).

---

# 6. Analytics Engine

The Analytics Engine generates every derived model used by the application.

No analytical result is permanently stored.

### MVP1 KPIs

- Total Portfolio Value
- Invested Capital
- Available Cash
- Total Profit / Loss
- Total Profit / Loss %
- Year-To-Date (YTD)

---

# 7. User Interface

## MVP1

- Dashboard
- Portfolio
- Import Manager
- Settings

## MVP2

- Asset Detail
- Portfolio History

---

# 8. Technical Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Recharts

## Backend

- Node.js
- Fastify

## Database

- SQLite
- Prisma ORM

## Validation

- Zod

---

# 9. Project Structure

The project follows a monorepo architecture.

```text
apps/
    web/
    api/

packages/
    analytics/
    domain/
    importer/
    infrastructure/
    shared/

prisma/

docs/
```

---

# 10. Development Rules

- Never access the database from the UI.
- Business logic belongs to the Analytics package.
- Importers never perform business calculations.
- Domain models are independent from Directa exports.
- Prefer composition over inheritance.
- Prefer pure functions.
- One responsibility per module.
- Avoid circular dependencies.
- Keep modules small and explicit.

---

# 11. Future Roadmap

- Docker deployment
- Automated backups
- Additional broker importers
- Advanced analytics
- Performance benchmarking

---

**End of Document**
