# DYMO Direct Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print DYMO 30336 Code 128 radio labels directly to a LabelWriter 450 with `.label` fallback.

**Architecture:** Isolate DYMO framework detection/printer selection/printing in `src/dymo-print.js`. Reuse `buildDymo30336Label()` for identical label XML. `src/app.js` owns manager confirmations, token lifetime, progress, and fallback UI.

**Tech Stack:** Browser JavaScript, DYMO Label Framework v8 browser API, existing Supabase client, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-24-dymo-direct-print-design.md`

## Global Constraints
- Target DYMO Label Software v8, LabelWriter 450, DYMO 30336.
- Preserve Code 128 secure random credentials.
- Never claim success unless the DYMO print call completes without error.
- Keep `.label` download fallback.

---

### Task 1: DYMO direct-print adapter
**Files:** Create `src/dymo-print.js`; Test `tests/dymo-direct-print.test.js`.
- [ ] Write failing tests for framework availability, printer selection, and print call.
- [ ] Run tests and verify RED.
- [ ] Implement minimal adapter.
- [ ] Run tests and verify GREEN.

### Task 2: Manager direct-print UI
**Files:** Modify `index.html`, `src/app.js`; Test `tests/dymo-direct-print-ui.test.js`.
- [ ] Write failing UI tests for Print DYMO Label, fallback download, and 40-label progress.
- [ ] Run tests and verify RED.
- [ ] Wire single and bulk direct-print actions without re-rotating credentials on print failure.
- [ ] Run tests and verify GREEN.

### Task 3: Regression and deployment
**Files:** Modify `service-worker.js`.
- [ ] Bump app-shell cache.
- [ ] Run full test suite.
- [ ] Run JavaScript syntax checks.
- [ ] Build and integrity-test deployment ZIP.
