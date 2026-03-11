# Notes — Roadmap

Build Stages describe how the MVP was constructed.
Product Phases describe how the product evolves after MVP.

## Stage 0 — Foundation (Completed)

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

## Stage 1 — Data Layer

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

## Stage 2 — Service Layer

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

## Stage 3 — API / Server Layer

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

## Stage 4 — UI Layer

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

## Stage 5 — Stability & Deployment

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

# PART 2 — PRODUCT PHASES

After MVP launch, development proceeds through product phases.

Each phase focuses on improving user value.

---

# Phase 1 — Capture Friction Reduction

Goal:

Make it as easy as possible for users to **create notes quickly and frequently**, while ensuring the review flow remains simple and intuitive.

Primary success metric:

- Number of notes created per user
- Capture friction (steps required to create a note)

Secondary metrics:

- Tag usability
- Interaction clarity

---

## Milestone 1 — Interaction Feedback & Review Navigation

Goal:

Improve clarity of user actions and simplify the review flow by removing explicit "Mark Reviewed" actions.

Instead of requiring the user to mark notes as reviewed, the system will **infer review events from user navigation behavior**.

Features:

- Remove the **Mark Reviewed** button from review mode.
- When the user presses **Next**, record a review event for the current note.
- When the user **Go Back to Notes / Exit Review**, record a review event for the current note before exiting review mode.
- **Prev** navigation does not record a review event.
- Buttons show loading / disabled states while actions are executing.
- UI clearly communicates navigation between notes.
- Review events are recorded only if the user stays on a note for at least **3 seconds** (dwell guard).

Exit Criteria:

- Users do not need to explicitly mark notes as reviewed.
- Review events are automatically recorded when leaving a note via **Next** or **Exit Review**.
- No duplicate review events are generated from repeated clicks.
- Navigation between notes is clear and responsive.
- No console errors during review navigation.

---

## Milestone 2 — Fast Tagging

Goal:

Reduce friction when attaching tags to notes.

Features:

- Tag picker during note creation and editing.
- Tag autocomplete suggestions.
- Suggestions appear when existing tag **prefix matches typed text**.
- Selecting an existing tag does not require typing the full tag name.
- Tags can be attached during note creation.

Exit Criteria:

- Attaching existing tags requires minimal typing.
- Autocomplete suggestions appear consistently when typing.
- Users can attach tags without leaving the note creation flow.

---

## Milestone 3 — Tag Hygiene & Safe Deletion

Goal:

Prevent tag clutter and improve data safety when removing content.

Features:

- Ability to remove **unused tags**.
- Tag deletion implemented as **hard delete**.
- UI allows quick cleanup of unused tags.
- Tag length limit displayed before tag creation.
- **Delete note with Undo safety**
  - Deleting a note immediately hides it from the notes list.
  - An inline notification appears with **Undo** near the deleted note position.
  - Undo window: **8 seconds**.
  - If Undo is clicked, the note is restored. Please decide on whether the note's status resets or not, e.g. does it keep the marked reviewed status, and state your decision and rational explicitly in your proposal for human approval.
  - If the notification expires, the note remains deleted (soft delete persists).

Exit Criteria:

- Users can easily remove unused tags.
- Tag list remains manageable even when many tags exist.
- Deleted notes can be restored within the Undo window.
- Undo restoration returns the note to its previous state.

## Milestone 4 — Capture Composer Upgrade

Goal:

Improve the note creation and editing experience through better layout and interaction flow.

Features:

- Support attaching multiple tags at once via semicolon-separated input (e.g., `idea;product;urgent`).
- Allow attach/detach tags while editing from Review mode (`/review`).
- Improve layout of the note editor.
- Reduce number of steps needed to create a note.

Exit Criteria:

- Creating a note and attaching tags can happen in one continuous flow.
- Users can attach multiple tags in one action using semicolon-separated input.
- Tag editing is available in both Notes and Review edit flows.
- Note creation is faster and clearer than the MVP version.

## Milestone 4.1 — Note Card Interaction Consistency

Goal:

Make note-card interactions consistent between `/notes` and `/review` so users do not need to learn two different tag-removal behaviors.

Features:

