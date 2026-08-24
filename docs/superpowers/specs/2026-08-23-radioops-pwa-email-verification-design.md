# RadioOps PWA and Email Verification Redirect Design

## Goal
Upgrade RadioOps into an installable, app-friendly Progressive Web App (PWA) and replace the current email-verification 404 flow with a branded RadioOps verification callback that returns users to the live site with clear success or error messaging.

## Scope
This upgrade covers two connected areas:

1. PWA/app experience for iPhone, iPad, and Android.
2. Supabase email-verification callback handling on Vercel.

Custom SMTP and branded email delivery are intentionally separate from this implementation. They can be added afterward to improve deliverability and reduce spam placement.

## PWA Experience
RadioOps will become installable from supported mobile browsers.

### Android / Chrome
- Provide a web app manifest.
- Provide installable app metadata and icons.
- Support standalone display mode.
- Show an install affordance when the browser exposes the install event.
- Preserve camera access for QR scanning while installed.

### iPhone / iPad / Safari
- Provide Apple web-app metadata.
- Support Add to Home Screen guidance.
- Launch in an app-like standalone experience after installation.
- Preserve Safari camera access for QR scanning.
- Respect safe-area insets for notches and home indicators.

## PWA Files
Create or update:
- `manifest.webmanifest`
- app icons for common PWA sizes
- Apple touch icon
- `service-worker.js`
- `index.html` manifest/meta references
- `src/app.js` install-prompt behavior
- `styles.css` mobile install prompt and standalone-mode refinements

## Service Worker
The service worker will cache only the static application shell required for a fast launch:
- root page
- core CSS
- core JavaScript
- manifest
- app icons

Authentication, radio state, assignments, approvals, and audit data remain online-first and sourced from Supabase. The service worker must not cache authenticated API responses or sensitive user-specific data.

If the device is offline, RadioOps may load the shell and show a clear offline state, but checkout/return/approval operations remain disabled until connectivity returns.

## Email Verification Flow
New employee registration will continue using Supabase Auth email confirmation.

### Desired flow
1. Employee creates a RadioOps account.
2. Supabase sends a verification email.
3. Employee taps the verification link.
4. Supabase redirects to `https://radio-ops.vercel.app/auth/callback`.
5. RadioOps processes the returned authentication parameters/session.
6. RadioOps displays a branded verification result screen.
7. On success, the screen says the email is verified and offers a clear `Continue to Sign In` action.
8. After sign-in, the employee still follows the existing Pending -> Manager Approval flow.

## Verification Success Screen
The success state should show:
- RadioOps branding
- success icon/status
- `Email verified successfully`
- explanatory copy: `Your email is verified. You can now sign in to RadioOps. Your account may still require manager approval before fleet access is enabled.`
- `Continue to Sign In` button

## Verification Error Screen
If the callback is invalid, expired, incomplete, or Supabase rejects it, show a branded page instead of a raw 404.

The screen should show:
- `We couldn't verify this email link.`
- a concise explanation that the link may be expired or already used
- `Return to Sign In`
- where supported, a `Resend Verification Email` action

Do not expose raw access tokens, refresh tokens, authorization codes, or internal Supabase errors in the visible page.

## Vercel Routing
Vercel must serve the RadioOps application for `/auth/callback` so the route never becomes a platform-level 404.

The production configuration will include a rewrite/fallback for the callback path to the application entry point or a dedicated callback page, depending on the final implementation structure.

## Supabase URL Configuration
Production Supabase Auth configuration should use:

- Site URL: `https://radio-ops.vercel.app`
- Allowed redirect URL: `https://radio-ops.vercel.app/auth/callback`

The application signup call must explicitly use the callback URL as the email redirect target.

## Authentication State After Verification
Email verification does not bypass manager approval.

The profile lifecycle remains:
- `PENDING` after self-registration
- verified email + `PENDING` -> employee sees Awaiting Manager Approval
- `ACTIVE` after Manager approval -> employee gains fleet access
- `DISABLED` / `REJECTED` -> fleet access remains blocked

## Mobile Navigation
The existing mobile account/sign-out control remains visible in standalone PWA mode. The QR-return camera flow remains available from the installed app.

## Security
- Never persist Supabase secret/service-role credentials in browser code.
- Never cache authenticated API responses in the service worker.
- Never expose verification tokens in visible UI.
- Continue enforcing authorization and account status in Supabase RLS/RPCs rather than UI-only checks.
- Employee verification does not change role or account approval status.

## Email Deliverability Follow-Up
Inbox placement cannot be guaranteed. A later deployment phase can improve deliverability by configuring custom SMTP and a verified sending domain with SPF, DKIM, and DMARC. That is outside this PWA/callback implementation and does not block the app upgrade.

## Testing
Automated and manual verification will cover:
- manifest availability and required PWA fields
- service worker registration
- static shell caching only
- no authenticated API caching
- Android install-prompt code path
- iOS Add to Home Screen guidance path
- standalone-mode mobile layout
- callback success handling
- callback expired/invalid handling
- callback route does not return Vercel 404
- signup uses the production callback URL
- verified employee remains Pending until Manager approval
- camera QR return still works after PWA changes
- mobile Sign Out remains visible

## Deliverables
- Updated RadioOps source package
- PWA manifest and icons
- service worker
- email-verification callback route/UI
- Vercel route configuration update
- README deployment instructions
- Supabase URL Configuration checklist
- regression tests
