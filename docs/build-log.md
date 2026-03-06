# Build Log — Naming Convention

- **Stage 0–5**: MVP build stages (foundation → data → services → API → UI → deploy)
- **Phase N**: Post-MVP product phases
- **Milestone N**: A shippable unit inside a Product Phase

Historical MVP entries below are labeled as **Stages**.
New work should be logged as: `Phase X — Milestone Y`.

# Stage 1 Implementation

## 2026-02-24

### Technical Summary (what changed, which files)
- Implemented Stage 1 note data access with typed CRUD, soft-delete defaults, optional restore/hard delete, and optional `userId` scoping in `lib/repositories/noteRepository.ts`.
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

## Stage 2 Implementation

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
- Added smoke scripts at service layer to verify Stage 2 invariants with minimal tooling.

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

## Stage 3 Implementation

## 2026-03-01

### Technical Summary (what changed, which files)
- Added thin API routes for notes and review using service calls only:
  - `app/api/notes/route.ts`
  - `app/api/notes/[id]/route.ts`
  - `app/api/review/today/route.ts`
  - `app/api/review/mark-reviewed/route.ts`
- Added API smoke script:
  - `scripts/smoke-api.ts`
- Added npm script:
  - `package.json` → `smoke:api`

### Architectural Rationale
- Kept API handlers as request/response + validation boundaries.
- Kept business logic in services; no Prisma calls in route handlers.
- Added explicit 4xx validation to reject bad payloads without 500s.

### List of files changed
- `app/api/notes/route.ts`
- `app/api/notes/[id]/route.ts`
- `app/api/review/today/route.ts`
- `app/api/review/mark-reviewed/route.ts`
- `scripts/smoke-api.ts`
- `package.json`
- `package-lock.json`

### Invariants involved
- API routes call services only (no direct DB access in routes).
- Default note reads continue to exclude soft-deleted records.
- Review batch remains stable for same day and does not reshuffle after mark-reviewed.
- Invalid client input returns 4xx, not 500.

### What I Should Understand Conceptually
- API layer should be thin: parse/validate input, call service, shape response.
- Services remain the domain boundary; repositories remain persistence-only.
- Reliable API behavior depends on explicit input contracts and deterministic error status codes.

### What Would Break If We Changed X
- If routes call Prisma directly, layering/testability and maintainability degrade.
- If 4xx validation is removed, invalid client requests can leak into 500 errors.
- If review API bypasses `reviewService`, stable batch invariants can break.

### What To Improve Next Iteration
- Add tag API routes once tag service/repository methods are implemented.
- Standardize API error schema across all routes (`code` + `message`).
- Add lightweight API contract tests for edge validation cases.

## Stage 3.1 Implementation

## 2026-03-01

### Technical Summary (what changed, which files)
- Implemented tag repository methods in `lib/repositories/tagsRepo.ts` (create/find/list/attach/detach + explicit hard-delete helper).
- Added `lib/services/tagService.ts` for tag name normalization and attach orchestration (create-or-get then attach).
- Added tag API routes:
  - `app/api/tags/route.ts` (GET, POST)
  - `app/api/notes/[id]/tags/route.ts` (POST attach existing or create-and-attach)
  - `app/api/notes/[id]/tags/[tagId]/route.ts` (DELETE detach)
- Extended `scripts/smoke-api.ts` to cover tag API validation and flows.

### Architectural Rationale
- API routes remain thin request/validation boundaries and call services only.
- Services hold orchestration and normalization logic.
- Repositories remain persistence-only and deterministic.

### List of files changed
- `lib/repositories/tagsRepo.ts`
- `lib/services/tagService.ts`
- `app/api/tags/route.ts`
- `app/api/notes/[id]/tags/route.ts`
- `app/api/notes/[id]/tags/[tagId]/route.ts`
- `scripts/smoke-api.ts`
- `package.json`
- `package-lock.json`

### Invariants involved
- No direct Prisma usage in routes/services outside repositories.
- Tag names are normalized before persistence (`trim + lowercase`).
- Optional `userId` filtering remains consistent for multi-user readiness.
- API validation rejects invalid payloads with 4xx.

