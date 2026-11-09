# Cross-device edit feedback investigation

An open editor captures the account deck revision at the moment it opens. Background/foreground refreshes update the rendered deck but never replace the draft or its captured revision. Both the client preflight and the PostgreSQL transaction reject stale saves (`40001`). The rejection does not apply the draft. Reopening the current saved task is required to start a new edit from its latest revision; inspecting the saved version does not rebase the old draft.

## Reproduced feedback defect

The form previously displayed the general page error. `commit` set this error on rejection, but a queued foreground refresh or a cloud snapshot notification cleared it after a successful read. “Saving…” stopped and the form stayed open, with its draft intact but no error. An error rendered below a long form could also be outside the visible scroll area.

The deterministic test opens the same task in two isolated browser contexts. It holds the desktop's save request, queues a desktop focus refresh, lets the phone save first, then releases the desktop request. The real isolated PostgreSQL RPC returns `40001` to desktop and retains “phone edit”. The editor now keeps a separate save error through successful refreshes, announces it as an alert, focuses/reveals the feedback within the scrollable form, and retains its inputs and photo draft. Save/Cancel remain in the separate footer. It offers Copy draft text (with a selectable-text fallback) and Check latest saved version. The latter is read-only and leaves the rejected draft and base revision intact.

Sequential desktop-then-phone edits are valid when each form starts from the then-current saved revision. Each success closes its form and displays the saved card/confirmation. The final phone title alone is therefore not evidence of an overwrite defect.

A lost response is a third possibility: the server may have saved while the client cannot confirm it. The form displays “Save not confirmed”, preserves its draft and durable pending request, and offers the existing pending-save retry. An idempotent receipt check can confirm the original save without submitting it again; the form then visibly says that the original save was confirmed and instructs the user to reopen before editing further.

## Limits of the historical diagnosis

There is no original Safari request/response trace or request receipt ID available for the reported session. We did not access that account or hosted database. Consequently, its exact ordering/outcome cannot be proven retrospectively. The reproduced conflict/cleared-error sequence matches the reported open-form symptom. An ordinary confirmed desktop success would close the editor; phone being the final value is also compatible with valid sequential saves. No silent overwrite is assumed or established.

## Regression checks

`npm run test:cloud` exercises real SQL transactions in a disposable local PostgreSQL database with synthetic Auth/Storage transport. New desktop and phone-sized cases cover server-side stale rejection after a held request, queued and subsequent background refreshes, retained title/notes, visible feedback at 320×400, read-only latest-version review, repeated stale rejection after review, draft copying, sequential successful edits, and lost-response confirmation/retry. Existing cloud cases cover client-side stale preflight after background refresh, history, photos, account separation, and idempotency.

`npm run test:e2e -- creation.spec.ts form-footer.spec.ts deletion.spec.ts photo-flow.spec.ts --workers=2` covers the affected local create/edit/error/photo flows and narrow keyboard-sized layouts. Native code, database migrations, and conflict/sync transaction semantics are unchanged. Real Safari, real phone keyboards, and this incident's hosted request history were not verified here.
