# Authentication layout evidence

These screenshots were captured by Playwright Chromium using iPhone-sized emulation at **375 × 400 CSS pixels** (3× device scale), simulating the reduced available height of a keyboard. They show the form body scrolled to its end and a separate reachable footer. They are **not real Safari, an OS keyboard, or a Home Screen installation**.

- [Preview onboarding](onboarding-keyboard-sized.png): server-gated declaration/acknowledgement, separate optional marketing and local-mode action.
- [Password reset](reset-keyboard-sized.png): body scroll reaches confirmation/help while Save remains visible.

Automated geometry checks also cover 320/375/390 widths at 844/400 heights for sign-in, sign-up, forgot password, onboarding and reset. SDK Auth/RPC traffic is intercepted by synthetic fixtures; no real users, emails or credentials are involved. Actual iPhone keyboard, password-manager/autofill, zoom, VoiceOver and Safari/PWA callback behavior remain owner device checks.