### What I Should Understand Conceptually
- Tag operations are modeled as service orchestration over `Tag` + `NoteTag`.
- Attach route supports both existing-tag and create-on-the-fly user flows.
- Nested note-tag routes keep API semantics aligned with “tags of a note.”

### What Would Break If We Changed X
- If normalization is removed, duplicate semantic tags (`Work` vs `work`) can proliferate.
- If routes bypass services, logic duplication and inconsistency risks increase.
- If user scoping is dropped, future auth migration becomes harder.

### What To Improve Next Iteration
- Add optional `includeCounts` support for tag list response.
- Add note listing by `tagId` filter endpoint support.
- Consolidate API error payload to include stable error codes.

## Stage 3.2 Implementation

## 2026-03-02

### Technical Summary (what changed, which files)
- Extended `scripts/smoke-api.ts` with explicit invalid-input API checks:
  - invalid note id path
  - invalid attach-tag payload
  - invalid detach-tag path
  - invalid mark-reviewed payload
- Kept runtime endpoint behavior unchanged; this iteration focuses on API contract verification depth.

### Architectural Rationale
- Strengthened Stage 3 error-handling strategy using smoke-level contract checks instead of adding new runtime pathways.
- Preserved thin route boundaries and service/repository layering while improving confidence in 4xx behavior.

### List of files changed
- `scripts/smoke-api.ts`
- `docs/build-log.md`

### Invariants involved
- Invalid client inputs return 4xx (not 500).
- Routes remain service-driven; no direct Prisma usage in routes.
- Existing Notes/Tags/Review functional invariants remain intact.

### What I Should Understand Conceptually
- API quality is not only “happy path works”; it also requires predictable error semantics.
- Smoke tests can enforce behavior contracts without heavy test frameworks.

### What Would Break If We Changed X
- If validation regresses, invalid payloads may leak into 500s and hurt API reliability.
- If API smoke coverage shrinks, future regressions in input handling can slip through.

### What To Improve Next Iteration
- Add shared helper utilities for route validation/error mapping to reduce repeated code.
- Add API contract tests for not-found and conflict cases (beyond payload validation).

## Stage 4 Implementation

## 2026-03-02

### Technical Summary (what changed, which files)
- Replaced UI placeholders with functional pages:
  - `app/notes/page.tsx` (quick add, list, edit, soft-delete, tags attach/detach, search, sort)
  - `app/review/page.tsx` (daily batch focus mode, next/prev, mark reviewed, edit, soft-delete, progress)
- Added one API capability needed by notes UI:
  - `app/api/notes/[id]/tags/route.ts` now supports `GET` to list tags for a note.
- Extended tag data access support:
  - `lib/repositories/tagsRepo.ts` added `findTagsByNoteId`
  - `lib/services/tagService.ts` added `listTagsForNote`

### Architectural Rationale
- UI remains in `app/` and interacts via API endpoints.
- No business rules were moved into components; services/repositories remain the behavior/data boundaries.
- Kept changes minimal by adding only one missing read endpoint for note-tag chips.

### List of files changed
- `app/notes/page.tsx`
- `app/review/page.tsx`
- `app/api/notes/[id]/tags/route.ts`
- `lib/repositories/tagsRepo.ts`
- `lib/services/tagService.ts`

### Invariants involved
- Soft-delete behavior remains default for notes (deleted notes hidden from reads).
- Review batch stability remains service-driven (same day stable, mark-reviewed does not reshuffle).
- API routes continue to call services only (no direct Prisma in routes outside repository layer).

### What I Should Understand Conceptually
- UI is now a thin client of the API surface built in Stage 3.
- Note-tag rendering needs both note list and per-note tag association reads.
- Review UI state tracks client navigation/progress while server preserves batch invariants.

### What Would Break If We Changed X
- If note-tag GET support is removed, note cards cannot reliably render tag chips.
- If UI bypasses API and calls data layer directly, architecture boundaries and future auth migration become harder.
- If delete semantics change from soft-delete defaults, deleted notes may leak into `/notes` or `/review`.

