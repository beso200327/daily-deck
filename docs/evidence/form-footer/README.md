# Task/habit form footer follow-up — 2026-11-08

The mobile deadline clear action now occupies its own row below the full-width time input, and appears only while a deadline is selected. Safari's time-control edit wrapper has explicit minimum-width constraints. Clearing sets both deadline and reminder preference to empty/false; saving persists that change. Cancel leaves saved values unchanged. No data schema, history, photo or scheduling changes were introduced.

The old sticky footer lived inside the same scrolling element as the fields and reminder messages. It now has a separate, non-scrolling modal layout area that reserves its own height. The body shrinks and scrolls above it, with 28 px of bottom space. Save remains associated with the form through its stable form ID, preserving Enter/submission validation and duplicate-save guards. Other dialog types retain their existing layout.

Production TypeScript/Vite build and **80 model/storage tests passed**. Browser suites passed **58 tests (6 intentional platform skips)** and **48 additional form/flow test executions**, including repeated form cases. A further **2 keyboard submission/empty-title validation cases passed**. Coverage includes 320/375/390 px, 844 px and 400 px heights, task/habit create/edit, every reminder message fully within the scroll body after scrolling, body/footer non-overlap, no horizontal overflow, long text, local persistence after clearing, cancellation, photos, quota boundaries, saving failures and deletion. The safe-area case simulates 47 px top/34 px bottom insets with keyboard resizing. Existing crop pinch and browser-zoom tests pass.

## Screenshots

These use Chromium with an iPhone touch/user-agent profile. The 400 px height **simulates keyboard-reduced space; there is no actual iOS keyboard in these images**. The body can scroll to different fields/messages while Save/Cancel stays in its own area.

| Width | Normal-height deadline section | Keyboard-sized deadline section | Keyboard-sized reminder help |
| --- | --- | --- | --- |
| 320 px | [View](deadline-320-closed.png) | [View](deadline-320-keyboard-sized.png) | [View](help-320-keyboard-sized.png) |
| 375 px | [View](deadline-375-closed.png) | [View](deadline-375-keyboard-sized.png) | [View](help-375-keyboard-sized.png) |
| 390 px | [View](deadline-390-closed.png) | [View](deadline-390-keyboard-sized.png) | [View](help-390-keyboard-sized.png) |

[390 px: full reminder status scrolled into view](status-390-keyboard-sized.png), using an elapsed advance-reminder example. Representative 320 px normal, 375 px keyboard-sized and 390 px help screenshots were opened and visually inspected.

Real iPhone Safari, Apple's native time-picker sizing/keyboard behavior and installed Home Screen mode could not be verified here. The Playwright WebKit executable is absent. Safe-area and viewport emulation do not establish real Safari or standalone-PWA verification. No native iOS code changed; browser background reminders remain unavailable without the previously documented Web Push/backend infrastructure.
