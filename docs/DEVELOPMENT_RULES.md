# Development Rules

## Purpose

This document defines the rules that every developer and AI coding assistant
must follow when contributing to Portfolio Insights.

The goal is to keep the codebase:
- predictable;
- maintainable;
- testable;
- AI-friendly.

---

# General Principles

## Simplicity First

Prefer the simplest implementation that satisfies the requirements.

Do not introduce:
- unnecessary frameworks;
- premature abstractions;
- complex patterns without measurable benefit.

---

## Domain First

Business concepts must be implemented inside the domain layer.

The domain must not depend on:
- databases;
- HTTP frameworks;
- UI components;
- external services.

---

## Explicit Over Clever

Prefer:

- clear names;
- small modules;
- explicit dependencies;
- simple functions.

Avoid:
- magic behavior;
- hidden side effects;
- excessive abstraction.

---

# Layer Rules

## Frontend

The frontend:

CAN:
- display data;
- manage user interaction;
- call backend APIs.

CANNOT:
- access database;
- calculate financial metrics;
- contain business rules.

---

## API Layer

The API layer:

CAN:
- validate HTTP requests;
- orchestrate application services;
- return responses.

CANNOT:
- contain financial calculations;
- directly manipulate Prisma models.

---

## Analytics Layer

Analytics:

MUST:
- contain business calculations;
- use pure functions when possible;
- receive data as input.

Analytics:

MUST NOT:
- access database directly;
- depend on HTTP;
- mutate persisted data.

---

## Import Layer

Importers:

ARE responsible for:
- reading external files;
- parsing;
- validation;
- mapping.

Importers:

MUST NOT:
- calculate portfolio metrics;
- create analytics;
- modify business state directly.

---

## Infrastructure Layer

Infrastructure contains:

- Prisma;
- repositories;
- database implementations.

Only infrastructure can know persistence details.

---

# Database Rules

The database stores only imported facts.

Allowed persisted entities:

- Asset
- MarketOrder
- CashMovement
- DailyPortfolioSnapshot
- ImportSession

Derived concepts are never persisted:

- Portfolio
- Position
- Allocation
- Performance
- Dashboard
- KPIs

---

# Testing Rules

Every business rule requires tests.

Priority:

1. Domain tests
2. Analytics tests
3. Import tests
4. API tests
5. UI tests

---

# AI Assistant Rules

Before creating code:

1. Read DESIGN.md
2. Read DOMAIN_MODEL.md
3. Read this document
4. Understand existing architecture

Never:
- create new layers without approval;
- move business logic into UI;
- bypass repositories;
- invent domain entities.