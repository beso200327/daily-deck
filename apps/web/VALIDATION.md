# Web validation — November 5, 2026

## Passed in this environment

- `npm test`: **22 model tests passed** (Vitest).
- `npm run build`: TypeScript checking and Vite production build passed. Static output in `dist`; approximately 264 KB total, with the main JS approximately 72 KB gzipped.
- `npm run test:e2e`: **17 browser tests passed; 1 intentionally skipped**. The skipped case is the desktop copy of the real-touch test; that same test passed in the mobile project.
- Real Chromium against the built production app, with desktop 1440×1000 and iPhone-sized touch emulation. Additional overflow checks passed at 320, 768, and 1024 CSS pixels on Today, Habits, and Progress.
- Browser checks exercised pointer swipes, actual CDP touch events, Done/Later/Skip/undo, keyboard Enter, modal focus and Escape, task CRUD, reordering, habit schedule editing and deletion without history loss, completion timestamps, filters, summary period selection, reload persistence, and preservation of malformed local data.
- Browser clock simulated local midnight in America/New_York: a new independent habit deck appeared and the prior day's postponed and missed outcomes stayed visible. Model tests additionally covered weekday scheduling, DST, backfill, one-time carryover, period summaries, undo expiry, persistence and storage failure behavior.
- Reduced-motion mode and layout screenshots were checked; Today at desktop and mobile, desktop Habits, and mobile Progress screenshots were visually inspected.
- SHA-256 comparison confirmed **all 23 pre-existing native source/project/test/helper files remained byte-for-byte unchanged**. The root README only gained a link to the web instructions.

An initial browser test run caught a dialog focus issue. It was fixed by focusing the first input after opening the native HTML dialog. The final complete run above passed.

## Deployment attempt

No existing `.vercel/project.json` or Vercel configuration was present before implementation. The new configuration lives only under `apps/web`.

`npx vercel whoami` (CLI 65.11.0) returned `Logged out`.

The authorized attempt `npx vercel deploy --temporary --yes --json` failed with exit code 1:

```text
Temporary deployments aren't available for this attempt. Log in to continue.
status: error
reason: login_required
userActionRequired: true
next command: vercel login
```

**No working deployment URL exists from this attempt. No live URL has been verified.** No unrelated Vercel project was linked or modified.

To unblock, run `npx vercel login` from `apps/web` in the deployment environment and approve the official Vercel browser sign-in. Credentials must not be posted in chat. Then deploy this directory to a new project and verify its actual HTTPS URL. README has the complete commands.

## Remaining limits

- Chromium touch emulation is not a real iPhone or Safari check. Actual Mac Safari and iPhone Safari remain unverified until the hosted URL is available.
- Browser-local data does not sync between browsers, devices, deployment origins, or the native iPhone app. Clearing site storage removes it. No offline app-shell cache is implemented.
- The existing native widget stays part of the SwiftUI app; the web app provides no interactive iOS widget.
- Existing native SDK build/signing limitations are unchanged. Native tests were preserved; they were not rerun as part of this independent web change.

## Manual GitHub deployment preparation

For the GitHub publication pass, `npm test` (22 passed), `npm run build`, and the full production-browser suite (17 passed, one intentional desktop-only touch skip) were run again successfully. The native Xcode project structural validator passed, and all 23 native source/project/test/helper files matched their pre-publication hashes. Source candidates were checked to exclude dependency directories, generated build output, environment files, and known credential patterns.

Manual Vercel import settings are now documented in README: branch `main`, root `apps/web`, Vite, install `npm ci`, build `npm run build`, output `dist`, Node 24.x, environment variables **none**. No Vercel deployment was attempted during this publication pass; the earlier authentication failure above is historical evidence only.
