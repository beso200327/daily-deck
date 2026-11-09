import {accountUnavailable} from './account-events'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as D from './deck'
import { supabaseConfiguration } from './supabase'
import { validateBackupDeck } from './backup'
import {
  getPhoto,
  getPhotoEdit,
  putEditedPhoto,
  photoDimensions,
  renderPhoto,
  type StoredPhoto
} from './photos'
export type CloudPhoto = {
  referenced?: boolean
  id: string
  owner_id: string
  source_path: string
  rendered_path: string
  source_extension: string
  source_width: number
  source_height: number
  source_bytes: number
  rendered_width: number
  rendered_bytes: number
  crop_x: number
  crop_y: number
  crop_zoom: number
}
export type CloudSnapshot = {
  import_id?: string | null
  imported?: boolean
  owner_id: string
  revision: number
  deck: D.Deck
  photos: CloudPhoto[]
}
export type CloudRequest = {
  owner: string
  id: string
  revision: number
  operation: string
  args: Record<string, unknown>
  timezone: string
}
export class CloudError extends Error {
  constructor(
    message: string,
    public code = '',
    public outcome: 'conflict'|'rejected'|'network'|'unknown'|'auth' = code==='40001'?'conflict':code==='42501'||code==='PGRST301'?'auth':code==='TIMEOUT'||code==='FETCH_ERROR'?'network':/^[0-9A-Z]{5}$/.test(code)?'rejected':'unknown'
  ) {
    super(message)
  }
}
export function cloudError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
  if (code === 'PGRST202')
    return new CloudError(
      'Cloud storage is not ready here. Keep using your local deck until setup is complete.',
      code,'rejected'
    )
  if (code === '40001')
    return new CloudError(
      'The cloud deck changed in another browser or a new local day began. Refresh, review the current card, and try again.',
      code
    )
  if (code === '42501' || code === 'PGRST301')
    return new CloudError(
      'Sign in to the same account and complete Preview setup, then retry. Your local deck is unchanged.',
      code
    )
  if (code === 'P0001')
    return new CloudError(
      'The selected free allowance is full. Existing records were preserved.',
      code
    )
  if (
    ['23514', '23503', '23505', '22023', '22P02', '23502', '54000'].includes(
      code
    )
  )
    return new CloudError(
      'The cloud rejected this change. Refresh and review the task or photo before trying again. No history was overwritten.',
      code
    )
  if (/^[0-9A-Z]{5}$/.test(code) || /^PGRST\d+$/.test(code))
    return new CloudError('The server rejected this request ('+code+'). Your draft was not applied. Review it and retry after resolving the error.',code,'rejected')
  return new CloudError(
    'Cloud save could not be confirmed. Check your connection and retry the pending save. Do not create another copy.',
    code
  )
}
// SDK-managed Auth calls have no per-call AbortSignal. Bound the verification
// wait; late responses cannot reach a different account's state.
async function verifyWithin<T>(work: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new CloudError(
                'Cloud verification timed out. Check your connection and retry.',
                'TIMEOUT'
              )
            ),
          20000
        )
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
function boundedFetch(check: () => void): typeof fetch {
  return async (input, init) => {
    check()
    const controller = new AbortController(),
      external =
        init?.signal ?? (input instanceof Request ? input.signal : undefined),
      abort = () => controller.abort()
    if (external?.aborted) controller.abort()
    else external?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, 60000)
    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
      external?.removeEventListener('abort', abort)
    }
  }
}
/** A data-only SDK client pins this operation to its verified initiating session.
 * Switching the global Auth client cannot send old photo bytes with another
 * account's credentials. Tokens stay in SDK/closure memory, never app caches. */