### What To Improve Next Iteration
- Add a dedicated API shape for notes-with-tags to avoid N+1 fetches from the notes page.
- Add lightweight loading/error UI states per card action (edit/tag/delete) for finer feedback.
- Start Stage 4.2 enhancements: i18n extraction and tag count/filter support.

## Stage 4.2 Implementation

## 2026-03-02

### Technical Summary (what changed, which files)
- Added i18n message foundation file:
  - `lib/i18n/messages/en.ts`
- Updated UI pages to consume centralized messages:
  - `app/notes/page.tsx`
  - `app/review/page.tsx`
- Added tag count + click-to-filter support in notes UI:
  - `app/notes/page.tsx`
- Added backend support for notes-by-tag and tags-with-counts:
  - `lib/repositories/noteRepository.ts` (`tagId` filter support)
  - `app/api/notes/route.ts` (`tagId` query handling)
  - `lib/repositories/tagsRepo.ts` (`findManyTagsWithCounts`)
  - `lib/services/tagService.ts` (`listTagsWithCounts`)
  - `app/api/tags/route.ts` (`includeCounts=true`)
- Kept note-tag listing endpoint in place for UI tag chips:
  - `app/api/notes/[id]/tags/route.ts`
- Extended API smoke coverage for new behavior:
  - `scripts/smoke-api.ts` (tags with counts, notes filter by `tagId`)

### Architectural Rationale
- i18n extraction starts at UI layer only, keeping services/repositories language-agnostic.
- Tag counts/filter are delivered as additive API options (`includeCounts`, `tagId`) to avoid breaking existing clients.
- UI continues consuming API routes; no direct DB access from components.

### List of files changed
- `lib/i18n/messages/en.ts`
- `app/notes/page.tsx`
- `app/review/page.tsx`
- `lib/repositories/noteRepository.ts`
- `app/api/notes/route.ts`
- `lib/repositories/tagsRepo.ts`
- `lib/services/tagService.ts`
- `app/api/tags/route.ts`
- `app/api/notes/[id]/tags/route.ts`
- `scripts/smoke-api.ts`

### Invariants involved
- No business logic in UI components beyond state/interaction wiring.
- API routes remain thin and service-driven.
- Soft-delete/read invariants remain unchanged.
- Existing API response envelope remains `{ data } / { error }`.

### What I Should Understand Conceptually
- i18n foundation means centralizing strings first; language switching can be layered later.
- Tag counts and tag filtering are query-level concerns exposed via optional API parameters.
- UI feature growth is safest when backend support is additive and backward compatible.

### What Would Break If We Changed X
- If tag normalization/scoping is bypassed, counts/filtering can become inconsistent.
- If notes-by-tag filtering is removed, clickable tag filter UX breaks.
- If strings are re-hardcoded widely, i18n rollout cost increases.

### What To Improve Next Iteration
- Add actual language toggle + persistence to complete i18n UX.
- Replace per-note tag fetches with a notes-with-tags API shape to reduce network round trips.
- Add optional tag count display in more UI surfaces (e.g., review context, filters summary).

## Stage 4.3 Implementation

## 2026-03-02

### Technical Summary (what changed, which files)
- Added full EN/ZH message set:
  - `lib/i18n/messages/zh.ts`
- Added shared i18n runtime helpers:
  - `lib/i18n/index.ts` (`Locale` type, message lookup, locale persistence)
- Added reusable language toggle UI:
  - `components/LanguageToggle.tsx`
- Wired notes/review pages to locale-aware messages and persisted selection:
  - `app/notes/page.tsx`
  - `app/review/page.tsx`

### Architectural Rationale
- Kept i18n concerns centralized in `lib/i18n` rather than scattering locale logic in pages.
- Used localStorage persistence for Stage 1 simplicity and zero backend coupling.
- Implemented locale switch so it updates UI copy without forcing notes/review data reload semantics.

### Invariants involved
- Existing API contracts and response envelopes remain unchanged.
- Notes/review business logic remains in services/routes; UI only handles presentation/state.
- Review batch stability remains server-driven and unaffected by locale selection.

### What I Should Understand Conceptually
- i18n rollout is complete when both string catalogs and runtime locale selection are present.
- Locale persistence is a UX concern and should not alter data retrieval invariants.

