# Forms, header actions and notification testing — 2026-11-08

This change is limited to form containment, mobile header alignment, notification diagnostics and deadline-control clarity. It makes no deck/image schema change and does not reset saved data or alter task ordering, scheduling, quotas, history or card animations.

## Form and header diagnosis

The mobile + button inherited a 10 px top margin on Habits/Progress while the More button had no margin. Header actions also participated in the wrapping heading/subtitle flex layout. The mobile header now reserves a separate 96 px action slot, uses the same 44×44 px buttons and 8 px gap, and anchors both to the same top/right position independently of text wrapping. All three tabs share the same 20 px safe-area-aware right inset.

The previous modal fitter always followed visualViewport.offsetLeft and resized to visualViewport.width. During pinch zoom, that moved and shrank the dialog along with the zoomed viewport instead of magnifying its existing layout. Fitting now distinguishes keyboard shrink from zoom and does not chase horizontal viewport pan. Screenshot inspection also exposed the hidden photo file input: a broad `.modal input { display:block }` rule overrode the HTML hidden attribute, exposing a redundant native chooser and its intrinsic filename sizing. A targeted hidden-file rule removes that unintended control from layout. The fixed background has an explicit width, nested dialogs share the existing scroll lock, and form labels/photo controls shrink and wrap within their containers. The deadline row uses minmax(0,1fr) for the input and a bounded clear control; WebKit's internal time-value/edit minimum sizes are constrained too. No additional horizontal clipping is used to conceal form content. Vertical scrolling, Safari's 16 px input floor, browser zoom and the photo editor's own two-finger crop gesture remain available.

Chromium did not reproduce the reported Safari overflow before the change. Its post-change checks cover 320/375/390/430 px, long drafts, keyboard-sized height, photo controls, opening the browser time picker, horizontal wheel attempts, repeated create/edit/cancel and pinch zoom. Real iPhone keyboard/time-picker interaction still requires device confirmation; viewport emulation is not a physical keyboard test.

## Why reminders were not arriving

The web app intentionally stored a reminder preference without scheduling anything: it has no push subscription, VAPID configuration, push-event receiver, subscription registry or durable server scheduler. A service worker's offline cache and an open-page timer cannot deliver reliable closed-app reminders. The native iOS source already scheduled OS local notifications, but had no independent system-test control and has not been built/run against an Apple SDK here.

Help & settings now has Notifications, Permission status, Enable notifications and Send test notification. Merely launching the app, opening Help or editing a task never requests permission. Denial and scheduling failures leave task saving usable. The test is separate from a real deadline reminder.

### Desktop browser system test

1. Open Daily Deck over HTTPS (localhost is allowed for development) in a browser supporting service-worker notifications. Finish any offered app update/reload so the current worker is active.
2. Open More actions → Help & settings → Notifications (desktop also has About your local deck in its navigation).
3. Read the purpose copy, then explicitly tap **Enable notifications**. Allow the browser's system permission request. If blocked, re-enable this site's notification permission in browser settings and return to the app. OS notification settings and Focus must also allow banners.
4. Tap **Send test notification**. The active service worker calls the real `showNotification` API. Expect “Daily Deck — test notification” in the system's Notification Center. The app reports handoff only after the API resolves; a permission/worker/API failure is reported without claiming success. Clicking the notification focuses Daily Deck.
5. This desktop test sends immediately. To inspect it after backgrounding, switch to another app and inspect Notification Center for the already-created entry. It does **not** test deferred or closed-app scheduling. No web deadline reminder is queued, even when this test works.

Automated Chromium verification uses the real notification API and confirms the entry with `ServiceWorkerRegistration.getNotifications`; it does not verify a visible desktop OS banner. A separate mocked-denial case checks that permission is requested once, only after the explicit button tap.

### iPhone web/PWA

