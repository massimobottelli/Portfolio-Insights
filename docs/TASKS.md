# Development Tasks

## EPIC 1 - Project Foundation

### TASK-001
Initialize monorepo.

Status:
TODO


### TASK-002
Configure:

- pnpm
- TypeScript
- ESLint
- Prettier


### TASK-003
Create package structure:

- domain
- analytics
- importer
- infrastructure
- shared


---

# EPIC 2 - Domain

### TASK-010

Implement Asset entity.

Requirements:

- ISIN immutable
- metadata update allowed
- no infrastructure dependency


### TASK-011

Implement MarketOrder entity.


### TASK-012

Implement CashMovement entity.


### TASK-013

Implement ImportSession entity.


### TASK-014

Create domain unit tests.


---

# EPIC 3 - Persistence

### TASK-020

Create Prisma schema.


### TASK-021

Create repositories.


---

# EPIC 4 - Import

### TASK-030

Create Directa importer.


### TASK-031

Implement validation with Zod.


### TASK-032

Implement import workflow.


---

# EPIC 5 - Analytics

### TASK-040

Calculate current positions.


### TASK-041

Calculate portfolio value.


### TASK-042

Calculate KPIs.


---

# EPIC 6 - API

### TASK-050

Create portfolio endpoints.


### TASK-051

Create dashboard endpoint.


---

# EPIC 7 - Frontend

### TASK-060

Create application shell.


### TASK-061

Create dashboard.


### TASK-062

Create portfolio page.