### What To Improve Next Iteration
- Add optional server-side locale preference source when authentication exists.
- Add locale-aware date/time formatting for created/review timestamps.

## Stage 5 Implementation

## 2026-03-03

### Technical Summary (what changed, which files)
- Added and filled stability/deployment gate checklist:
  - `docs/quality-gates.md`
- Ran Stage 5 gates:
  - `npx tsc --noEmit` (pass)
  - `npm run lint` (pass)
  - `npm run dev` runtime check (pass)
  - `npm run smoke:api` (pass)
- Fixed a compile-time i18n typing issue discovered during gates:
  - `lib/i18n/index.ts` (widened message value typing while preserving key-shape safety)

### Architectural Rationale
- Kept Stage 5 focused on verification and release readiness, not feature growth.
- Captured gate outcomes and blockers explicitly so deployment decisions are evidence-based.

### List of files changed
- `docs/quality-gates.md`
- `docs/build-log.md`
- `lib/i18n/index.ts`

### Invariants involved
- Layer boundaries unchanged (UI/API/services/repositories separation).
- Review batch stability rules unchanged.
- Soft-delete exclusion invariants unchanged.
- i18n centralization unchanged; only type safety corrected.

### What I Should Understand Conceptually
- Stage 5 is primarily about confidence gates and operational readiness.
- Runtime/smoke failures can surface environment constraints distinct from code defects; re-running after network stabilization is part of release readiness.

### What Would Break If We Changed X
- If compile/lint gates are skipped, regressions (like over-literal i18n typing) can reach runtime.
- If runtime/smoke gate failures are ignored, deploy confidence drops and production risk rises.

### What To Improve Next Iteration
- Add a preflight connectivity check for `DATABASE_URL` target before running runtime/smoke gates.
- Add a lightweight fallback/local DB path for offline smoke verification.