1. On iOS 16.4 or later, open the HTTPS site in Safari, choose Share → Add to Home Screen and launch its icon as a web app. Merely viewing the site in a Safari tab is not the Home Screen Web Push flow.
2. Open More actions → Help & settings → Notifications. The app explicitly reports the **missing push backend**. Enable/test are unavailable on iPhone until that dependency is implemented; it does not pretend to send a notification or request unusable permission.
3. To make this work later, configure VAPID secrets in the deployment environment, implement explicit `pushManager.subscribe` opt-in and subscription registration, add a service-worker `push` event handler that displays real notifications, and provide an authenticated durable backend queue/test dispatch endpoint. Deadline cancellation, pending-state updates, expiration/retry handling and privacy/retention choices are necessary because a closed browser's local deck cannot be inspected by a server. See [the deadline/reminder setup](deadlines-reminders.md).
4. After that infrastructure exists, test a server test push with the PWA foregrounded, then backgrounded/phone locked, and separately test the real deadline below. Those deliveries are currently blocked by missing infrastructure, not by a hidden app permission prompt. Installing the PWA does not make it a native WidgetKit widget.

No backend, credentials, paid services or web notification timers were introduced.

### Native iPhone system test

1. Build/sign/run the existing Xcode project on a real iPhone using the README App Group setup. Native and web decks remain separate.
2. Open Today → **Widget help** (info icon) → **Notifications**. Read the explanation, tap **Enable notifications**, then **Continue**, and allow the iOS prompt. Permission status refreshes on return from Settings. If denied, use iPhone Settings → Notifications → Daily Deck; task saving remains usable.
3. Tap **Send test notification** and leave the app foregrounded for eight seconds. A `UNTimeIntervalNotificationTrigger` owned by iOS should display a banner/sound through the foreground delegate. This is a system notification, not an app toast.
4. Tap it again, then immediately background Daily Deck or lock the phone. Wait eight seconds and inspect Notification Center. This request is OS-scheduled and does not depend on an open app timer. Repeat with permission denied and Focus enabled to distinguish permission/OS suppression from scheduling.
5. Repeated tests replace the one stable system-test request; they do not change deadline records or their notification identifiers.

### Actual deadline reminder (separate verification)

Use normal device time and a future date/time; avoid changing the clock to fake delivery. If 13:30 has already passed, run the 14:00 case another day; for a quicker independent check choose a deadline at least 35 minutes ahead. Before **13:30 local**, save a pending task with **Complete by 14:00** and **Remind me 30 minutes before** enabled. On native iOS, confirm the card says **Reminder scheduled for 13:30**, not merely “deadline saved.” Close/background the app and verify one notification at 13:30: `30 minutes left to complete: [task title]`.

Repeat on separate test occurrences: Later must retain the same 13:30 request; Done, Skip, deletion and saving No deadline before 13:30 must cancel it; changing to 15:00 must replace it with 14:30. Relaunch/foreground repeatedly and verify no duplicates. A 14:00 deadline created at 13:45 must say no advance reminder remains and must not send “30 minutes left.” Test selected weekdays and local midnight; past/terminal snapshots remain unchanged. The planner and cancellation policy are automated-test verified, but real iOS notification-center acceptance/cancellation/delivery and widget actions remain device checks.

The native queue remains bounded to 60 upcoming requests across 30 days. Reopen to extend it. Timezone/clock changes while active/foreground reconcile; queued instants while closed keep the last planned timezone until the app runs again. Focus, notification summary and other iOS policy can delay or suppress banners.

## Deadline control and overdue state

There is one app-level **No deadline** clear action next to the native time input. It clears both time and reminder preference; Save persists that change and the native scheduler cancels the old request. Cancel preserves the original saved deadline. A separate readable selection line reflects the actual input state, so “No deadline selected” is never shown alongside a selected time. Empty controls disable the already-satisfied clear action.

There is no app-owned Reset in the deadline UI. If a Reset/Clear control appears inside the browser/OS time-picker popover, it belongs to that platform and cannot be removed by app CSS. The supported native picker is retained. The image editor's Reset still resets a photo crop and is deliberately unchanged.

Overdue still compares the occurrence's saved civil date and local time with the device clock, respecting the existing DST gap/fold policy; it does not use today's date for carried one-time tasks and never completes/fails a pending task. No deadline removes overdue styling. Terminal/historical snapshots remain immutable.

[Mobile screenshots and limitations](evidence/four-fixes/README.md).
