/** Immutable compressed photos. Only IDs go in the deck JSON; historical photos stay available. */
const DB = 'daily-deck-images'
const STORE = 'photos'
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Photo storage is unavailable in this browser. You can still use an icon.')); return }
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE) }
    request.onerror = () => reject(new Error('Could not open photo storage. Check site storage permissions.'))
    request.onblocked = () => reject(new Error('Photo storage is blocked. Close other Daily Deck tabs and try again.'))
    request.onsuccess = () => resolve(request.result)
  })
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    try { tx = db.transaction(STORE, mode) } catch { db.close(); reject(new Error('Photo storage is unavailable. Please try again.')); return }
    const request = operation(tx.objectStore(STORE))
    tx.oncomplete = () => { db.close(); resolve(request.result) }
    tx.onerror = tx.onabort = () => { db.close(); reject(new Error('Could not save or read this photo. Browser storage may be full or disabled. Your previous photo is unchanged.')) }
  })
}
export const putPhoto = (id: string, blob: Blob) => transaction('readwrite', s => s.put(blob, id))
export const getPhoto = (id: string): Promise<Blob | undefined> => transaction('readonly', s => s.get(id))
export const deletePhoto = (id: string) => transaction('readwrite', s => s.delete(id))
export async function compressPhoto(file: File): Promise<Blob> {
  if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP, or AVIF image. Export HEIC photos as JPEG first.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.')
  if (!file.size) throw new Error('This image is empty. Choose another photo.')
  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    image.src = url
    try { await image.decode() } catch { throw new Error('This photo could not be opened. Try a JPEG or PNG image.') }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 48_000_000) throw new Error('Choose an image with fewer than 48 megapixels.')
    let scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight))
    for (let attempt = 0; attempt < 7; attempt++) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Your browser could not prepare this photo.')
      context.fillStyle = '#faf6ed'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', Math.max(.55, .84 - attempt * .05)))
      if (!blob) throw new Error('This image could not be compressed. Please try another.')
      if (blob.size <= 1024 * 1024) return blob
      scale *= .8
    }
    throw new Error('This photo is still too large after compression. Choose a smaller image.')
  } finally { URL.revokeObjectURL(url) }
}