- Use `Notes` as the default entry page by routing `/` directly to `/notes` (remove extra landing-page click).
- Align tag interaction model between Notes and Review cards.
- Use one consistent rule for where tag removal is allowed (direct card vs edit mode).
- Ensure labels/hints communicate the same editing affordances in both views.
- **Tag add/remove only on Save:** In edit mode, adding or removing tags is buffered locally; changes are applied only when the user clicks **Save**. Clicking **Cancel** discards tag changes (no attach/detach).

Exit Criteria:

- Opening app root lands users directly in `Notes` without an extra navigation step.
- Tag display and removal behavior are consistent across Notes and Review.
- In edit mode, tag add/remove is applied only on **Save**; **Cancel** discards tag changes (no attach/detach).
- Users can predict where and how to edit/remove tags without context switching confusion.
- No regression to review-event recording semantics during note/tag edits.

---

# Milestone 5 — Image Attachments

## Goal

Allow users to attach images to notes for visual capture while maintaining a clean architecture, consistent lifecycle behavior with notes, and future readiness for features such as a recycle bin.

---

# Features

## Image Upload

Users can attach images to notes.

Supported formats:

- JPEG
- PNG
- WebP

Limits:

- **Maximum 5 images per note**
- **Maximum 5 MB per image**

Images are stored in **Supabase Storage**.

---

## Upload During Note Creation

Images can be attached **before a note is saved**.

Behavior:

1. User selects images while creating a note.
2. Images are previewed locally in the browser.
3. Images are **not uploaded yet**.
4. When the user clicks **Save**, the system:
   - creates the note
   - uploads images
   - creates image metadata records.

This avoids temporary server storage and simplifies cleanup.

---

## Image Preview

Images appear:

- in the **note editor**
- in the **note card view**
- in **review mode**

Images are displayed using **signed URLs generated by the server**.

---

## Image Editing During Note Edit

When editing a note:

Users can:

- add new images
- remove newly added (unsaved) images
- mark existing images for deletion

Behavior:

Changes are **staged during edit mode**.

Nothing permanent happens until the user clicks **Save**.

On **Cancel**:

- newly added images are discarded
- deletion marks are cleared

---

## Image Delete Behavior

Image deletion is **final after Save**.

Process:

During editing:

- existing images can be marked **pending deletion**

On Save:

- image metadata rows are **soft deleted**
- storage objects are **hard deleted**

Image-level delete **is not recoverable**.

---

## Note Delete Behavior

Note deletion supports **immediate Undo**.

When a user deletes a note:

1. the note row is **soft deleted**
2. associated image metadata rows are **soft deleted**

Storage objects are **not immediately removed**.

A toast appears:

> "Note deleted — Undo"

If **Undo is clicked** within the UI window:

- the note row is restored
- image metadata rows are restored

If the **Undo window expires**:

- deletion becomes final
- storage objects for images are permanently deleted

This model supports the existing **toast-based Undo** without introducing a recycle bin.

---

# Storage Design

Images are stored in a **Supabase Storage private bucket**.

Objects are accessed using **signed URLs generated by the server**.

Storage path format:
notes/{noteId}/{uuid}-{originalFileName}

This prevents naming collisions and keeps images grouped by note.

---

# Database Model

Table: `NoteImage`

Fields:

- `id`
- `noteId`
- `storagePath`
- `fileName`
- `contentType`
- `sizeBytes`
- `createdAt`
- `deletedAt`
- `userId` (optional for future multi-user support)

Default queries exclude rows where `deletedAt` is not null.

---

# API Endpoints
POST /api/notes/[id]/images
GET /api/notes/[id]/images
DELETE /api/notes/[id]/images/[imageId]

Responsibilities:

### POST

- validate file type and size
- upload to storage
- create metadata row

### GET

- fetch images
- generate signed URLs

### DELETE

- soft delete metadata row
- delete storage object

---

# Edge Cases & Reliability Requirements

The system must handle the following safely.

## Partial Failure (DB vs Storage)

If storage delete fails but DB update succeeds:

- operation should log an error
- system state should still reflect image deletion.

If the storage object is already missing:

- treat deletion as successful.

---

## Duplicate Requests

Repeated delete operations must be **idempotent**.

