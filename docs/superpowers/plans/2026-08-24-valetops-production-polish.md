# Valet Ops HQ Production Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manager radio condition management, Help/Support and legal surfaces, resend-verification onboarding, and final Valet Ops HQ branding polish without changing the working authentication, employee approval, QR-return, or manager-role architecture.

**Architecture:** Extend the Supabase radio status model with LOST and DAMAGED plus condition notes, exposed only through a manager-only RPC. Keep Help/Support and legal content client-side, and use Supabase Auth's resend API for verification email resends. Existing RadioOps naming remains only as the internal radio fleet module.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript ES modules, Supabase Auth/PostgreSQL/RPC, Vercel, Node.js test runner.

**Spec:** Approved in-chat scope from 2026-08-24.

## Global Constraints
- Preserve WT-01 through WT-40 and all existing assignment/audit history.
- Employees may check out only AVAILABLE radios.
- Only active Managers may change radio condition states.
- LOST radios may retain an open assignment for accountability; DAMAGED/REPAIR require no open assignment.
- Public-facing brand is Valet Ops HQ; RadioOps remains the internal radio fleet module.
- Do not modify QR-return verification, manager promotion protection, employee removal, SMTP credentials, or domain configuration.

---

### Task 1: Radio condition model
- [ ] Add failing migration/API/view-model tests for LOST, DAMAGED, condition reason, manager RPC, and attention counts.
- [ ] Implement migration 007, API method, production-state mapping, labels, and manager condition controls.
- [ ] Run targeted tests.

### Task 2: Help, Support, Privacy and Terms
- [ ] Add failing structure tests for Help nav/view and footer links.
- [ ] Add role-aware Help content, Privacy/Terms modal, and manager production checklist.
- [ ] Run targeted tests.

### Task 3: Resend verification onboarding
- [ ] Add failing API/UI tests for Supabase signup verification resend.
- [ ] Add resend-verification API method and login control using the entered email address.
- [ ] Run targeted tests.

### Task 4: Branding and final verification
- [ ] Add branding regression test for public-facing Valet Ops HQ copy while preserving RadioOps module naming.
- [ ] Update README, service-worker cache version, and visible public copy.
- [ ] Run `npm test` and JavaScript syntax checks; package GitHub-ready ZIP and individual migration.