### MVP Launch Note
- MVP is now live in production at `https://notes-nine-azure.vercel.app
- Stage 0 through Stage 5 exit criteria are satisfied for current single-user scope.

## Phase 1 — Milestone 1 Implementation

## 2026-03-05

### Technical Summary (what changed, which files)
- Updated `app/review/page.tsx` to remove explicit mark-reviewed action and record review events from navigation behavior.
- `Next` now attempts to persist a review event for the current note before moving forward.
- Added page-leave handling (`pagehide` + `sendBeacon`) to persist review on exit when eligible.
- Added minimum dwell-time guard (3 seconds) before a review event is recorded for a note.
- Added duplicate protections in UI and backend:
  - UI single-flight request guard for in-flight review write.
  - Service-level same-day dedupe for `noteId + userId + reviewBatchDate` (at most one review event per note per day).
- Added repository helpers for review-event dedupe/count:
  - `findLatestReviewEventForNoteOnDate`
  - `countReviewEventsForNoteOnDate`
- Extended `scripts/smoke-api.ts` to verify duplicate review-write requests dedupe to one stored event.
- Updated review i18n messages in:
  - `lib/i18n/messages/en.ts`
  - `lib/i18n/messages/zh.ts`

### Architectural Rationale
- Kept review interaction changes in UI while preserving existing API/service boundaries.
- Kept write correctness in service/repository layer (dedupe) instead of relying solely on client behavior.
- Maintained stable endpoint contracts and response envelope to keep rollout low risk.

### List of files changed
- `app/review/page.tsx`
- `lib/services/reviewService.ts`
- `lib/repositories/reviewRepo.ts`
- `scripts/smoke-api.ts`
- `lib/i18n/messages/en.ts`
- `lib/i18n/messages/zh.ts`
- `docs/build-log.md`

### Invariants involved
- Same-day review batch stability remains unchanged.
- Prev navigation does not create review events.
- Soft-deleted note protections remain unchanged.
- No Prisma access was introduced outside repositories.
- API response envelope remains `{ data }` / `{ error }`.

### What I Should Understand Conceptually
- Milestone 1 changes review semantics from explicit action to inferred action on navigation away from a note.
- Reliable behavior needs layered guards: UI pending-state prevention + backend dedupe.
- Dwell threshold reduces false positives for accidental, very brief visits.

### What Would Break If We Changed X
- Removing dedupe allows duplicate review events from rapid repeated submits/retries.
- Removing dwell threshold can over-count short accidental views as completed reviews.
- Removing leave-page handling can miss review writes when user exits review without clicking Next.

### What To Improve Next Iteration
- Add first-class idempotency keys for review-write requests.
- Add focused tests for dwell threshold edge boundaries and Prev no-write behavior.
- Consider making dwell threshold configurable after usage data is observed.

### Post-QA issue note (manual regression found and fixed)
- **Symptom:** after refreshing review batch or switching locale, some notes that were already reviewed appeared eligible to be recorded again in UI.
- **Root cause:** reviewed-state tracking was client-only (`reviewedNoteIdsRef`) and got reset during batch reload/re-render; UI state was not rehydrated from server truth.
- **Fix:** `/api/review/today` now returns `reviewedNoteIds` for that review day (scoped to notes in current batch), and `app/review/page.tsx` hydrates reviewed set from payload on load.
- **Prevention pattern:** for mutable workflow state (e.g., review completion), never rely on client-local memory alone across reload/language/navigation boundaries; always derive eligibility from server-returned authoritative state.

### Behavior clarifications (accepted for Milestone 1)
- Browser **Back** from `/review` is treated as **Exit Review** (page leave). If the current note is eligible, a review event is recorded via `sendBeacon`.
- Dwell timing starts when a note becomes the active review item in the UI (when the current review index/note changes).
- A review event means the user stayed on the current note for at least **3 seconds** and then left the note via **Next** or **Exit Review**.
- Dedup rule is currently **same-day**, not time-window based: for the same `noteId + userId + reviewBatchDate`, only one event is persisted for that day.
- Review eligibility state must be hydrated from server data (`reviewedNoteIds`) rather than relying only on client-local memory.

## Phase 1 — Milestone 2 Implementation

## 2026-03-06

### Technical Summary (what changed, which files)
- Implemented fast-tagging UI for note creation in `app/notes/page.tsx`:
  - create-time tag input
  - prefix suggestions from existing tags
  - selected-tag chips before submit
  - one-submit flow (create note + attach selected tags)
- Added suggestion-driven attach support to existing per-note tag input on `/notes`.
- Reused existing attach endpoint flow with a shared client helper in `app/notes/page.tsx` to keep behavior consistent.
- Added UI text keys for create-time tag picker in:
  - `lib/i18n/messages/en.ts`
  - `lib/i18n/messages/zh.ts`

### Architectural Rationale
- Kept Milestone 2 UI-first and additive, avoiding new API/repository patterns.
- Used existing tag APIs/services to preserve normalization and uniqueness guarantees already enforced in backend.
- Kept implementation minimal by doing client-side prefix filtering from already-loaded tag summary data.

### List of files changed
- `app/notes/page.tsx`
- `lib/i18n/messages/en.ts`
- `lib/i18n/messages/zh.ts`
- `docs/build-log.md`

### Invariants involved
- No direct Prisma usage in UI.
- Existing soft-delete/read behavior remains unchanged.
- Tag normalization and dedupe remain backend-enforced via existing service/repository logic.
- API contract shape (`{ data }` / `{ error }`) remains unchanged.

### What I Should Understand Conceptually
- Milestone 2 reduces capture friction by moving tag selection into the creation flow.
- Autocomplete can be implemented without extra backend load when current tag corpus is already available client-side.
- “One submit” for note + tags improves UX while preserving current layering.

### What Would Break If We Changed X
- If creation flow stops attaching selected tags post-create, users fall back to a higher-friction multi-step flow.
- If backend normalization is bypassed, duplicate semantic tags can reappear (`Work` vs `work`).
- If suggestion filtering ignores attached tags, UI can suggest and attempt redundant attachments more often.

### What To Improve Next Iteration
- Replace per-note tag fetch pattern with a notes-with-tags API shape to reduce round trips.
- Add keyboard navigation for suggestion list (arrow/enter) for faster accessibility.
- Add cap/virtualization strategy if tag corpus grows large.