---

## Concurrent Edits

Multiple edits from different tabs should fail gracefully without corrupting state.

---

## Broken Preview URLs

The client should refresh the image list after Save to avoid stale URLs.

---

# Exit Criteria

Users can:

- attach images during note creation
- preview images before saving
- attach images to existing notes
- delete images during edit
- see images during review
- delete notes and undo within the toast window

The system must:

- enforce image limits
- store images reliably
- generate signed URLs
- clean up storage objects after the Undo window expires

## Milestone 5.1 — Image Viewer Polish

Goal:
Make attached images actually usable inside notes and review.

Features:
- Click thumbnail to open enlarged image preview
- Modal/lightbox viewer
- Close via X / backdrop / Escape
- Reuse same behavior in Notes and Review

Exit Criteria:
- Users can view attached images at readable size
- Viewer works consistently in Notes and Review

## Milestone 6 — Performance Improvements

Goal:

Improve performance of the notes list.

Tasks:

- Remove N+1 tag query pattern.
- Return notes and tags in a single query.

Exit Criteria:

- Notes page loads without per-note tag queries.
- Performance improvement does not introduce regressions.

---

## Milestone 7 — Visual Design Refresh

Goal:

Improve visual clarity and learn AI-assisted UI design workflows.
Reduce UI inconsistency and duplication between Notes and Review.

Tasks:

- Improve typography.
- Improve spacing and layout hierarchy.
- Improve visual clarity of primary actions.
- Align note card display between Notes and Review
- Align edit form section ordering
- Standardize displayed metadata (e.g. created date)
- Extract shared note display/edit components where practical


Exit Criteria:

- UI appears more cohesive.
- Core functionality remains unchanged.
- Notes and Review present the same note model consistently
- UI differences are intentional, not accidental
- Shared components reduce duplication
---

# Phase 2 — Memory + Creativity Layer

Goal:

Transform the notes system from a simple capture tool into a **thinking and idea-generation system**.

This phase introduces lightweight knowledge-science features while preserving the simplicity of the core note workflow.

Potential Features:

- **Spaced repetition scheduling**
  - Add review scheduling fields to notes
  - Use a lightweight algorithm (SM-2-inspired or simpler heuristic)

- **Daily resurfacing mix**
  - Review queue composed of:
    - recently created notes
    - notes due for review
    - randomly resurfaced older notes

- **Note linking**
  - Ability to link notes together
  - Back-links (show which notes reference a note)
  - Suggestions for related notes

- **Creative prompts**
  - Generate prompts using existing notes
  - Example prompts:
    - “Combine these two ideas”
    - “What problems could these notes solve together?”
    - “What idea could emerge from these notes?”

Exit Criteria (Directional):

- Notes can surface automatically based on time or relationships
- The system supports idea exploration rather than just storage
- The core capture flow remains fast and simple

---

# Phase 3 — Multi-User + Authentication + Monetization

Goal:

Turn the application from a personal tool into a **hosted product that supports multiple users**.

Potential Features:

- **Authentication**
  - Google login
  - Apple login

- **Multi-tenant architecture**
  - `userId` enforced on all models
  - Queries scoped by user
  - Database isolation at the application layer
  - ReviewEvent dedupe must include user scope (userId).
  - API routes must derive `userId` from the authenticated session rather than trusting a client-provided userId.

- **Subscription system**
  - Stripe integration
  - Free tier vs paid tier
  - Feature gating where appropriate

Exit Criteria (Directional):

- Multiple users can use the system safely
- All data operations are user-scoped
- Subscription billing functions correctly

---

# Phase 4 — Capture Integrations

Goal:

Allow users to capture notes from external platforms without opening the app.

These integrations focus on **fast capture channels**.

Potential Integrations:

- **Telegram Bot**
  - Often the easiest messaging integration
  - Users can send messages to a bot to create notes

- **WhatsApp Integration**
  - Via WhatsApp Business API
  - Higher setup complexity but high usage potential

- **Messenger Integration**
  - Meta platform integration
  - More platform constraints

Exit Criteria (Directional):

- Users can capture notes from at least one external messaging platform
- Captured messages automatically become notes
- Core tagging / review workflows still function