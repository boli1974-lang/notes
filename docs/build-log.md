# Phase 1 Implementation

## 2026-02-24

### Technical Summary (what changed, which files)
- Implemented Phase 1 note data access with typed CRUD, soft-delete defaults, optional restore/hard delete, and optional `userId` scoping in `lib/repositories/noteRepository.ts`.
- Added Prisma fail-fast env handling in `prisma.config.ts` so `DATABASE_URL` is validated at startup and typed as `string`.
- Added a minimal repository smoke script in `scripts/smoke-note-repo.ts` for create/read/list/soft-delete/restore checks.
- Confirmed schema supports soft delete and multi-user readiness (`deletedAt`, nullable `userId`) in `prisma/schema.prisma`.

### Architectural Rationale (why we structured it this way)
- Kept repository as persistence-only (query construction + Prisma CRUD) to match strict layering in `docs/architecture.md`.
- Put soft-delete behavior at repository boundary so services/routes get safe defaults automatically.
- Kept `userId?: string` optional at method boundaries to support single-user now and multi-user later without API churn.

### List the files changed
- `lib/repositories/noteRepository.ts`
- `prisma.config.ts`
- `scripts/smoke-note-repo.ts`
- `prisma/schema.prisma`
- `lib/db.ts`
- `lib/repositories/notesRepo.ts`
- `lib/repositories/tagsRepo.ts`
- `lib/repositories/reviewRepo.ts`

### Include invariants (e.g., soft delete rules, review batch stability)
- Notes are soft-deleted by default (`deletedAt` set), and default reads exclude deleted notes.
- Hard delete is explicit-only (`hardDeleteNote`) and never default behavior.
- Repository methods are persistence-only; business rules remain in services.
- Review batch stability remains a service-level invariant (same-day stable batch, no reshuffle after mark reviewed), not repository logic.

### What I Should Understand Conceptually (principles / mental models)
- Repositories are deterministic data access adapters, not domain decision makers.
- Services own policy and orchestration; repositories own storage operations.
- “Safe by default” at data boundaries reduces accidental regressions in upper layers.
- Designing signatures with optional `userId` now avoids future multi-user refactors.

### What Would Break If We Changed X (key dependencies / constraints)
- If default read filters stop applying `deletedAt: null`, deleted notes may leak into `/notes` and `/review`.
- If `DATABASE_URL` validation is removed from `prisma.config.ts`, startup/migration failures become later and harder to diagnose.
- If Prisma access spreads outside repositories, layering guarantees and testability degrade.
- If repository signatures drop `userId?: string`, adding auth/multi-user later will require broad API rewrites.

### What To Improve Next Iteration (small actionable items)
- Add `noteRepository` unit/integration tests for soft-delete defaults and `userId` scoping.
- Add npm script for smoke test execution (e.g., `smoke:note-repo`).
- Implement `tagRepository` and `reviewRepository` concrete methods (currently skeletons).
- Start service layer (`noteService`, `reviewService`) and keep all non-trivial rules there.

## Phase 2 Implementation

## 2026-02-28

### Technical Summary (what changed, which files)
- Added `lib/services/noteService.ts` as a service-layer boundary over note repository operations.
- Implemented `lib/services/reviewService.ts` with business rules for daily stable batch generation and mark-reviewed behavior.
- Implemented `lib/repositories/reviewRepo.ts` persistence methods used by review service.
- Added service smoke scripts and npm commands:
  - `scripts/smoke-note-service.ts`
  - `scripts/smoke-review-service.ts`
  - `package.json` scripts: `smoke:note-service`, `smoke:review-service` (and fixed JSON validity).

### Architectural Rationale
- Kept domain logic in services (`reviewService`) and DB calls in repositories (`noteRepository`, `reviewRepo`) per layered rules.
- Preserved repository responsibility as persistence-only; services orchestrate repository calls.
- Added smoke scripts at service layer to verify Phase 2 invariants with minimal tooling.

### List of files changed
- `package.json`
- `lib/repositories/reviewRepo.ts`
- `lib/services/noteService.ts`
- `lib/services/reviewService.ts`
- `scripts/smoke-note-service.ts`
- `scripts/smoke-review-service.ts`

### Invariants involved
- Soft-deleted notes are excluded from review batch selection and persisted batch item reads.
- Same-day review batch remains stable (existing batch reused, no reshuffle).
- Marking a note reviewed does not regenerate/reshuffle today’s batch.
- No Prisma access in services; Prisma remains inside repositories.
- `ReviewEvent` keeps both `reviewedAt` (event timestamp) and `reviewBatchDate` (daily grouping key).

### What I Should Understand Conceptually
- Services define behavior; repositories define storage operations.
- Stable daily batch is achieved by persisting selected note IDs once per day and reusing them.
- “Prefer not reviewed in last 3 days” is a selection policy at batch creation time only.

### What Would Break If We Changed X
- If service layer starts calling Prisma directly, separation and testability degrade.
- If batch persistence is removed, review results reshuffle on refresh and violate product behavior.
- If deleted-note filtering is removed in review persistence reads, deleted data can leak into review mode.

### What To Improve Next Iteration
- Add tests for user-scoped review batch behavior (`userId` provided vs omitted).
- Add tag/review repository completeness and a cohesive `noteService` orchestration with tags.
- Add API/server-actions layer that calls services only (no direct repo from routes/components).
