import { it, expect, vi, afterEach } from 'vitest'
import * as D from '../src/deck'
import { commandBetween, mapImport, mappedId } from '../src/cloud-model'
import { CloudStore } from '../src/cloud-store'
import { CloudError } from '../src/cloud-api'
import { photoScope } from '../src/photos'
vi.mock('../src/supabase', () => ({
  supabaseConfiguration: { status: 'missing' },
  getSupabaseClient: async () => null
}))
const A = '11111111-1111-1111-1111-111111111111',
  B = '22222222-2222-2222-2222-222222222222'
const task = (id = 'legacy-task', habit = false): D.Task => ({
  id,
  kind: habit ? 'habit' : 'today',
  title: 'Private local task',
  notes: 'Keep my note',
  minutes: null,
  weekdays: habit ? [0, 1, 2, 3, 4, 5, 6] : [],
  created: D.dayKey(),
  archived: false,
  icon: 'neutral'
})
const empty = (): D.Deck => ({ version: 1, tasks: [], cards: [] })
function fixture() {
  let owner: string | undefined = A,
    remote = empty(),
    revision = 0,
    offline = false,
    verificationOffline = false,
    statusOffline=false,
    drop = false,
    hold: Promise<void> | null = null
  const receipts = new Set<string>(),
    map = new Map<string, string>([[D.STORAGE_KEY, 'original guest deck']]),
    calls: any[] = []
  const storage = {
    get length() {
      return map.size
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k)
  } as unknown as Storage
  const api = {
    rpc: vi.fn(async (name: string, p: any) => {
      calls.push({ name, p })
      if (offline) return { data: null, error: { code: 'FETCH_ERROR' } }
      if (hold) await hold
      if (name === 'daily_deck_sync_status')
        return statusOffline?{data:null,error:{code:'FETCH_ERROR'}}:{ data: { applied: receipts.has(p.p_request_id),snapshot:{owner_id:owner,revision,deck:structuredClone(remote),photos:[]} }, error: null }
      if (p.p_expected_user !== owner)
        return { data: null, error: { code: '42501' } }
      if (p.p_operation !== 'read' && !receipts.has(p.p_request_id)) {
        if (p.p_revision !== revision)
          return { data: null, error: { code: '40001' } }
        if (p.p_operation === 'save')
          D.saveTask(remote, {
            ...p.p_args.task,
            created: D.dayKey(),
            archived: false
          })
        else if (p.p_operation === 'action')
          D.act(remote, p.p_args.cardId, p.p_args.action)
        receipts.add(p.p_request_id)
        revision++
        if (drop) {
          drop = false
          return { data: null, error: { code: 'FETCH_ERROR' } }
        }
      }
      return {
        data: {
          owner_id: owner,
          revision,
          deck: structuredClone(remote),
          photos: []
        },
        error: null
      }
    })
  }
  const makeStore = () => new CloudStore({
    client: async () => api as any,
    identity: () => owner,
    storage: () => storage,
    zone: () => 'UTC',
    bind: async (api) => {if(verificationOffline)throw new CloudError('No change request was sent.','FETCH_ERROR','network');return api}
  })
  const store = makeStore()
  store.identityChanged()
  return {
    store,
    map,
    calls,
    api,
    remote: () => remote,
    storage,
    identity: (id?: string) => {
      owner = id
      store.identityChanged()
    },
    reopen: makeStore,
    verificationOffline: (v: boolean) => (verificationOffline = v),
    offline: (v: boolean) => (offline = v),
    drop: () => (drop = true),
    statusOffline:(v:boolean)=>(statusOffline=v),
    conflict: () => revision++,
    hold: (v: Promise<void> | null) => (hold = v)
  }
}
afterEach(() => vi.restoreAllMocks())
it('name-derived UUIDv8 mapping is deterministic and scoped by owner/entity', async () => {
  const a = await mappedId(A, 'item', 'old/id')
  expect(a).toMatch(/^[a-f0-9-]{14}8[a-f0-9-]{21}$/)
  expect(await mappedId(A, 'item', 'old/id')).toBe(a)
  expect(await mappedId(B, 'item', 'old/id')).not.toBe(a)
  expect(await mappedId(A, 'photo', 'old/id')).not.toBe(a)
})
it('legacy import maps all IDs, retains dates/text/timestamps and reconstructs missing sequences deterministically', async () => {
  const d = empty()
  D.saveTask(d, task())
  D.act(d, d.cards[0].id, 'later')
  D.act(d, d.cards[0].id, 'done')
  d.cards[0].events.forEach((e) => delete e.sequence)
  d.tasks[0].photoId = 'legacy-photo'
  d.cards[0].photoId = 'legacy-photo'
  const original = structuredClone(d),
    one = await mapImport(A, d),
    two = await mapImport(A, d)
  expect(one.deck).toEqual(two.deck)
  expect(d).toEqual(original)
  expect(one.deck.cards[0].events.map((e) => e.at)).toEqual(
    original.cards[0].events.map((e) => e.at)
  )
  expect(one.deck.cards[0].events.map((e) => e.sequence)).toEqual([1, 2])
  expect(one.deck.cards[0].taskId).toBe(one.deck.tasks[0].id)
  expect(one.deck.cards[0].photoId).toBe(one.deck.tasks[0].photoId)
  expect(one.deck.tasks[0].minutes).toBeNull()
  expect(one.deck.tasks[0].deadline).toBeUndefined()
})
it('valid global event sequences and Undo relationships survive mapping', async () => {
  const d = empty()
  D.saveTask(d, task())
  D.act(d, d.cards[0].id, 'later')
  D.undo(d, D.undoToken(d)!)
  const x = await mapImport(A, d)
  expect(x.deck.cards[0].events[1].target).toBe(x.deck.cards[0].events[0].id)
  expect(x.deck.cards[0].events.map((e) => e.sequence)).toEqual([1, 2])
})
it.each(['done', 'later', 'skip'] as const)(
  'normal %s produces an intent, not a replacement snapshot',
  (action) => {
    const d = empty()
    D.saveTask(d, task())
    const x = structuredClone(d)
    D.act(x, d.cards[0].id, action)
    expect(commandBetween(d, x)).toEqual({
      kind: 'action',
      action,
      cardId: d.cards[0].id
    })
  }
)
it('creation, edit, delete, Undo and reorder use narrow command shapes', () => {
  const d = empty(),
    x = empty()
  D.saveTask(x, task())
  expect(commandBetween(d, x).kind).toBe('save')
  const y = structuredClone(x)
  D.saveTask(y, { ...y.tasks[0], title: 'New text' })
  expect(commandBetween(x, y).kind).toBe('save')
  const z = structuredClone(y)
  D.removeTask(z, z.tasks[0].id)
  expect(commandBetween(y, z)).toEqual({
    kind: 'delete',
    taskId: y.tasks[0].id
  })
  const a = structuredClone(x)
  D.act(a, a.cards[0].id, 'later')
  const b = structuredClone(a)
  D.undo(b, D.undoToken(a)!)
  expect(commandBetween(a, b)).toEqual({
    kind: 'undo',
    eventId: D.undoToken(a)
  })
  D.saveTask(x, task('second'))
  const order = structuredClone(x),
    ids = D.pending(x)
      .map((c) => c.id)
      .reverse()
  D.reorder(order, ids)
  expect(commandBetween(x, order)).toEqual({ kind: 'reorder', ids })
})
it('rewritten historical events are never sent as a normal mutation', () => {
  const d = empty()
  D.saveTask(d, task())
  D.act(d, d.cards[0].id, 'done')
  const x = structuredClone(d)
  x.cards[0].events[0].at = '2020-01-01T00:00:00Z'
  expect(() => commandBetween(d, x)).toThrow('Historical')
})
it('opening cloud never uploads/changes the guest deck', async () => {
  const f = fixture()
  await f.store.open()
  expect(f.calls.every((c) => c.p.p_operation === 'read')).toBe(true)
  expect(f.map.get(D.STORAGE_KEY)).toBe('original guest deck')
  expect(f.store.snapshot().snapshot?.deck.tasks).toHaveLength(0)
})
it('cloud writes wait for a server reply and retain an owner-bound pending request', async () => {
  const f = fixture()
  await f.store.open()
  let release!: () => void
  f.hold(new Promise((r) => (release = r)))
  const save = f.store.transact((d) => D.saveTask(d, task()))
  await vi.waitFor(() => expect(f.store.snapshot().phase).toBe('saving'))
  expect(f.store.snapshot().snapshot?.deck.tasks).toHaveLength(0)
  expect(f.store.snapshot().pending?.owner).toBe(A)
  release()
  await save
  expect(f.store.snapshot().snapshot?.deck.tasks).toHaveLength(1)
  expect(f.store.snapshot().pending).toBeNull()
  expect(f.map.get(D.STORAGE_KEY)).toBe('original guest deck')
})
it('a lost response is reconciled by its receipt without a duplicate task or write',async()=>{
 const f=fixture();await f.store.open();f.drop()
 await f.store.transact(d=>D.saveTask(d,task()))
 expect(f.remote().tasks).toHaveLength(1);expect(f.calls.filter(c=>c.p.p_operation==='save')).toHaveLength(1);expect(f.store.snapshot().pending).toBeNull()
 expect(f.map.get(`daily-deck.cloud.${A}.outcomes.v1`)).toContain('confirmed')
})
it('stale conflicts reject without overwriting and keep the guest data', async () => {
  const f = fixture()
  await f.store.open()
  f.conflict()
  await expect(f.store.transact((d) => D.saveTask(d, task()))).rejects.toThrow(
    'changed in another browser'
  )
  expect(f.store.snapshot().pending).toBeNull()
  expect(f.remote().tasks).toHaveLength(0)
  expect(f.map.get(D.STORAGE_KEY)).toBe('original guest deck')
})
it('offline reads retain the last confirmed copy and prohibit unconfirmed changes', async () => {
  const f = fixture()
  await f.store.open()
  await f.store.transact((d) => D.saveTask(d, task()))
  f.offline(true)
  const read = await f.store.refresh()
  expect(read.deck.tasks).toHaveLength(1)
  await expect(
    f.store.transact((d) => D.saveTask(d, task('offline')))
  ).rejects.toThrow('Reconnect')
  expect(f.remote().tasks).toHaveLength(1)
  expect(f.store.snapshot().pending).toBeNull()
})
it('logout and account switching hide prior cached content and photo namespace', async () => {
  const f = fixture()
  await f.store.open()
  await f.store.transact((d) => D.saveTask(d, task()))
  expect(photoScope()).toContain(A)
  f.identity()
  expect(f.store.snapshot().snapshot).toBeNull()
  expect(f.store.snapshot().scope).toBe('local')
  expect(photoScope()).toBe('')
  f.identity(B)
  expect(f.store.snapshot().snapshot).toBeNull()
  expect(f.store.snapshot().pending).toBeNull()
  expect(f.store.snapshot().owner).toBe(B)
  expect(f.map.get(D.STORAGE_KEY)).toBe('original guest deck')
})
it('an in-flight response from another identity cannot populate the new account', async () => {
  const f = fixture()
  await f.store.open()
  let release!: () => void
  f.hold(new Promise((r) => (release = r)))
  const work = f.store.transact((d) => D.saveTask(d, task()))
  await vi.waitFor(() => expect(f.store.snapshot().pending).not.toBeNull())
  f.identity(B)
  release()
  await expect(work).rejects.toThrow()
  expect(f.store.snapshot().owner).toBe(B)
  expect(f.store.snapshot().snapshot).toBeNull()
  expect(f.store.snapshot().scope).toBe('local')
  expect(
    [...f.map.keys()].some((k) =>
      k.startsWith(`daily-deck.cloud.${A}.pending.v1`)
    )
  ).toBe(true)
  expect(
    [...f.map.keys()].some((k) =>
      k.startsWith(`daily-deck.cloud.${B}.pending.v1`)
    )
  ).toBe(false)
})
it('a late older read cannot roll the displayed revision backwards', async () => {
  const f = fixture()
  await f.store.open()
  await f.store.transact((d) => D.saveTask(d, task()))
  const stale = structuredClone(f.store.snapshot().snapshot!),
    original = f.api.rpc.getMockImplementation()!
  let release!: (value: any) => void
  f.api.rpc.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r
      })
  )
  const read = f.store.refresh()
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  f.api.rpc.mockImplementation(original)
  await f.store.transact((d) => D.saveTask(d, task('newer')))
  release({ data: stale, error: null })
  const result = await read
  expect(result.revision).toBe(2)
  expect(f.store.snapshot().snapshot?.deck.tasks).toHaveLength(2)
})
it('a background refresh cannot upgrade the base revision of an open form', async () => {
  const f = fixture()
  await f.store.open()
  await f.store.transact((d) => D.saveTask(d, task()))
  const openedAt = f.store.snapshot().snapshot!.revision
  f.conflict()
  await f.store.refresh()
  const requests = f.calls.length
  await expect(
    f.store.transact(
      (d) => D.saveTask(d, { ...d.tasks[0], notes: 'Stale draft' }),
      openedAt
    )
  ).rejects.toThrow('while this form was open')
  expect(f.calls).toHaveLength(requests)
  expect(f.remote().tasks[0].notes).toBe('Keep my note')
  expect(f.store.snapshot().pending).toBeNull()
})
it('storage failure opening cloud leaves the local deck available without requests', async () => {
  const f = fixture()
  vi.spyOn(f.storage, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded')
  })
  await expect(f.store.open()).rejects.toThrow('recovery settings')
  expect(f.store.snapshot().scope).toBe('local')
  expect(f.calls).toHaveLength(0)
  expect(f.map.get(D.STORAGE_KEY)).toBe('original guest deck')
})
it('switching back to local always hides account data even if preferences cannot be saved', async () => {
  const f = fixture()
  await f.store.open()
  vi.spyOn(f.storage, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  expect(() => f.store.local()).not.toThrow()
  expect(f.store.snapshot().snapshot).toBeNull()
  expect(f.store.snapshot().scope).toBe('local')
  expect(photoScope()).toBe('')
  expect(f.store.snapshot().error).toContain('could not remember')
})
it('a malformed durable request is preserved and never silently replaced', async () => {
  const f = fixture(),
    name = `daily-deck.cloud.${A}.pending.v1`
  f.map.set(name, '{"owner":"wrong-user"}')
  await expect(f.store.open()).rejects.toThrow('unreadable')
  expect(f.map.get(name)).toBe('{"owner":"wrong-user"}')
  expect(f.calls).toHaveLength(0)
  expect(f.store.snapshot().scope).toBe('local')
})
it('another tab cannot overwrite a durable unresolved account request', async () => {
  const f = fixture()
  await f.store.open()
  const other = new CloudStore({
    client: async () => f.api as any,
    identity: () => A,
    storage: () => f.storage,
    zone: () => 'UTC',
    bind: async (api) => api
  })
  other.identityChanged()
  await other.open()
  f.drop();f.statusOffline(true)
  await expect(f.store.transact((d) => D.saveTask(d, task()))).rejects.toThrow(
    'result is unknown'
  )
  const original = f.store.snapshot().pending!.id
  await expect(
    other.transact((d) => D.saveTask(d, task('another-tab')))
  ).rejects.toThrow('unresolved')
  expect(other.snapshot().pending?.id).toBe(original)
  f.statusOffline(false)
  await other.retry()
  expect(f.remote().tasks).toHaveLength(1)
  await f.store.refresh()
  expect(f.store.snapshot().pending).toBeNull()
})
it('unknown request IDs survive failed receipt checks; an advanced revision later proves conflict without resubmitting',async()=>{
 const f=fixture();await f.store.open();f.statusOffline(true)
 f.api.rpc.mockImplementationOnce(async()=>({data:null,error:{code:'FETCH_ERROR'}}))
 await expect(f.store.transact(d=>D.saveTask(d,task()))).rejects.toMatchObject({outcome:'unknown'})
 const id=f.store.snapshot().pending!.id;f.conflict();f.statusOffline(false)
 await expect(f.store.retry()).rejects.toMatchObject({code:'40001',outcome:'conflict'})
 expect(f.store.snapshot().pending).toBeNull();expect(f.remote().tasks).toHaveLength(0)
 expect(f.map.get(`daily-deck.cloud.${A}.outcomes.v1`)).toContain(id)
})


it('releases a new journal after pre-dispatch verification failure; retry and reload remain usable', async()=>{
 const f=fixture();await f.store.open();f.verificationOffline(true)
 await expect(f.store.transact(d=>D.saveTask(d,task()))).rejects.toThrow('No change request')
 expect(f.store.snapshot().phase).toBe('error');expect(f.store.snapshot().pending).toBeNull()
 expect(f.calls.filter(c=>c.p.p_operation==='save')).toHaveLength(0)
 expect([...f.map.keys()].filter(k=>k.includes('.pending.'))).toHaveLength(0)
 f.verificationOffline(false)
 await f.store.transact(d=>D.saveTask(d,task()))
 const reopened=f.reopen();await reopened.open()
 expect(reopened.snapshot().snapshot?.deck.tasks).toHaveLength(1)
 expect(reopened.snapshot().pending).toBeNull()
 await reopened.transact(d=>D.act(d,d.cards[0].id,'later'))
})
it('preflight failure during recovery keeps an unknown original ID; concurrent retries reconcile once after reload',async()=>{
 const f=fixture();await f.store.open();f.drop();f.statusOffline(true)
 await expect(f.store.transact(d=>D.saveTask(d,task()))).rejects.toThrow()
 const original=f.store.snapshot().pending!;expect(original).toBeTruthy()
 f.verificationOffline(true);await expect(f.store.retry()).rejects.toThrow('No change request')
 expect(f.store.snapshot().pending?.id).toBe(original.id)
 f.verificationOffline(false);f.statusOffline(false)
 const reopened=f.reopen();await reopened.open();expect(reopened.snapshot().pending?.id).toBe(original.id)
 const a=reopened.retry(),b=reopened.retry();expect(a).toBe(b);await Promise.all([a,b])
 expect(reopened.snapshot().pending).toBeNull();expect(f.remote().tasks).toHaveLength(1)
 expect(f.calls.filter(c=>c.p.p_operation==='save')).toHaveLength(1)
})
it('legacy pre-dispatch journals recover with their original transaction and preserve stale revision protection',async()=>{
 const f=fixture();await f.store.open();f.offline(true)
 await expect(f.store.transact(d=>D.saveTask(d,task()))).rejects.toThrow()
 const p=f.store.snapshot().pending!;expect(p).toBeTruthy()
 f.offline(false);f.conflict()
 const reopened=f.reopen();await reopened.open()
 await expect(reopened.retry()).rejects.toThrow('cloud changed')
 expect(reopened.snapshot().pending).toBeNull();expect(f.remote().tasks).toHaveLength(0)
})
it('a retry that loses verification after an absent receipt retains the original journal',async()=>{
 const f=fixture();await f.store.open();f.offline(true)
 await expect(f.store.transact(d=>D.saveTask(d,task()))).rejects.toThrow()
 const id=f.store.snapshot().pending!.id;f.offline(false)
 const original=f.api.rpc.getMockImplementation()!
 f.api.rpc.mockImplementationOnce(async(name,p)=>{const result=await original(name,p);f.verificationOffline(true);return result})
 await expect(f.store.retry()).rejects.toThrow('No change request')
 expect(f.store.snapshot().pending?.id).toBe(id)
 f.verificationOffline(false);await f.store.retry()
 expect(f.store.snapshot().pending).toBeNull();expect(f.remote().tasks).toHaveLength(1)
})

it('publishes healthy save journals atomically as saving, never as recovery',async()=>{
 const f=fixture();await f.store.open()
 const {needsCloudRecovery}=await import('../src/cloud-store')
 const observed:{phase:string;pending:boolean;recovery:boolean}[]=[]
 const stop=f.store.subscribe(()=>{const s=f.store.snapshot();observed.push({phase:s.phase,pending:!!s.pending,recovery:needsCloudRecovery(s)})})
 await f.store.transact(d=>D.saveTask(d,task()))
 await f.store.transact(d=>D.act(d,d.cards[0].id,'later'))
 await f.store.transact(d=>D.act(d,d.cards[0].id,'done'))
 stop();expect(observed.some(s=>s.pending&&s.phase==='saving')).toBe(true)
 expect(observed.some(s=>s.recovery)).toBe(false)
 expect(D.outcome(f.remote().cards[0],D.dayKey())).toBe('completed')
})
it('recovery distinguishes active writes and owner-gated loading from unresolved saved requests',async()=>{
 const f=fixture();await f.store.open();f.drop();f.statusOffline(true)
 const {needsCloudRecovery}=await import('../src/cloud-store')
 await expect(f.store.transact(d=>D.saveTask(d,task()))).rejects.toThrow()
 const unknown=f.store.snapshot();expect(needsCloudRecovery(unknown)).toBe(true)
 expect(needsCloudRecovery({...unknown,phase:'saving'})).toBe(false)
 expect(needsCloudRecovery({...unknown,phase:'loading'})).toBe(false)
 expect(needsCloudRecovery({...unknown,phase:'ready'})).toBe(true)
 expect(needsCloudRecovery({...unknown,scope:'local'})).toBe(false)
 f.statusOffline(false);await f.store.retry();expect(needsCloudRecovery(f.store.snapshot())).toBe(false)
})
