# Working Mode

When starting a new phase:

1. Read docs/architecture.md  
2. Read docs/roadmap.md  
3. Identify current phase  
4. Read docs/build-log.md to understand what previous phase achieved and risks carried forward  

5. Propose for current phase:
   - Files to create/modify
   - Invariants to protect
   - Minimal scope for this iteration
   - Required smoke test

6. Wait for human approval only if the proposal introduces architectural changes, new patterns, or domain logic decisions. Otherwise proceed with implementation.

7. Implement.

8. After implementing changes in repositories, services, or APIs:
   - Ensure a corresponding scripts/smoke-*.ts file exists or is updated.
   - Smoke tests must follow the layer expectations below.

9. Run quality gates:

   Step 1 — Compile gate  
   - Run: `npx tsc --noEmit`  
   - Report pass/fail  

   Step 2 — Lint gate: npm run lint

   Step 3 — Runtime gate if any of these changed: anything in app/ (UI), any app/api/* route handlers (API), anything that could affect runtime config (next.config.*, middleware.*, env usage, auth, routing), shared code used at runtime (lib/services/*, lib/repositories/*, components, hooks)
   - For UI/API changes: run `npm run dev` and confirm no runtime errors  
   - For build/deploy changes: run `npm run build`  

   Step 4 — Smoke test  
   - If repositories/services/APIs changed:  
     Run relevant `npm run smoke:*` script and summarize output  
   - If UI changed:  
     Output a step-by-step manual checklist and wait for human confirmation  

   Step 5 — Self-review gate  
   - Review changed files vs docs/architecture.md and docs/roadmap.md  
   - Report violations  
   - Propose minimal fixes only  
   - Wait for human confirmation before applying fixes  
   - Re-run quality gates if fixes are applied  

10. Smoke Test Expectations By Layer

- Repository smoke tests must verify:
  - create/read/list
  - soft-delete excluded by default
  - restore (if implemented)
  - optional userId scoping (if supported)

- Service smoke tests must verify:
  - business rules / algorithms
  - correct orchestration of repositories
  - invariants preserved (e.g., review batch stability)
  - deleted items excluded

- API smoke tests must verify:
  - correct JSON responses
  - invalid inputs rejected
  - no 500 errors
  - routes call services (no Prisma in routes)

- UI smoke tests (manual) must verify:
  - core user flows end-to-end
  - no console errors
  - no deleted data leakage

Smoke tests should:
- Be minimal
- Throw on failure
- Exit 0 on success
- Avoid heavy frameworks

11. Phase summary

Open docs/build-log.md (create if missing)  
Append a new dated entry with header:

## Phase X Implementation

Include:
- Technical Summary (what changed, which files)
- Architectural Rationale
- List of files changed
- Invariants involved
- What I Should Understand Conceptually
- What Would Break If We Changed X
- What To Improve Next Iteration

Keep concise but specific.

12. Ask:
“Ready to move to next phase?”