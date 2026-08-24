# Walkie-Talkie Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive local-first web app for tracking 40 POC-1 Lite radios, QR/manual checkout and return, assignment history, dashboard counts, and two 20-slot charging dock views.

**Architecture:** Static single-page app using semantic HTML, modular CSS, and vanilla JavaScript. Domain/state logic is isolated from UI rendering and persisted to localStorage; QR scanning progressively enhances manual selection using BarcodeDetector.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-walkie-tracker-design.md`

## Global Constraints
- Radios WT-01 through WT-40.
- LocalStorage prototype; no backend account.
- Checkout requires employee name, employee ID, and department.
- Charging UI is informational; electrical specifications must be manufacturer-verified.
- Responsive desktop/tablet/phone layout.

---

### Task 1: State model
- [ ] Test 40-radio initialization.
- [ ] Implement radio/history state and persistence.
- [ ] Test and implement checkout, return, repair, dock state, and dashboard counts.

### Task 2: Application shell
- [ ] Create Dashboard, Check Out / Return, History, and Charging Dock views.
- [ ] Apply approved navy/white/status-card responsive design.
- [ ] Wire navigation and persisted state.

### Task 3: Dashboard
- [ ] Test and implement status counts.
- [ ] Implement searchable/filterable radio inventory and badges.

### Task 4: Checkout / Return
- [ ] Test WT-01..WT-40 QR parsing.
- [ ] Implement employee form, manual radio selection, BarcodeDetector enhancement, checkout and return confirmations/errors.

### Task 5: History
- [ ] Test newest-first history.
- [ ] Implement assignment history and filters.

### Task 6: Charging Dock
- [ ] Test slots 01–20 as Bank A and 21–40 as Bank B.
- [ ] Implement Empty/Charging/Full/Fault controls and persistence.

### Task 7: Verification
- [ ] Run all automated tests with zero failures.
- [ ] Verify desktop/mobile layout and persistence.
- [ ] Exercise checkout, blocked checkout, return, repair, history, and dock workflows.
- [ ] Write README and package deliverable.
