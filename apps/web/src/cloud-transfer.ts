import type { Deck } from './deck'
import type { StoredPhoto } from './photos'
export type Transfer = {
  owner: string
  id: string
  revision: number
  deck: Deck
  photos: StoredPhoto[]
  backup: Blob
  createdAt: string
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('daily-deck-cloud-transfers', 1)
    let failed = false
    r.onupgradeneeded = () => r.result.createObjectStore('imports')
    r.onsuccess = () => {
      if (failed) r.result.close()
      else resolve(r.result)
    }
    r.onerror = () => {
      failed = true
      reject(
        new Error(
          'A recoverable backup could not be stored. No import started.'
        )
      )
    }
    r.onblocked = () => {
      failed = true
      reject(
        new Error(
          'Close older tabs and retry creating the local import backup.'
        )
      )
    }
  })
}
/** Immutable per-request manifests prevent two tabs from replacing each other's
 * retry source. The owner key is only a latest-backup pointer; old rows still read. */
export async function transfer(owner: string, value?: Transfer, id?: string) {
  const db = await database()
  return new Promise<Transfer | undefined>((resolve, reject) => {
    const tx = db.transaction('imports', value ? 'readwrite' : 'readonly'),
      store = tx.objectStore('imports')
    let result: Transfer | undefined
    const validate = (v: any) => {
      if (v && v.owner !== owner) {
        tx.abort()
        return
      }
      result = v?.deck ? v : undefined
    }
    if (value) {
      const old = store.get(owner)
      old.onsuccess = () => {
        const previous = old.result
        if (previous?.deck) store.put(previous, owner + '/' + previous.id)
        store.put(value, owner + '/' + value.id)
        store.put({ owner, id: value.id }, owner)
        result = value
      }
    } else if (id) {
      const r = store.get(owner + '/' + id)
      r.onsuccess = () => {
        if (r.result) validate(r.result)
        else {
          const legacy = store.get(owner)
          legacy.onsuccess = () =>
            validate(legacy.result?.id === id ? legacy.result : undefined)
        }
      }
    } else {
      const r = store.get(owner)
      r.onsuccess = () => {
        if (r.result?.deck) validate(r.result)
        else if (r.result?.id) {
          if (r.result.owner !== owner) {
            tx.abort()
            return
          }
          const item = store.get(owner + '/' + r.result.id)
          item.onsuccess = () => validate(item.result)
        }
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve(result)
    }
    tx.onerror = tx.onabort = () => {
      db.close()
      reject(
        new Error(
          'Could not persist or read the account-bound import backup. Existing local data is unchanged.'
        )
      )
    }
  })
}
