# Desktop Later and queue evidence

**Current refinement:** [three-and-a-half-card viewport and slower return recordings](later-refinement/README.md). The files below retain the previous five-and-a-half-card implementation as historical evidence; that viewport requirement has been replaced.

Captured from the actual production browser build at 1440×1000 using an isolated synthetic local deck: three starter habits and nine one-time tasks. No real user data, account or payment is involved.

- [Desktop queue](desktop-queue.png): five complete 60 px cards and half the sixth, 8 px gaps, 370 px internal viewport, heading/count outside it. All 12 items remain in the scrollable list.
- [Actual browser recording](later-desktop.webm): timestamped Chromium screencast frames, encoded locally as WebM. This is a recording of the interaction, not an animation mockup.
- [Before](later-00-before.png) → [Outward](later-01-outward.png) → [Behind the next real card](later-02-behind.png) → [Settling](later-03-settling.png) → [Finished](later-04-finished.png).
- [Frame measurements](later-frames.json): requestAnimationFrame samples of the original DOM element. It remains opaque and connected throughout both out and return phases. Disconnected entries occur **after** the return animation finishes and the outgoing item is no longer in the top-three visible stack; that is expected, not a premature unmount. The logical occurrence remains pending at the bottom of the complete sidebar list.

The original capture command `apps/web/tests/capture-sidebar-evidence.mjs` now forwards to the current refinement recorder; it does not overwrite these older files. It reports the observed phase set, live opacity and interval between starting return and completed unmount. Tests also independently check node identity, page/sidebar/scroll-container identity, no main-frame navigation, exact list dimensions, maintained scroll, repeated actions/Undo, slow/subthreshold/quick gestures and reduced motion.

These are desktop Chromium artifacts. Mobile screenshots show a Chromium iPhone-sized viewport, not a real iPhone/Safari pass.

[Mobile-sized Habits photo cover](mobile-habit-photo.png) and [desktop Habits photo cover](desktop-habit-photo.png) show the persisted replacement photo in the responsive 2:1 cover area, with readable text and weekday controls. Both use synthetic images selected in automated tests.
