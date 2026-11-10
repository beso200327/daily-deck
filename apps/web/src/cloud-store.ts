import type { SupabaseClient } from '@supabase/supabase-js'
import * as D from './deck'
import { assertCapacity } from './limits'
import { auth } from './auth-store'
import { getSupabaseClient } from './supabase'
import { setPhotoScope, photoScope } from './photos'
import { exportBackup, validateBackupDeck, withDataLock } from './backup'
import { commandBetween, taskInput, mapImport, photoIds } from './cloud-model'
import {
  cachedPhoto,
  uploadPhoto,
  ensurePhotos,
  syncRequest,
  cleanupPhoto,
  bindAccountClient,
  cloudError,
  validateSnapshot,
  CloudError,
  type CloudSnapshot,
  type CloudRequest
} from './cloud-api'
import { transfer, type Transfer } from './cloud-transfer'
export type CloudState = {
  selectionReady: boolean
  scope: string
  owner: string | null
  phase: 'local' | 'loading' | 'ready' | 'saving' | 'offline' | 'error'
  snapshot: CloudSnapshot | null
  error: string
  pending: CloudRequest | null
  preparing: boolean
  summary: {
    tasks: number
    habits: number
    occurrences: number
    photos: number
  } | null
  existing: boolean | null
  notice: string
}
type Dependencies = {
  client: () => Promise<SupabaseClient | null>
  identity: () => string | undefined
  storage: () => Storage
  zone: () => string
  bind?: typeof bindAccountClient
}
const key = (owner: string, kind: string) =>
  `daily-deck.cloud.${owner}.${kind}.v1`
export class CloudStore {
  private state: CloudState = {
    selectionReady: false,
    scope: 'local',
    owner: null,
    phase: 'local',
    snapshot: null,
    error: '',
    pending: null,
    preparing: false,
    summary: null,
    existing: null,
    notice: ''
  }
  private listeners = new Set<() => void>()
  private epoch = 0
  private confirmedRevision = -1
  private uid: string | undefined
  private stop: (() => void) | undefined
  private queue: Promise<unknown> = Promise.resolve()
  private retryFlight: Promise<CloudSnapshot> | null = null
  private staged: Transfer | undefined
  constructor(private deps: Dependencies) {}
  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private patch(v: Partial<CloudState>) {
    this.state = { ...this.state, ...v }
    this.listeners.forEach((l) => l())
  }
  start() {
    if (this.stop) return
    const observe = () => this.identityChanged()
    this.stop = auth.subscribe(observe)
    observe()
  }
  identityChanged(force = false) {
    const uid = this.deps.identity()
    if (!force && uid === this.uid) return
    this.uid = uid
    this.epoch++
    this.confirmedRevision = -1
    this.retryFlight = null
    this.staged = undefined
    setPhotoScope()
    this.state = {
      selectionReady: false,
      scope: 'local',
      owner: uid ?? null,
      phase: 'local',
      snapshot: null,
      error: '',
      pending: null,
      preparing: false,
      summary: null,
      existing: null,
      notice: ''
    }
    try {
      if (uid) {
        this.state.pending = this.readPending(uid)
        if (this.deps.storage().getItem(key(uid, 'mode')) === 'cloud') {
          void this.open().catch(e => {
            if (this.uid === uid && this.state.scope === 'local') this.patch({error: e instanceof Error ? e.message : 'Cloud unavailable.'})
          })
          return
        }
      }
      this.patch({selectionReady: true})
    } catch {
      this.patch({error: 'Account preferences could not be read. Retry before opening a deck.'})
    }
  }

