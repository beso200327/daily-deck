# Mobile fixes validation — November 5, 2026

## Verified implementation and privacy scope

The existing web photo flow was a system `<input type="file">`, invoked only by Choose/Replace. It receives selected file bytes/metadata, not photo-library enumeration or full-library permission. The website does not control iOS selected/full-library authorization and implements no imitation iOS permission dialog. Launch and form-open paths do not invoke a file picker. Previously selected images are read from the app's own local IndexedDB for display.

The exact UI copy is: “Only the photo you select is added. It stays on this device.” Source inspection found no upload/analytics/beacon/PhotoKit authorization code. A browser network test observed no POST/PUT or third-party HTTP request through selection, crop and save. The unchanged native app currently has no PhotosPicker/PhotoKit photo-access implementation or authorization requests; a future selected-photo feature should use PhotosPicker without unnecessary broad library authorization.

## Completed checks

- `npm test`: **38 model tests passed**, including four crop-geometry tests and the regression for rapid identical-timestamp actions selecting the correct undo token.
- `npm run build`: strict TypeScript and the Vite production build passed, generating the offline shell and install assets.
- `npm run test:e2e`: **67 passed, three intentional desktop-only touch skips (70 cases)** in the final complete run. Desktop and iPhone-sized touch projects ran against the production build. Earlier runs exposed nested-dialog assertion and temporary service-worker fixture races; assertions now wait for crop dismissal and the actual consented reload.
- Photo-save also passed five repeated desktop executions. The affected focus, photo-save and touch-toast cases passed three repeated executions per project (15 passed, three intentional desktop-only touch skips in that targeted repeated run).

## Browser behaviors exercised

- Explicit picker opening only from a user tap/click, picker cancellation preserving form contents, and local-only selected-photo processing.
- Dragging a crop, slider zoom, actual two-touch pinch without changing browser zoom, Reset, Cancel, Use photo, persisted crop display, and re-editing a saved image without opening the picker. Retained source bytes match across re-edits.
- Original EXIF orientation 6 decodes to the expected rotated dimensions. Rendered JPEG removes EXIF; original selected source remains local.
- IndexedDB version-one photo blob migration into the additive version-two database without changed photo IDs, legacy bytes, task IDs or history. Version two retains the `photos` store and adds immutable editing sources/crop metadata under `edits`.
- Form field bounds/scroll widths, 16 px text, locked background and reachable Save/Cancel at widths **320, 375, 390, 430 and 1024**, including 400 px high keyboard-sized viewports. Existing page layout tests also cover tablet/desktop. Focus returns to photo controls after crop editing instead of reopening the text keyboard. Narrow-view screenshots were inspected.
- Ordinary notifications expire after about 3 seconds; Undo notifications after about 6. Hover/focus pause the remainder, newer message timers replace older ones, manual close works, navigation clears obsolete notices, and touch-generated compatibility hover does not leave notifications stuck. Notification bounds avoid the primary task controls.
- Release cards remain opaque and connected during the approximately 320 ms exit. State is not changed before exit completion. Later preserves the same keyed DOM node through outward and bottom-return phases; transform completion events are observed for both phases. The next real card stays rendered. Slow/subthreshold drags, short quick flicks, buttons, repeated actions, correct undo, zero/one/two-card states, and reduced motion are covered.
- Existing recurrence, persistence, calendar/history, summaries, data migration, PWA offline reopening and consent-based update tests remain in the full suite.

## Unverified and limitations

- No real iPhone, Safari keyboard, or OS-installed standalone PWA window is available here. Chromium device emulation and visual-viewport resizing are not hardware verification.
- WebKit was not installed. An attempt to obtain the official Playwright Linux container failed during image retrieval with `download failed after attempts=6: Forbidden`. No WebKit or Safari pass is claimed.
- Actual iOS Photos permission/denial UI belongs to the browser/OS and cannot be manufactured or controlled by this website. Real phone photo-library/HEIC behavior remains a device check. Unsupported files and unavailable storage are exercised with clear non-destructive errors.
- The original high-resolution source cannot be recovered for photos saved before sources were retained; their existing rendered blob becomes the best available editing source. New originals may contain original metadata, stay local, and can consume more storage. Clearing/evicting browser storage removes local data; there is no cloud backup or synchronization.
- Existing native code and WidgetKit are unchanged. Native SDK compilation/signing, device/simulator execution and OS widgets still require Xcode and an iPhone or simulator.
- No manual Vercel deployment is performed. A push to `main` may trigger an existing automatic Vercel Git integration.