export async function bindAccountClient(
  base: SupabaseClient,
  owner: string,
  check: () => void
): Promise<SupabaseClient> {
  check()
  const session = await verifyWithin(base.auth.getSession())
  check()
  if(session.error && (!session.error.status||session.error.status>=500))throw new CloudError('Account verification could not connect. No change request was sent.','FETCH_ERROR','network')
  if (
    session.error ||
    !session.data.session ||
    session.data.session.user.id !== owner
  )
    throw new CloudError(
      'Sign in to the same account before retrying this cloud operation.',
      '42501'
    )
  const token = session.data.session.access_token,
    verified = await verifyWithin(base.auth.getUser(token))
  check()
  if (verified.error || verified.data.user?.id !== owner){
    const error=verified.error as {status?:number;code?:string}|null
    if(error&&(!error.status||error.status>=500))throw new CloudError('Account verification could not connect. No change request was sent.','FETCH_ERROR','network')
    if(error?.code==='user_not_found')accountUnavailable(owner,'deleted')
    else if(error?.status===401||['bad_jwt','session_not_found'].includes(error?.code??''))accountUnavailable(owner,'invalid')
    throw new CloudError(
      'Your cloud account could not be verified. Reconnect or sign in again.',
      '42501'
    )
  }
  if (supabaseConfiguration.status !== 'configured')
    throw new CloudError('Cloud storage is unavailable in this build.')
  const { createClient } = await import('@supabase/supabase-js')
  check()
  const client=createClient(supabaseConfiguration.url, supabaseConfiguration.key, {
    accessToken: async () => token,
    global: { fetch: boundedFetch(check) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
  const lifecycle=await client.rpc('daily_deck_lifecycle_status')
  check()
  if(!lifecycle.error&&lifecycle.data?.owner_id===owner&&['invalid','deleting','deleted'].includes(lifecycle.data.state)){
    accountUnavailable(owner,lifecycle.data.state)
    throw new CloudError('Account deletion is in progress or complete. Cloud data is no longer available.','PDA01')
  }
  if(lifecycle.error&&lifecycle.error.code!=='PGRST202')throw cloudError(lifecycle.error)
  return client
}
export async function syncRequest(
  client: SupabaseClient,
  request: CloudRequest
): Promise<CloudSnapshot> {
  const result = await client.rpc('daily_deck_sync', {
    p_expected_user: request.owner,
    p_request_id: request.id,
    p_revision: request.revision,
    p_operation: request.operation,
    p_args: request.args,
    p_timezone: request.timezone
  })
  if(result.error?.code==='PDA01')accountUnavailable(request.owner,'deleting')
  if (result.error) throw cloudError(result.error)
  return validateSnapshot(result.data,request.owner)
}
export function validateSnapshot(value:unknown,owner:string):CloudSnapshot{
  const s=value as CloudSnapshot
  if (
    s?.owner_id !== owner ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    !Array.isArray(s.photos) ||
    s.photos.some((p) => p.owner_id !== owner)
  )
    throw new CloudError(
      'The cloud response could not be verified. No device data was changed.'
    )
  try {
    s.deck = validateBackupDeck(s.deck)
  } catch {
    throw new CloudError(
      'The cloud response uses an unreadable data version. The save outcome is not confirmed. Keep the backup and retry after updating.',
      'RESPONSE'
    )
  }
  return s
}
const bucket = 'daily-deck-photos'
async function same(a: Blob, b: Blob) {
  if (a.size !== b.size) return false
  const digest = (v: Blob) =>
    v.arrayBuffer().then((b) => crypto.subtle.digest('SHA-256', b))
  const [x, y] = await Promise.all([digest(a), digest(b)])
  return new Uint8Array(x).every((n, i) => n === new Uint8Array(y)[i])
}
export async function uploadPhoto(
  client: SupabaseClient,
  owner: string,
  id: string,
  photo: StoredPhoto,
  check: () => void
) {
  check()
  const edit = photo.edit
  if (!edit)
    throw new CloudError(
      'This photo has no editing source. Open it in Edit and save an adjusted photo before importing.',
      'PHOTO'
    )
  const ext: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif'
  }
  if (
    !ext[edit.source.type] ||
    photo.rendered.type !== 'image/jpeg' ||
    edit.source.size > 20 * 1024 * 1024 ||
    photo.rendered.size > 1024 * 1024
  )
    throw new CloudError(
      'This original or crop exceeds the cloud photo limits (20 MB original, 1 MB JPEG crop). Choose a smaller photo. Your local original is unchanged.',
      'PHOTO'
    )
  const { width, height } = await photoDimensions(photo.rendered)
  if (width < 2 || width > 1200 || width % 2 || height !== width / 2)
    throw new CloudError(
      'The cloud crop must have the card’s 2:1 shape. Adjust this photo before importing.',
      'PHOTO'
    )
  const metadata = {
    source_extension: ext[edit.source.type],
    source_width: edit.width,
    source_height: edit.height,
    source_bytes: edit.source.size,
    rendered_width: width,
    rendered_bytes: photo.rendered.size,
    crop_x: edit.crop.x,
    crop_y: edit.crop.y,
    crop_zoom: edit.crop.zoom
  }
  check()
  const registered = await client.rpc('daily_deck_photo', {
    p_expected_user: owner,
    p_id: id,
    p_metadata: metadata
  })
  check()
  if (registered.error) throw cloudError(registered.error)
  for (const [path, blob] of [
    [`${owner}/${id}/original.${metadata.source_extension}`, edit.source],
    [`${owner}/${id}/card.jpg`, photo.rendered]
  ] as const) {
    check()
    const payload = await blob.arrayBuffer()
    check()
    const uploaded = await client.storage
      .from(bucket)
      .upload(path, payload, { upsert: false, contentType: blob.type })
    check()
    if (uploaded.error) {
      const existing = await client.storage.from(bucket).download(path)
      check()
      if (
        existing.error ||
        !existing.data ||
        !(await same(existing.data, blob))
      )
        throw new CloudError(
          'Photo upload was interrupted or has conflicting bytes. Retry without replacing the original.'
        )
    }
  }
}
export async function ensurePhotos(
  client: SupabaseClient,
  owner: string,
  photos: CloudPhoto[],
  refs: string[],
  check: () => void
) {
  for (const id of refs) {
    check()
    const cached = await getPhoto(id, `.account-${owner}`)
    check()
    if (cached) continue
    const p = photos.find((p) => p.id === id)
    if (
      !p ||
      p.owner_id !== owner ||
      p.source_path !== `${owner}/${id}/original.${p.source_extension}` ||
      p.rendered_path !== `${owner}/${id}/card.jpg`
    )
      throw new CloudError(
        'A cloud photo reference is unavailable. Retry sync.'
      )
    const source = await client.storage.from(bucket).download(p.source_path)
    check()
    if (source.error || !source.data)
      throw new CloudError(
        'Could not download a private photo original. Retry sync.'
      )
    const rendered = await client.storage.from(bucket).download(p.rendered_path)
    check()
    if (rendered.error || !rendered.data)
      throw new CloudError(
        'Could not download a private photo crop. Retry sync.'
      )
    if (
      source.data.size !== p.source_bytes ||
      rendered.data.size !== p.rendered_bytes
    )
      throw new CloudError(
        'A downloaded photo has an unexpected size. Retry sync.'
      )
    // Downloads render only as local Blobs; no remote image CSP allowance is needed.
    await putEditedPhoto(
      id,
      {
        source: source.data,
        rendered: rendered.data,
        width: p.source_width,
        height: p.source_height,
        crop: { x: p.crop_x, y: p.crop_y, zoom: p.crop_zoom }
      },
      `.account-${owner}`
    )
    check()
    if (typeof window !== 'undefined')
      window.dispatchEvent(
        new CustomEvent('daily-deck-cloud-photos', { detail: { owner, id } })
      )
  }
}
export async function cachedPhoto(
  id: string,
  scope: string
): Promise<StoredPhoto> {
  let rendered = await getPhoto(id, scope)
  if (!rendered)
    throw new CloudError(
      'A selected photo is unavailable. Choose it again.',
      'PHOTO'
    )
  const edit = await getPhotoEdit(id, scope)
  if (rendered.type !== 'image/jpeg')
    rendered = (await renderPhoto(edit)).rendered
  return { id, rendered, edit }
}
export async function cleanupPhoto(
  client: SupabaseClient,
  owner: string,
  id: string,
  check: () => void
) {
  check()
  const result = await client.rpc('daily_deck_photo', {
    p_expected_user: owner,
    p_id: id,
    p_cleanup: true
  })
  check()
  if (result.error) throw cloudError(result.error)
  // A previous interrupted cleanup may already have removed metadata. Owner-only
  // listing finds its remaining bytes; history FKs were checked before metadata removal.
  const listed = await client.storage
    .from(bucket)
    .list(`${owner}/${id}`, { limit: 100 })
  check()
  if (listed.error)
    throw new CloudError('Unused photo file cleanup needs another retry.')
  const paths = (listed.data ?? [])
    .filter((p) =>
      /^(card\.jpg|original\.(png|jpg|jpeg|webp|avif))$/.test(p.name)
    )
    .map((p) => `${owner}/${id}/${p.name}`)
  if (paths.length) {
    const removed = await client.storage.from(bucket).remove(paths)
    check()
    if (removed.error)
      throw new CloudError(
        'Unused photo metadata was removed, but file cleanup needs another retry.'
      )
    const remaining = await client.storage
      .from(bucket)
      .list(`${owner}/${id}`, { limit: 100 })
    check()
    if (
      remaining.error ||
      (remaining.data ?? []).some((p) =>
        paths.includes(`${owner}/${id}/${p.name}`)
      )
    )
      throw new CloudError(
        'Some files remain or became referenced. Refresh before retrying cleanup.'
      )
  }
}

export function saveFailureMessage(error:unknown){
 const prefix=error instanceof CloudError?({conflict:'Save conflict. ',rejected:'Save rejected. ',network:'Save not sent: connection unavailable. ',auth:'Sign-in required. ',unknown:'Save not confirmed. '}[error.outcome]):'Save not confirmed. '
 return prefix+(error instanceof Error?error.message:'Check your connection and retry the original request.')
}