  private check(owner: string, epoch = this.epoch) {
    if (epoch !== this.epoch || this.deps.identity() !== owner)
      throw new CloudError(
        'The account changed. This operation stopped; its original account and the local deck remain separate.',
        'ACCOUNT'
      )
  }
  private async api(owner: string, epoch: number) {
    this.check(owner, epoch)
    const api = await this.deps.client()
    this.check(owner, epoch)
    if (!api)
      throw new CloudError(
        'Cloud storage is unavailable in this build. Keep using the local deck.'
      )
    return (this.deps.bind ?? bindAccountClient)(api, owner, () =>
      this.check(owner, epoch)
    )
  }
  private owner() {
    const owner = this.deps.identity()
    if (!owner)
      throw new CloudError(
        'Sign in and finish Preview onboarding first.',
        'ACCOUNT'
      )
    return owner
  }
  private readPendings(owner: string): CloudRequest[] {
    try {
      const storage = this.deps.storage(),
        prefix = key(owner, 'pending'),
        names = [prefix]
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i)
        if (name?.startsWith(prefix + '.')) names.push(name)
      }
      const values: CloudRequest[] = []
      for (const name of names) {
        const raw = storage.getItem(name)
        if (raw === null) continue
        const p = JSON.parse(raw)
        if (
          p?.owner !== owner ||
          typeof p.id !== 'string' ||
          !/^(?:[0-9a-f]{32}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i.test(
            p.id
          ) ||
          !['save', 'action', 'undo', 'delete', 'reorder', 'import'].includes(
            p.operation
          ) ||
          !p.args ||
          typeof p.args !== 'object' ||
          Array.isArray(p.args) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(p.args.localDay) ||
          !Number.isSafeInteger(p.revision) ||
          p.revision < 0 ||
          typeof p.timezone !== 'string'
        )
          throw new Error('Invalid pending request')
        values.push(p)
      }
      return [...new Map(values.map((p) => [p.id, p])).values()].sort((a, b) =>
        a.id.localeCompare(b.id)
      )
    } catch {
      throw new CloudError(
        'The pending cloud save is unreadable. Keep your browser data and use a backup before recovery.'
      )
    }
  }
  private readPending(owner: string) {
    const values = this.readPendings(owner)
    return (
      values.find((p) => p.id === this.state.pending?.id) ?? values[0] ?? null
    )
  }
  private savePending(p: CloudRequest | null, owner: string, id?: string) {
    const storage = this.deps.storage(),
      prefix = key(owner, 'pending')
    if (p) {
      storage.setItem(prefix + '.' + p.id, JSON.stringify(p))
      this.patch({ pending: p })
    } else {
      if (!id) throw new Error('Missing receipt ID')
      storage.removeItem(prefix + '.' + id)
      const old = storage.getItem(prefix)
      if (old && JSON.parse(old).id === id) storage.removeItem(prefix)
      this.patch({ pending: this.readPending(owner) })
    }
  }
  private async accept(api: SupabaseClient, s: CloudSnapshot, epoch: number) {
    this.check(s.owner_id, epoch)
    if (this.state.scope !== s.owner_id) return s
    let photoError = ''
    try {
      await ensurePhotos(api, s.owner_id, s.photos, photoIds(s.deck), () =>
        this.check(s.owner_id, epoch)
      )
    } catch (e) {
      this.check(s.owner_id, epoch)
      photoError =
        e instanceof Error
          ? e.message
          : 'Some cloud photos could not be downloaded. Retry sync.'
    }
    this.check(s.owner_id, epoch)
    if (s.revision < this.confirmedRevision && this.state.snapshot)
      return this.state.snapshot
    this.confirmedRevision = s.revision
    this.patch({ snapshot: s, phase: 'ready', error: photoError })
    try {
      this.deps.storage().setItem(key(s.owner_id, 'cache'), JSON.stringify(s))
    } catch {
      this.patch({
        notice: 'Saved online. This browser could not retain an offline cache.'
      })
    }
    return s
  }
  private async readFor(owner: string, epoch: number) {
    const api = await this.api(owner, epoch)
    const s = await syncRequest(api, {
      owner,
      id: D.uid(),
      operation: 'read',
      revision: 0,
      args: {},
      timezone: this.deps.zone()
    })
    this.check(owner, epoch)
    return { api, s }
  }
  async inspect() {
    const owner = this.owner(),
      epoch = this.epoch
    const { s } = await this.readFor(owner, epoch)
    this.patch({ existing: !!s.imported || s.deck.tasks.length > 0 })
    return s
  }
  async open() {
    const owner = this.owner()
    const pending = this.readPending(owner)
    try {
      this.deps.storage().setItem(key(owner, 'mode'), 'cloud')
    } catch {
      throw new CloudError(
        'This browser cannot retain cloud recovery settings. Free some site storage or keep using the local deck.'
      )
    }
    this.epoch++
    this.confirmedRevision = -1
    const epoch = this.epoch
    setPhotoScope(owner)
    this.patch({
      selectionReady: true,
      scope: owner,
      owner,
      phase: 'loading',
      snapshot: null,
      error: '',
      summary: null,
      pending,
      notice: ''
    })
    try {
      const raw = this.deps.storage().getItem(key(owner, 'cache'))
      if (raw) {
        const s = JSON.parse(raw) as CloudSnapshot
        if (s.owner_id === owner) {
          s.deck = validateBackupDeck(s.deck)
          this.patch({ snapshot: s })
        }
      }
    } catch {
      /* A bad cache is never uploaded; fetch the authoritative data. */
    }
    try {
      this.patch({ pending: this.readPending(owner) })
      const { api, s } = await this.readFor(owner, epoch)
      return await this.accept(api, s, epoch)
    } catch (e) {
      if (epoch === this.epoch)
        this.patch({
          phase: 'offline',
          error:
            e instanceof Error ? e.message : 'Cloud is unavailable. Retry sync.'
        })
      throw e
    }
  }
  local(owner = this.deps.identity()) {
    let error = '',
      pending: CloudRequest | null = null
    try {
      if (owner) {
        this.deps.storage().setItem(key(owner, 'mode'), 'local')
        pending = this.readPending(owner)
      }
    } catch {
      error =
        'Using the local deck. This browser could not remember the preference or read the pending cloud save; keep its data for recovery.'
    }
    this.epoch++
    this.confirmedRevision = -1
    this.retryFlight = null
    this.staged = undefined
    setPhotoScope()
    this.patch({
      selectionReady: true,
      scope: 'local',
      snapshot: null,
      phase: 'local',
      pending,
      error,
      summary: null,
      existing: null,
      notice: ''
    })
  }
  async refresh() {
    const owner = this.owner(),
      epoch = this.epoch
    if (this.state.scope !== owner)
      throw new CloudError('Open the cloud deck first.')
    try {
      this.patch({ pending: this.readPending(owner) })
      const { api, s } = await this.readFor(owner, epoch)
      return await this.accept(api, s, epoch)
    } catch (e) {
      if (epoch === this.epoch)
        this.patch({
          phase: 'offline',
          error: e instanceof Error ? e.message : 'Cloud is unavailable.'
        })
      if (this.state.snapshot && epoch === this.epoch)
        return this.state.snapshot
      throw e
    }
  }
  transact(
    change?: (deck: D.Deck, now: Date) => void,
    expectedRevision?: number
  ): Promise<CloudSnapshot> {
    const epoch = this.epoch,
      owner = this.owner()
    const run = async () => {
      this.check(owner, epoch)
      if (this.state.scope !== owner)
        throw new CloudError('The deck source changed.')
      if (!change) return this.refresh()
      if (this.state.phase === 'loading')
        throw new CloudError('Wait for the cloud deck to finish opening.')
      if (this.state.phase === 'offline')
        throw new CloudError(
          'You are viewing the last confirmed cloud copy. Reconnect and retry sync before saving.'
        )
      this.patch({ pending: this.readPending(owner) })
      if (this.state.pending)
        throw new CloudError(
          'A cloud save is unresolved. Retry the pending save before making another change.'
        )
      const before = this.state.snapshot
      if (!before)
        throw new CloudError('Wait for cloud data to finish opening.')
      if (
        expectedRevision !== undefined &&
        expectedRevision !== before.revision
      )
        throw new CloudError(
          'The cloud deck changed in another browser while this form was open. Your draft is still here. Copy anything you need, then cancel and reopen the current task.',
          '40001'
        )
      const after = structuredClone(before.deck),
        now = new Date()
      change(after, now)
      assertCapacity(before.deck, after)
      const command = commandBetween(before.deck, after)
      const { kind, ...args } = command
      const p: CloudRequest = {
        owner,
        id: D.uid(),
        revision: before.revision,
        operation: kind,
        args: {
          ...args,
          ...(kind === 'save'
            ? {
                task: taskInput(
                  command.kind === 'save' ? command.task : undefined!
                )
              }
            : {}),
          localDay: D.dayKey(now)
        },
        timezone: this.deps.zone()
      }
      this.savePending(p, owner)
      return this.perform(p, epoch)
    }
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => {})
    return result
  }
  private async perform(p: CloudRequest, epoch: number, retrying = false) {
    this.check(p.owner, epoch)
    this.patch({ phase: 'saving', error: '' })
    let sent = false
    try {
      const api = await this.api(p.owner, epoch)
      if (p.operation === 'save') {
        const task = p.args.task as D.Task
        if (task.photoId) {
          const exists = this.state.snapshot?.photos.some(
            (x) => x.id === task.photoId && x.referenced === true
          )
          if (!exists) {
            const photo = await cachedPhoto(task.photoId, `.account-${p.owner}`)
            this.check(p.owner, epoch)
            await uploadPhoto(api, p.owner, task.photoId, photo, () =>
              this.check(p.owner, epoch)
            )
          }
        }
      }
      sent = true
      const s = await syncRequest(api, p)
      this.check(p.owner, epoch)
      this.savePending(null, p.owner, p.id)
      this.recordOutcome(p,'confirmed','')
      return await this.accept(api, s, epoch)
    } catch (e) {
      if (epoch !== this.epoch) throw e
      let failure=e
      const original = e instanceof CloudError ? e : null
      if(sent&&(!original||['unknown','network'].includes(original.outcome)))failure=new CloudError('The connection ended before the save response was verified. The result is unknown; keep this draft and retry the original transaction.',original?.code??'','unknown')
      if(sent && (!original || ['unknown','network'].includes(original.outcome))){
        try{
          const api=await this.api(p.owner,epoch)
          const status=await api.rpc('daily_deck_sync_status',{p_expected_user:p.owner,p_request_id:p.id})
          this.check(p.owner,epoch)
          if(!status.error && status.data?.applied===true){
            const s=validateSnapshot(status.data.snapshot,p.owner)
            this.savePending(null,p.owner,p.id);this.recordOutcome(p,'confirmed','receipt')
            return await this.accept(api,s,epoch)
          }
          // Status serializes on the original transaction lock. A missing receipt
          // plus an advanced revision proves this stale request cannot apply later.
          if(!status.error && status.data?.applied===false && status.data.snapshot?.owner_id===p.owner && Number.isSafeInteger(status.data.snapshot.revision) && status.data.snapshot.revision>p.revision)
            failure=new CloudError('The transaction was not applied: the cloud deck changed while this draft was open. Review the saved task and reopen before editing.','40001')
        }catch{/* Preserve the original request ID until a receipt can be checked. */}
      }
      const code=failure instanceof CloudError?failure.code:''
      // Release only a newly prepared request known never to have reached sync.
      // A preflight failure on a RETRY must retain the original unknown request.
      if((!sent&&!retrying)||(code==='PHOTO'&&!retrying)||(sent && failure instanceof CloudError && ['conflict','rejected'].includes(failure.outcome)))this.savePending(null,p.owner,p.id)
      this.recordOutcome(p,failure instanceof CloudError?failure.outcome:'unknown',code)
      this.patch({
        phase: 'error',
        error:
          failure instanceof Error ? failure.message : 'Cloud save could not be confirmed.'
      })
      throw failure
    }
  }
  private recordOutcome(p:CloudRequest,outcome:string,code:string){
    try{const storage=this.deps.storage(),name=key(p.owner,'outcomes');let rows=[];try{const value=JSON.parse(storage.getItem(name)??'[]');rows=Array.isArray(value)?value:[]}catch{};storage.setItem(name,JSON.stringify([...rows.filter((r:{id:string})=>r.id!==p.id),{id:p.id,outcome,code,at:new Date().toISOString()}].slice(-20)))}catch{/* Never drop the durable pending request because diagnostics cannot be retained. */}
  }
  retry(): Promise<CloudSnapshot> {
    if (this.retryFlight) return this.retryFlight
    const owner=this.owner(), epoch=this.epoch
    const work = this.queue.then(() => {this.check(owner,epoch);return this.retryPending()})
    this.retryFlight = work
    this.queue = work.catch(() => {})
    void work.then(() => {if(this.retryFlight===work)this.retryFlight=null}, () => {if(this.retryFlight===work)this.retryFlight=null})
    return work
  }
  private async retryPending() {
    const owner = this.owner(),
      epoch = this.epoch,
      p = this.state.pending ?? this.readPending(owner)
    if (!p) return this.refresh()
    if (this.state.phase === 'saving')
      throw new CloudError('A cloud save is already in progress.')
    const api = await this.api(owner, epoch),
      resolved = await api.rpc('daily_deck_sync_status', {
        p_expected_user: owner,
        p_request_id: p.id
      })
    this.check(owner, epoch)
    if (resolved.error) throw cloudError(resolved.error)
    if (resolved.data?.applied === true) {
      // Get a fully validated fresh snapshot through the normal typed reader.
      const s=validateSnapshot(resolved.data.snapshot,owner)
      this.savePending(null, owner, p.id)
      this.recordOutcome(p,'confirmed','receipt')
      if (p.operation === 'import') return this.open()
      return this.accept(api, s, epoch)
    }
    if (resolved.data?.applied !== false)
      throw new CloudError(
        'The pending save could not be verified. Retry after reconnecting.'
      )
    if(resolved.data.snapshot?.owner_id===owner && resolved.data.snapshot.revision>p.revision){
      this.savePending(null,owner,p.id);this.recordOutcome(p,'conflict','40001')
      const conflict=new CloudError('The original transaction was not applied because the cloud changed. Your draft is still here. Reopen the saved task before editing.','40001');this.patch({phase:'error',error:conflict.message});throw conflict
    }
    if (p.operation === 'import') {
      const saved = await transfer(owner, undefined, p.id)
      this.check(owner, epoch)
      if (!saved || saved.id !== p.id)
        throw new CloudError(
          'The import backup is unavailable. Keep your original local deck for recovery.'
        )
      this.staged = saved
      return this.finishImport(true, p)
    }
    return this.perform(p, epoch, true)
  }
  holdsPhoto(id: string, scope = photoScope()) {
    const owner = scope.startsWith('.account-') ? scope.slice(9) : undefined
    return owner
      ? this.readPendings(owner).some(
          (p) => (p.args.task as D.Task | undefined)?.photoId === id
        )
      : (this.state.pending?.args.task as D.Task | undefined)?.photoId === id
  }
  async prepareImport() {
    const owner = this.owner(),
      epoch = this.epoch
    if (this.state.preparing) return
    this.patch({ preparing: true, error: '', summary: null })
    try {
      const s = await this.inspect()
      if (s.imported || s.deck.tasks.length) {
        this.patch({ existing: true })
        throw new CloudError(
          'This account already has cloud data. Open it without importing, or keep this device local. Merge and replacement are not offered.'
        )
      }
      const old = await transfer(owner)
      this.check(owner, epoch)
      if (old && this.readPending(owner)?.id === old.id) {
        this.staged = old
      } else {
        const backup = await withDataLock(() =>
          exportBackup(this.deps.storage(), true)
        )
        this.check(owner, epoch)
        const parsed = JSON.parse(await backup.text())
        const raw = validateBackupDeck(parsed.deck),
          mapped = await mapImport(owner, raw),
          photos = []
        this.check(owner, epoch)
        for (const [oldId, id] of mapped.photos) {
          const photo = await cachedPhoto(oldId, '')
          this.check(owner, epoch)
          photos.push({ ...photo, id })
        }
        this.staged = {
          owner,
          id: D.uid(),
          revision: s.revision,
          deck: mapped.deck,
          photos,
          backup,
          createdAt: new Date().toISOString()
        }
        await transfer(owner, this.staged)
        this.check(owner, epoch)
      }
      const t = this.staged
      this.patch({
        summary: {
          tasks: t.deck.tasks.filter((t) => !D.isHabit(t)).length,
          habits: t.deck.tasks.filter(D.isHabit).length,
          occurrences: t.deck.cards.length,
          photos: t.photos.length
        },
        existing: false
      })
    } catch (e) {
      if (epoch === this.epoch)
        this.patch({
          error: e instanceof Error ? e.message : 'Could not prepare an import.'
        })
      throw e
    } finally {
      if (epoch === this.epoch) this.patch({ preparing: false })
    }
  }
  cancelImport() {
    this.staged = undefined
    this.patch({ summary: null })
  }
  async finishImport(retry = false, originalRequest?: CloudRequest) {
    const owner = this.owner()
    const t = this.staged
    if (!t || t.owner !== owner)
      throw new CloudError('Review the import summary first.')
    if (this.state.phase === 'saving')
      throw new CloudError('Import is already in progress.')
    if (!retry && this.readPending(owner))
      throw new CloudError(
        'Retry the pending import instead of starting another one.'
      )
    const epoch = this.epoch
    const p: CloudRequest = retry
      ? (originalRequest ?? this.readPending(owner))!
      : {
          owner,
          id: t.id,
          revision: t.revision,
          operation: 'import',
          args: { localDay: D.dayKey(), deck: t.deck },
          timezone: this.deps.zone()
        }
    if (!p || p.owner !== owner || p.operation !== 'import' || p.id !== t.id)
      throw new CloudError(
        'The pending import is unavailable or changed. Retry its original request.'
      )
    this.savePending(p, owner)
    this.patch({ phase: 'saving', error: '' })
    let sent = false
    try {
      const api = await this.api(owner, epoch)
      for (const photo of t.photos) {
        await uploadPhoto(api, owner, photo.id, photo, () =>
          this.check(owner, epoch)
        )
      }
      sent = true
      const s = await syncRequest(api, p)
      this.check(owner, epoch)
      this.savePending(null, owner, p.id)
      this.patch({
        summary: null,
        notice:
          'Import confirmed online. Your original local deck and pre-import backup are preserved.'
      })
      this.staged = undefined
      await this.open()
      return s
    } catch (e) {
      if (epoch === this.epoch) {
        if (
          e instanceof CloudError &&
          (e.code === 'PHOTO' ||
            (sent &&
              [
                '40001',
                '23514',
                '23503',
                '23505',
                '22023',
                '22P02',
                '23502',
                '54000'
              ].includes(e.code)))
        )
          this.savePending(null, owner, p.id)
        this.patch({
          phase: 'error',
          error:
            e instanceof Error
              ? e.message
              : 'Import could not be confirmed. Retry it; your local deck is intact.'
        })
      }
      throw e
    }
  }
  async backup() {
    const owner = this.owner(),
      epoch = this.epoch
    const t = await transfer(
      owner,
      undefined,
      this.state.snapshot?.import_id ?? undefined
    )
    this.check(owner, epoch)
    if (!t)
      throw new CloudError(
        'No pre-import backup has been created for this account on this browser.'
      )
    return t.backup
  }
  async cleanup() {
    const owner = this.owner(),
      epoch = this.epoch
    if (this.state.phase === 'saving')
      throw new CloudError(
        'Wait for the active save before cleaning up photos.'
      )
    const { api, s } = await this.readFor(owner, epoch),
      pendings = this.readPendings(owner),
      protectedPhotos = pendings.flatMap((p) =>
        p.operation === 'import'
          ? photoIds(p.args.deck as D.Deck)
          : [(p.args.task as D.Task | undefined)?.photoId].filter(
              (v): v is string => !!v
            )
      ),
      refs = [
        ...photoIds(s.deck),
        ...s.photos.filter((p) => p.referenced).map((p) => p.id),
        ...protectedPhotos
      ],
      storage = this.deps.storage(),
      saved = storage.getItem(key(owner, 'cleanup'))
    let ids: string[] = saved ? JSON.parse(saved) : []
    const names: string[] = []
    for (let offset = 0; offset < 100000; offset += 1000) {
      const folders = await api.storage.from('daily-deck-photos').list(owner, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      })
      this.check(owner, epoch)
      if (folders.error)
        throw new CloudError(
          'Could not list unused account photos. Retry cleanup.'
        )
      names.push(...(folders.data ?? []).map((p) => p.name))
      if ((folders.data ?? []).length < 1000) break
    }
    ids = [...new Set([...ids, ...s.photos.map((p) => p.id), ...names])].filter(
      (id) => /^[a-f0-9-]{36}$/.test(id) && !refs.includes(id)
    )
    const count = ids.length
    storage.setItem(key(owner, 'cleanup'), JSON.stringify(ids))
    while (ids.length) {
      await cleanupPhoto(api, owner, ids[0], () => this.check(owner, epoch))
      this.check(owner, epoch)
      ids = ids.slice(1)
      storage.setItem(key(owner, 'cleanup'), JSON.stringify(ids))
    }
    if (this.state.scope === owner) await this.refresh()
    this.check(owner, epoch)
    this.patch({
      notice: `Cleaned up ${count} unused photo registrations. Referenced historical photos were kept.`
    })
  }
}
export const cloud = new CloudStore({
  client: getSupabaseClient,
  identity: () => {
    const s = auth.snapshot()
    return s.ready && s.onboarding?.complete ? s.user?.id : undefined
  },
  storage: () => localStorage,
  zone: () => Intl.DateTimeFormat().resolvedOptions().timeZone
})
