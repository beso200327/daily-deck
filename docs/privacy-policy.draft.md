# Privacy notice — DEVELOPMENT DRAFT, NOT FOR PUBLICATION

Prepared 2026-11-05 from source and bounded runtime inspection. This is not legally approved. It is outside the Vercel web root. Do not publish until the owner completes identity, contact, markets, child-access, hosting and legal-basis review in `launch-readiness.md`. Owner location: Georgia. Intended markets: Georgia, Europe (exact countries pending), UK, USA.

## Identity and contact — unresolved

Legal operator/controller name, address where required, support/privacy email, possible representatives and rights-request channel: **not supplied; owner deferred**. Do not invent them. Effective date is not set; this is a drafting date only.

## Verified product facts to incorporate

The current app is a local task/habit manager with no account, advertising, analytics integration, payment processor or backend. Web/PWA task titles, notes, duration, recurrence, random local record IDs, occurrence history and timestamps are stored in origin-scoped localStorage. Optional selected photos and crop data are stored in IndexedDB. No broad photo-library enumeration is performed. Only explicit Choose/Replace opens the system picker. New selected-photo sources are normalized to remove embedded metadata; rendered crops also strip it. Existing retained originals/history are not rewritten and may still contain location/EXIF metadata.

Native iOS uses an App Group JSON store shared with WidgetKit. It has no photo picker, broad library/camera access, notifications, location, contacts, microphone or HealthKit feature. Native files may be included in OS-managed backups; actual device/iCloud settings remain unverified. The native app and web app do not synchronize.

Browser content is not sent by the application's code to analytics, error-reporting or an upload service in inspected paths. However, loading the website sends normal page/asset requests to hosting infrastructure. IP addresses, request timing/path/user agent and security logs may be processed there. Exact Vercel features/regions/log fields/retention, DPA, subprocessors and transfers **must be confirmed in the owner account**. Do not state that all information always stays on the device.

## Purpose, legal basis and retention — legal review required

Tasks/notes/photos/history support the features requested by the user; local caching supports offline app operation. Hosting requests support delivery/security. These purposes do not, by themselves, establish any particular statutory lawful basis, controller role or storage-consent exemption. Determine them per purpose and market, including minors. Optional image selection is a feature choice, not blanket legal consent or marketing consent.

Historical occurrences and prior image versions remain when a habit is edited, archived, or deleted to preserve calendar records. Web full-data deletion separately clears this browser's deck and both photo stores after confirmation. Browser eviction/clearing and private mode can also remove information. Local deletion does not remove other browser/native data, exported files, OS/device backups, or provider logs. Native full-data controls are not implemented; OS/container/backup deletion semantics need verification.

Exported web backups contain private text, history, photos and possibly legacy photo metadata in an unencrypted JSON file. Daily Deck does not upload them, but a user-selected Downloads/cloud folder or OS backup provider may retain copies. Import validates a bounded schema and pixel data and merges missing records without silently overwriting conflicting edits. Web backups are not native sync or a native import format.

Hosting log retention, financial/receipt retention if paid plans are implemented, rights-request handling, retention exceptions and international-transfer safeguards remain unresolved. Do not invent durations or processor guarantees.

## Children, rights and future changes — unresolved

The owner describes mainly adults with possible ages 14–15+. Exact eligibility, likely child access, age assurance/parental consent necessity and market-specific thresholds need qualified review. App Store age ratings are distinct. No DOB form or age gate exists.

Publish accurate applicable rights, request channels, verification approach, response procedures and authority/contact information only after market/controller review. The local export/delete UI helps users manage copies; it is not proof that every statutory right or hosting deletion request has been satisfied.

A proposed USD 3.99/month unlimited plan is not implemented. Accounts, receipts, processor recipients, purchase restoration and possible cross-device identity would change this notice and require a new assessment. No marketing opt-in exists. Reassess before adding any such data flow.

## Publication gate

Resolve every pending field, verify current official sources, obtain appropriate legal review, set an effective date, publish a stable accessible URL, link it in web/native UI and App Store Connect, and verify the notice agrees with actual hosting/device/SDK traffic. Do not publish this draft as final.


## Prototype testing update (still not a published policy)

The web prototype now has local 10-active-task/5-active-habit capacity gates. Explicit local/isolated-preview builds can store a simulated plan and expiry timestamp and use separate sandbox deck/photo stores per test-window identifier. These are local testing records, not payment/customer information or trusted entitlements. Public production builds omit these tools. New photo selections use an app informational confirmation before the real system picker; this is not broad-library permission or legal/marketing consent. No live checkout or external billing transmission was introduced.
