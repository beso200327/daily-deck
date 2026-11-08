import { useRef, useState, useSyncExternalStore } from 'react'
import { cloud } from './cloud-store'
export const useCloud = () =>
  useSyncExternalStore(cloud.subscribe, cloud.snapshot)
export function CloudControls() {
  const locked = useRef(false)
  const s = useCloud(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function run(work: () => Promise<unknown>) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cloud storage is unavailable.')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  const saving =
    busy || s.preparing || s.phase === 'saving' || s.phase === 'loading'
  return (
    <section
      className="data-controls cloud-controls"
      aria-label="Cloud storage"
    >
      <h3>Your deck storage</h3>
      <p>
        <strong>
          {s.scope === 'local'
            ? 'Using this browser’s local deck.'
            : 'Using this account’s cloud deck.'}
        </strong>{' '}
        {s.scope === 'local'
          ? 'It is not uploaded at sign-in.'
          : 'Task text, notes, photos and history are stored privately online for this account.'}
      </p>
      <p>
        Choose explicitly. Your original local deck stays separate and is never
        erased by import or sign-out. The native iPhone app and widget do not
        sync.
      </p>
      <div className="photo-actions">
        <button
          type="button"
          className="secondary"
          disabled={saving}
          onClick={() => cloud.local()}
        >
          Keep using local deck
        </button>
        <button
          type="button"
          className="secondary"
          disabled={saving || !!s.pending}
          onClick={() => void run(() => cloud.open())}
        >
          Open cloud deck without importing
        </button>
        <button
          type="button"
          className="secondary"
          disabled={saving || !!s.pending}
          onClick={() => void run(() => cloud.prepareImport())}
        >
          Review device import
        </button>
      </div>
      {s.existing && (
        <p>
          This account already contains cloud data. You can open it without
          importing, or stay local. Import does not merge or replace an existing
          cloud deck.
        </p>
      )}
      {s.summary && (
        <div className="backup-confirm">
          <p>
            <strong>Store this device’s deck online?</strong> This uploads{' '}
            {s.summary.tasks} tasks, {s.summary.habits} habits,{' '}
            {s.summary.occurrences} dated history records and {s.summary.photos}{' '}
            photos, including notes and retained originals/crops. A recoverable
            pre-import backup has been saved on this browser. Keep a downloaded
            copy too.
          </p>
          <div className="photo-actions">
            <button
              type="button"
              className="secondary"
              disabled={saving || !!s.pending}
              onClick={() => cloud.cancelImport()}
            >
              Cancel import
            </button>
            <button
              type="button"
              className="primary"
              disabled={saving || !!s.pending}
              onClick={() => void run(() => cloud.finishImport())}
            >
              Confirm upload and import
            </button>
          </div>
        </div>
      )}
      {s.scope !== 'local' && (
        <p>
          Cloud changes require a confirmed server save. Offline, the last
          confirmed copy may be read; new changes are not queued. Another
          browser’s conflicting edit is rejected so you can refresh and review
          it.
        </p>
      )}
      <div className="photo-actions">
        {s.scope !== 'local' && (
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={() => void run(() => cloud.refresh())}
          >
            Retry sync
          </button>
        )}
        {s.pending && (
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={() => void run(() => cloud.retry())}
          >
            Retry pending save
          </button>
        )}
        <button
          type="button"
          className="text-button"
          disabled={saving}
          onClick={() =>
            void run(async () => {
              const blob = await cloud.backup(),
                url = URL.createObjectURL(blob),
                a = document.createElement('a')
              a.href = url
              a.download = 'daily-deck-pre-import-backup.json'
              a.click()
              setTimeout(() => URL.revokeObjectURL(url), 60000)
            })
          }
        >
          Download pre-import backup
        </button>
        {s.scope !== 'local' && (
          <button
            type="button"
            className="text-button"
            disabled={saving}
            onClick={() => void run(() => cloud.cleanup())}
          >
            Clean up unused cloud photos
          </button>
        )}
      </div>
      {saving && (
        <p role="status">
          {s.preparing
            ? 'Preparing a local backup and import summary…'
            : s.phase === 'loading'
              ? 'Opening cloud deck…'
              : 'Waiting for cloud confirmation…'}
        </p>
      )}
      {s.pending && !saving && (
        <p role="status">
          A save is unresolved. Retry uses the same transaction ID, so a lost
          response cannot duplicate it. The original request is bound to local
          date {String(s.pending.args.localDay)} and timezone{' '}
          {s.pending.timezone}.
        </p>
      )}
      {(error || s.error) && (
        <p role="alert" className="field-error">
          {error || s.error}
        </p>
      )}
      {s.notice && <p role="status">{s.notice}</p>}
    </section>
  )
}
