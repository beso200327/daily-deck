# Mobile Today screenshot evidence

Captured from the final production build with synthetic starter data, at scroll position zero. These are real Chromium page screenshots; no browser chrome was composited into them. Viewport tests measured document scroll height ≤ viewport height and no horizontal overflow, with Later/Done labels above navigation.

| Capture | What it verifies |
| --- | --- |
| [Small iPhone viewport](small-iphone-320x568.png) | 320×568; header, real stack, edit, labeled actions and navigation all fit. |
| [Browser-bars-sized viewport](browser-bars-viewport-390x664.png) | 390×664 content area approximating reduced height with browser controls visible; no actual Safari UI is shown. |
| [Large iPhone viewport](large-iphone-430x932.png) | 430×932; responsive card/image sizing without adding page content or scrolling. |
| [Standalone safe-area geometry](standalone-safe-area-geometry.png) | 390×844 with simulated 47 px top and 34 px bottom insets; not an installed PWA screenshot. |
| [Desktop sidebar](desktop-sidebar.png) | Real compact queue and desktop overview remain available; widget/install tools moved to Help. |

Source tests: `apps/web/tests/browser/mobile-today.spec.ts` and the desktop layout regression. Screenshots use iPhone-sized/touch emulation, not a real iPhone. Actual Safari expanded/collapsed browser controls, installed standalone PWA, Dynamic Type and VoiceOver remain manual checks. The headless profile rejected PWA installation; WebKit was unavailable. See [verification details](../../mobile-today.md).
