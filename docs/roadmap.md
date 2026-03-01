# Notes MVP — Roadmap

## Phase 0 — Foundation (Completed)

- Next.js (App Router, TS) bootstrapped
- Tailwind configured
- Supabase Postgres connected
- Prisma configured (v6)
- Schema finalized:
  - Note
  - Tag
  - NoteTag
  - ReviewEvent
  - ReviewBatch
  - ReviewBatchItem
- Prisma client working
- Git clean state


---

## Phase 1 — Data Layer

Goal: Clean repository layer with soft-delete safety and multi-user readiness.

Tasks:

- noteRepository
- tagRepository
- reviewRepository
- ReviewBatch repository (if separated)

Exit Criteria:

- All DB access goes through repositories
- Soft-delete filtering enforced everywhere
- Clean typing
- No business logic in repositories


---

## Phase 2 — Service Layer

Goal: Encapsulate domain rules.

Tasks:

- noteService (orchestrates note + tag logic)
- reviewService
  - Stable daily batch generation
  - 3-day review exclusion logic
  - Deterministic batch persistence

Exit Criteria:

- No business logic in API routes
- Review algorithm isolated and testable


---

## Phase 3 — API / Server Layer

Goal: Expose clean JSON endpoints.

Tasks:

- Notes CRUD API
- Tag CRUD API
- Review Today API
- Input validation
- Error handling strategy

Exit Criteria:

- API layer thin and predictable
- No DB access in routes


---

## Phase 4 — UI Layer

Goal: Functional and usable MVP.

Tasks:

- /notes page
  - Quick add
  - Edit
  - Soft delete
  - Tag display
- Search + filtering
- Sorting
- Mobile responsive
- /review focus mode
  - One note at a time
  - Next / Prev
  - Mark reviewed
- UI i18n (EN/ZH):
  - Extract UI strings into messages files
  - Add a simple language toggle
  - Persist preference (cookie/localStorage)
Exit Criteria:

- All CRUD flows working end-to-end
- Review batch stable across refresh


---

## Phase 5 — Stability & Deployment

Tasks:

- Basic regression checks
- Review batch stability test
- Ensure deleted notes never appear
- Deployment to Vercel
- Production checklist

Exit Criteria:

- Live production URL
- MVP usable on mobile
- No critical bugs


---

# MVP Lock Constraints

- Single user
- No authentication
- Plain text editor
- Simple substring search
- Stable daily review batch
- No feature creep beyond defined scope
