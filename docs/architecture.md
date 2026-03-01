# Notes MVP — Architecture

## 1. Project Overview

This is a single-user Notes MVP with:

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Prisma v6
- Supabase Postgres
- Vercel deployment target

The system is designed to be:

- Cleanly layered
- Easy to extend to multi-user in future
- Safe for iterative AI-assisted development
- Simple but structurally scalable


---

## 2. Architectural Principles

### 2.1 Layered Structure (Strict Separation)

| Layer | Responsibility | Location |
|--------|---------------|----------|
| UI | Rendering + user interaction | `app/` |
| API / Server Actions | Request handling only | `app/api/*` or server actions |
| Services | Business logic | `lib/services/*` |
| Repositories | Database access only | `lib/repositories/*` |
| DB Client | Prisma client instance | `lib/db.ts` |

Rules:

- ❌ No business logic in React components
- ❌ No business logic in repositories
- ❌ No direct Prisma usage outside repositories
- ✅ Services orchestrate repositories
- ✅ Repositories encapsulate all DB access


---

## 3. Data Layer Rules

### 3.1 Prisma

- Prisma is the only way to access the database.
- All DB access flows through repository layer.
- `lib/db.ts` exports a singleton Prisma client.

### 3.2 Soft Delete Policy

- Notes are never hard-deleted by default.
- Soft delete implemented via `deletedAt: Date | null`.
- All read queries must exclude soft-deleted records by default.
- Hard delete (if implemented) must be explicit and clearly named.

### 3.3 Multi-User Readiness

Although this is a single-user MVP:

- Models support optional `userId`.
- Repository methods accept `userId?: string`.
- Filtering by `userId` should only apply when provided.
- No authentication logic is implemented in Phase 1.

This ensures future scalability without polluting current MVP.

### 3.4 Review Event Day Semantics

- `ReviewEvent.reviewedAt` stores the exact timestamp of a review action.
- `ReviewEvent.reviewBatchDate` stores the normalized day key (`DATE`) used to group reviews into a daily batch.
- Keep both fields to avoid timezone ambiguity and simplify stable daily-batch queries.


---

## 4. Domain Boundaries

### 4.1 Repository Layer

Repositories:

- Perform CRUD operations
- Apply soft-delete filtering
- Return persistence-level models (Prisma types or narrow DTOs)
- Do not compute derived data
- Do not perform validation
- Do not implement permissions

Repositories must remain thin and deterministic.


### 4.2 Service Layer

Services:

- Contain business logic
- Combine multiple repositories
- Enforce domain rules
- Implement algorithms (e.g., Review Today batch logic)
- Decide when to soft-delete or restore

Services are the brain of the application.


---

## 5. Review System Design (Phase 1 Scope)

Review mode must:

- Generate a stable daily batch
- Persist the batch selection
- Prefer notes not reviewed in last 3 days
- Exclude deleted notes
- Never reshuffle within the same day

This logic belongs in the service layer, not repository.


---

## 6. Coding Standards

- TypeScript strict mode
- Explicit return types on exported functions
- No `any`
- Small functions preferred over large ones
- No premature optimization
- Favor clarity over cleverness

AI-generated code must follow these constraints.

## 6.1 UI Internationalization (UI-only)

Scope (Phase 4+): UI strings only (labels, buttons, hints, empty states).  
Notes content is user-entered and can be any language; we do not translate or store multiple language versions of notes in MVP.

Rules:
- No hardcoded UI strings inside components (except temporary scaffolding).
- UI text must come from a centralized messages source (e.g. `lib/i18n/messages/*`).
- Services and repositories must remain language-agnostic (no locale logic in data layer).
- Locale selection is a UI concern; persist preference in cookie or localStorage.
---

## 7. Deployment Assumptions

- Production DB = Supabase Postgres
- Hosting = Vercel
- Prisma migrations handled via CLI
- No edge runtime assumptions in Phase 1
