# RadioOps PWA and Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RadioOps installable as a mobile PWA and route Supabase email verification back to a branded RadioOps success/error screen instead of a Vercel 404.

**Architecture:** Preserve the existing static Vercel application and Supabase backend. Add a manifest, icons, a static-shell-only service worker, install UX in the current app, and a dedicated `/auth/callback` page that initializes the same Supabase runtime configuration and processes verification parameters without exposing tokens.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Web App Manifest, Service Worker API, Supabase JS, Vercel rewrites, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-radioops-pwa-email-verification-design.md`

## Global Constraints
- Keep checkout/return/approval/audit data online-first; do not cache authenticated API responses.
- Preserve Safari and Chrome camera QR return support.
- Preserve mobile account/sign-out controls.
- Email verification must not bypass manager approval.
- Never expose Supabase secret/service-role credentials or verification tokens in visible UI.
- Production callback URL is `https://radio-ops.vercel.app/auth/callback`.

---

### Task 1: PWA metadata and static shell
**Files:** Create `manifest.webmanifest`, `service-worker.js`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`; modify `index.html`; test `tests/pwa.test.js`.
**Interfaces:** Produces installable metadata and a service worker that caches only static shell assets.
- [ ] Write tests that require manifest fields, icon files, manifest/meta links, and a static-only cache allowlist.
- [ ] Run `npm test -- tests/pwa.test.js` and verify failure before implementation.
- [ ] Add manifest, icons, service worker, and index metadata.
- [ ] Run the targeted test until it passes.

### Task 2: Install UX and standalone/mobile behavior
**Files:** Modify `src/app.js`, `styles.css`, `index.html`; test `tests/pwa-install.test.js`.
**Interfaces:** Produces Android install affordance, iOS Add to Home Screen guidance, service-worker registration, online/offline status, and standalone-safe layout.
- [ ] Write tests for `beforeinstallprompt`, iOS guidance detection, service-worker registration, and offline notice hooks.
- [ ] Verify the tests fail.
- [ ] Implement install prompt/guidance and offline shell messaging without enabling offline mutations.
- [ ] Run the targeted tests until they pass.

### Task 3: Supabase verification callback
**Files:** Create `auth/callback.html`, `src/auth-callback.js`; modify `src/api.js`; test `tests/auth-callback.test.js`.
**Interfaces:** `signUpEmployee()` uses `emailRedirectTo`; callback exchanges/reads Supabase auth state and renders success/error without displaying tokens.
- [ ] Write tests for callback redirect target, success/error UI copy, and token redaction.
- [ ] Verify failure.
- [ ] Implement callback handling and branded result states.
- [ ] Run targeted tests until they pass.

### Task 4: Vercel routing and deployment docs
**Files:** Modify `vercel.json`, `README.md`; test `tests/vercel-auth-route.test.js`.
**Interfaces:** `/auth/callback` serves the callback page and `/runtime-config.js` continues to resolve to the runtime-config function.
- [ ] Write routing tests and verify failure.
- [ ] Add callback rewrite/clean URL handling and Supabase Site URL/Redirect URL instructions.
- [ ] Run targeted tests until they pass.

### Task 5: Regression verification and packaging
**Files:** Modify only defects found by verification; package `/mnt/data/radioops-pwa-email-verification-update.zip`.
- [ ] Run `npm test` and require zero failures.
- [ ] Run `node --check` on changed JavaScript files.
- [ ] Scan runtime source for service-role/secret key patterns.
- [ ] Verify callback, mobile sign-out, QR scanner, and PWA assets are present.
- [ ] Package the complete project.
