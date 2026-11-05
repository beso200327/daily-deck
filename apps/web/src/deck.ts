import {storageSuffix} from './environment'
export type Day = string
export type Action = 'done' | 'later' | 'skip' | 'delete' | 'undo' | 'reorder'
export type Outcome = 'completed' | 'postponed' | 'skipped' | 'missed' | 'pending' | 'deleted'
export type Visual = 'neutral' | 'walk' | 'read' | 'water' | 'focus' | 'stretch'
export type Appearance = { day: Day; icon: Visual; photoId?: string }
export type ScheduleVersion = {effectiveFrom:Day;weekdays:number[];title:string;notes:string;minutes:number|null;edited?:boolean}
export type Task = {scheduleVersions?:ScheduleVersion[]; kind?: 'today' | 'habit'; icon?: Visual; photoId?: string; id: string; title: string; notes: string; minutes: number | null; weekdays: number[]; created: Day; through?: Day; archived: boolean }
export type Event = { sequence?: number; id: string; action: Action; at: string; day: Day; order: number; target?: string }
export type Card = { icon?: Visual; photoId?: string; appearances?: Appearance[]; id: string; taskId: string; title: string; notes: string; minutes: number | null; habit: boolean; day: Day; initialOrder: number; events: Event[] }
export type Deck = { version: 1; tasks: Task[]; cards: Card[] }
export const visualNames: Record<Visual, string> = { neutral: 'Simple card', walk: 'Walking', read: 'Reading', water: 'Water', focus: 'Focus', stretch: 'Stretch' }
export const isHabit = (task: Task) => task.kind === 'habit' || (task.kind === undefined && task.weekdays.length > 0)
export function appearance(card: Card, day = dayKey()): { icon: Visual; photoId?: string } {
  const snapshot = card.appearances?.filter(a => a.day <= day).at(-1)
  return snapshot ? {icon:snapshot.icon, photoId:snapshot.photoId} : {icon:card.icon ?? 'neutral', photoId:card.photoId}
}
// Only the original starter title + notes pairs receive starter illustrations on migration.
// Other existing tasks receive a neutral icon; IDs, schedules, snapshots and events never change.
function inferredIcon(value: {title: string; notes: string}): Visual {
  if (value.title === 'Walk for 20 minutes' && value.notes === 'A little movement. A better day.') return 'walk'
  if (value.title === 'Read 10 pages' && value.notes === 'A few pages, a new perspective.') return 'read'
  if (value.title === 'Drink a glass of water' && value.notes === 'Pause. Take a sip. Begin again.') return 'water'
  return 'neutral'
}
export function migrate(deck: Deck): Deck {
  for (const task of deck.tasks) { task.kind ??= task.weekdays.length ? 'habit' : 'today'; task.icon ??= inferredIcon(task) }
  for (const card of deck.cards) card.icon ??= inferredIcon(card)
  return deck
}
export const STORAGE_KEY = `daily-deck.web.v1${storageSuffix}`
export const uid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
export const dayKey = (date = new Date()): Day => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export function dateOf(day: Day) { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12) }
export function addDays(day: Day, count: number) { const d = dateOf(day); d.setDate(d.getDate() + count); return dayKey(d) }
export const prettyDay = (day: Day, options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }) => dateOf(day).toLocaleDateString('en-US', options)
export const active = (card: Card, through = '9999-12-31') => {
  const events = card.events.filter(e => e.day <= through)
  const undone = new Set(events.filter(e => e.action === 'undo').map(e => e.target))
  return events.filter(e => e.action !== 'undo' && !undone.has(e.id))
}
export function outcome(card: Card, day: Day, today = dayKey()): Outcome {
  const last = active(card, day).filter(e => e.action !== 'reorder').at(-1)
  return last?.action === 'done' ? 'completed' : last?.action === 'later' ? 'postponed' : last?.action === 'skip' ? 'skipped' : last?.action === 'delete' ? 'deleted' : day < today ? 'missed' : 'pending'
}
export const terminal = (card: Card) => ['completed', 'skipped', 'deleted'].includes(outcome(card, '9999-12-31'))
export const order = (card: Card) => active(card).at(-1)?.order ?? card.initialOrder
export const pending = (deck: Deck, day = dayKey()) => deck.cards.filter(c => !terminal(c) && (c.habit ? c.day === day : c.day <= day)).sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id))
export function history(deck: Deck, day: Day, today = dayKey(), taskId = '') {
  return deck.cards.filter(c => (!taskId || c.taskId === taskId) && (c.day === day || c.events.some(e => e.day === day) || (!c.habit && c.day < day && !['completed', 'skipped', 'deleted'].includes(outcome(c, addDays(day, -1), today)))))
}
function sameSchedule(a:Pick<Task,'title'|'notes'|'minutes'|'weekdays'>,b:Pick<Task,'title'|'notes'|'minutes'|'weekdays'>){return a.title===b.title&&a.notes===b.notes&&a.minutes===b.minutes&&a.weekdays.slice().sort().join(',')===b.weekdays.slice().sort().join(',')}
function scheduleVersion(task:Task,effectiveFrom:Day,edited=false):ScheduleVersion {return{effectiveFrom,weekdays:[...task.weekdays],title:task.title,notes:task.notes,minutes:task.minutes,edited}}
export function scheduleOn(task:Task,day:Day):ScheduleVersion|undefined {return task.scheduleVersions?.filter(v=>v.effectiveFrom<=day).at(-1)}
export function editEffectiveFrom(task:Task,today=dayKey()):Day {return addDays(task.through&&task.through>today?task.through:today,1)}
export function pendingScheduleChange(task:Task,today=dayKey()){return task.scheduleVersions?.findLast(v=>v.edited&&v.effectiveFrom>today)?.effectiveFrom}
export function roll(deck: Deck, today = dayKey()) {
  const pairs=new Set(deck.cards.map(c=>JSON.stringify([c.taskId,c.day])))
  let nextOrder=Math.max(0,...deck.cards.map(order))
  for (const task of deck.tasks.filter(t => !t.archived)) {
    // Legacy decisions through this cursor remain authoritative. Do not invent old schedules.
    if(isHabit(task)){
      const from=task.through?addDays(task.through,1):task.created
      if(!task.scheduleVersions)task.scheduleVersions=[scheduleVersion(task,from)]
      else if(!sameSchedule(task,task.scheduleVersions.at(-1)!)){
        // An older app may preserve the new metadata but edit only the legacy fields.
        // Its saved cursor freezes the past; its latest definition applies after that boundary.
        task.scheduleVersions=[...task.scheduleVersions.filter(v=>v.effectiveFrom<from),scheduleVersion(task,from,true)]
      }
    }
    const ensure=(day:Day)=>{
      if(day<task.created||pairs.has(JSON.stringify([task.id,day])))return
      const version=isHabit(task)?scheduleOn(task,day):undefined
      const scheduled=isHabit(task)?!!version?.weekdays.includes(dateOf(day).getDay()):day===task.created
      if(!scheduled)return
      deck.cards.push({id:uid(),taskId:task.id,title:version?.title??task.title,notes:version?.notes??task.notes,minutes:version?version.minutes:task.minutes,icon:task.icon??'neutral',photoId:task.photoId,habit:isHabit(task),day,initialOrder:++nextOrder,events:[]})
      pairs.add(JSON.stringify([task.id,day]))
    }
    let day=task.through?addDays(task.through,1):task.created
    while(day<=today){ensure(day);day=addDays(day,1)}
    // A cursor is an optimization, not proof that a known scheduled occurrence exists.
    // Existing completed/skipped occurrences satisfy the pair check and are never regenerated.
    ensure(today)
    task.through=!task.through||task.through<today?today:task.through
  }
}
export function saveTask(deck: Deck, task: Task, today = dayKey()) {
  if (!task.title.trim() || (task.minutes !== null && (!Number.isInteger(task.minutes) || task.minutes < 1 || task.minutes > 1440))) throw new Error('Add a title and an estimate from 1 to 1440 minutes.')
  if (isHabit(task) && !task.weekdays.length) throw new Error('Choose at least one weekday for a recurring habit.')
  if (task.weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6)) throw new Error('Choose valid weekdays.')
  task = { ...task, kind: isHabit(task) ? 'habit' : 'today', weekdays: isHabit(task) ? [...new Set(task.weekdays)] : [], icon: task.icon ?? 'neutral' }
  roll(deck, today)
  const existing = deck.tasks.find(t => t.id === task.id)
  if (existing) {
    if (isHabit(existing) !== isHabit(task)) throw new Error('Create a new task to change its type; existing history is preserved.')
    const through = existing.through
    const versions=existing.scheduleVersions
    const changed=isHabit(existing)&&(existing.title!==task.title.trim()||existing.notes!==task.notes||existing.minutes!==task.minutes||existing.weekdays.slice().sort().join(',')!==task.weekdays.slice().sort().join(','))
    const effective=editEffectiveFrom(existing,today)
    Object.assign(existing, task, { through, scheduleVersions:versions, title: task.title.trim() })
    if(changed)existing.scheduleVersions=[...(versions??[]).filter(v=>v.effectiveFrom!==effective),scheduleVersion(existing,effective,true)].sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom))
    if (!isHabit(task)) deck.cards.filter(c => c.taskId === task.id && !terminal(c)).forEach(c => Object.assign(c, { title: task.title.trim(), notes: task.notes, minutes: task.minutes }))
    for (const card of pending(deck, today).filter(c => c.taskId === task.id)) {
      const before = appearance(card, today)
      if (before.icon !== task.icon || before.photoId !== task.photoId) {
        card.appearances = [...(card.appearances ?? []).filter(a => a.day !== today), {day: today, icon: task.icon!, photoId: task.photoId}]
      }
    }
  } else {const fresh={...task,created:today,through:undefined,title:task.title.trim(),scheduleVersions:undefined as ScheduleVersion[]|undefined};if(isHabit(fresh))fresh.scheduleVersions=[scheduleVersion(fresh,today)];deck.tasks.push(fresh)}
  roll(deck, today)
}
function nextSequence(deck:Deck){return Math.max(0,...deck.cards.flatMap(c=>c.events.map(e=>e.sequence??0)))+1}
export function act(deck: Deck, id: string, action: 'done' | 'later' | 'skip', now = new Date()) {
  const day = dayKey(now); roll(deck, day)
  const card = pending(deck, day).find(c => c.id === id)
  if (!card) return
  card.events.push({ id: uid(), sequence: nextSequence(deck), action, day, at: now.toISOString(), order: action === 'later' ? Math.max(0, ...deck.cards.map(order)) + 1 : order(card) })
}
export function undoToken(deck: Deck, day = dayKey()) {
  return deck.cards.filter(c=>!c.habit||!deck.tasks.some(t=>t.id===c.taskId&&t.archived)).flatMap(c => c.events.slice(-1)).filter(e => e.day === day && ['done', 'later', 'skip'].includes(e.action)).sort((a, b) => (b.sequence??0)-(a.sequence??0) || b.at.localeCompare(a.at))[0]?.id
}
export function undo(deck: Deck, token: string, now = new Date()) {
  const card = deck.cards.find(c => c.events.at(-1)?.id === token)
  const last = card?.events.at(-1)
  if (!card || (card.habit&&deck.tasks.some(t=>t.id===card.taskId&&t.archived)) || !last || last.day !== dayKey(now) || !['done', 'later', 'skip'].includes(last.action)) return false
  card.events.push({ id: uid(), sequence: nextSequence(deck), action: 'undo', target: token, at: now.toISOString(), day: dayKey(now), order: last.order }); return true
}
export function removeTask(deck: Deck, id: string, now = new Date()) {
  roll(deck, dayKey(now))
  const task = deck.tasks.find(t => t.id === id)
  if (!task) return
  task.archived = true
  deck.cards.filter(c => c.taskId === id && !terminal(c) && (!isHabit(task) || c.day >= dayKey(now))).forEach(c => c.events.push({ id: uid(), sequence: nextSequence(deck), action: 'delete', at: now.toISOString(), day: c.habit && c.day > dayKey(now) ? c.day : dayKey(now), order: order(c) }))
}
export function reorder(deck: Deck, ids: string[], now = new Date()) {
  roll(deck, dayKey(now))
  const cards = pending(deck, dayKey(now))
  if (ids.length !== cards.length || new Set(ids).size !== cards.length || ids.some(id => !cards.some(c => c.id === id))) return false
  ids.forEach((id, i) => cards.find(c => c.id === id)!.events.push({ id: uid(), sequence: nextSequence(deck), action: 'reorder', at: now.toISOString(), day: dayKey(now), order: i })); return true
}
export function seed(today = dayKey()): Deck {
  const deck: Deck = { version: 1, tasks: [], cards: [] }
  for (const [title, notes, minutes] of [['Walk for 20 minutes', 'A little movement. A better day.', 20], ['Read 10 pages', 'A few pages, a new perspective.', 15], ['Drink a glass of water', 'Pause. Take a sip. Begin again.', 2]] as const) {
    saveTask(deck, { id: uid(), title, notes, minutes, icon: inferredIcon({title, notes}), kind: 'habit', weekdays: [0, 1, 2, 3, 4, 5, 6], created: today, archived: false }, today)
  }
  return deck
}
export type Period = 'day' | 'week' | 'month'
export function periodDays(day: Day, period: Period): Day[] {
  let start = day; let end = addDays(day, 1)
  if (period === 'week') { start = addDays(day, -((dateOf(day).getDay() + 6) % 7)); end = addDays(start, 7) }
  if (period === 'month') { const d = dateOf(day); start = dayKey(new Date(d.getFullYear(), d.getMonth(), 1, 12)); end = dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12)) }
  const result = []; while (start < end) { result.push(start); start = addDays(start, 1) } return result
}
export function summarize(deck: Deck, day: Day, period: Period = 'day', today = dayKey(), filter = '') {
  const counts: Record<Outcome, number> = { completed: 0, postponed: 0, skipped: 0, missed: 0, pending: 0, deleted: 0 }
  for (const d of periodDays(day, period).filter(d => d <= today)) for (const card of history(deck, d, today, filter)) counts[outcome(card, d, today)]++
  return counts
}
export const summaryText = (counts: ReturnType<typeof summarize>) => Object.entries(counts).filter(([, n]) => n).map(([key, n]) => `${n} ${key}`).join(', ') || 'No cards scheduled.'
// Validate saved data before accepting it. Errors never replace the stored file with starter data.
export function decode(raw: string): Deck {
  const d = JSON.parse(raw) as Deck
  const string = (v: unknown) => typeof v === 'string'
  const validDay = (v: unknown) => string(v) && /^\d{4}-\d{2}-\d{2}$/.test(v as string) && dayKey(dateOf(v as string)) === v
  if (d.version !== 1 || !Array.isArray(d.tasks) || !Array.isArray(d.cards) ||
    !d.tasks.every(t => string(t.id) && string(t.title) && string(t.notes) && validDay(t.created) && (t.through === undefined || validDay(t.through)) && typeof t.archived === 'boolean' && Array.isArray(t.weekdays) && t.weekdays.every(n => Number.isInteger(n) && n >= 0 && n <= 6) && (t.minutes === null || Number.isInteger(t.minutes))) ||
    !d.cards.every(c => string(c.id) && string(c.taskId) && string(c.title) && string(c.notes) && typeof c.habit === 'boolean' && validDay(c.day) && Number.isFinite(c.initialOrder) && Array.isArray(c.events) && c.events.every(e => string(e.id) && ['done', 'later', 'skip', 'delete', 'undo', 'reorder'].includes(e.action) && validDay(e.day) && !Number.isNaN(Date.parse(e.at)) && Number.isFinite(e.order)))) throw new Error('Saved deck is unreadable or uses an unsupported version. Your stored data has not been changed.')
  const validVisual = (v: unknown) => v === undefined || (typeof v === 'string' && Object.hasOwn(visualNames, v))
  const validPhoto = (v: unknown) => v === undefined || (typeof v === 'string' && v.length > 0 && v.length < 200)
  if (!d.tasks.every(t => (t.kind === undefined || t.kind === 'today' || t.kind === 'habit') && validVisual(t.icon) && validPhoto(t.photoId)) ||
      !d.cards.every(c => validVisual(c.icon) && validPhoto(c.photoId) && (c.appearances === undefined || (Array.isArray(c.appearances) && c.appearances.every(a => validDay(a.day) && validVisual(a.icon) && validPhoto(a.photoId)))))) throw new Error('Saved image metadata is unreadable. Your stored data has not been changed.')
  if(!d.tasks.every(t=>t.scheduleVersions===undefined||(isHabit(t)&&Array.isArray(t.scheduleVersions)&&t.scheduleVersions.length>0&&t.scheduleVersions.every((v,i)=>validDay(v.effectiveFrom)&&(i===0||t.scheduleVersions![i-1].effectiveFrom<v.effectiveFrom)&&string(v.title)&&string(v.notes)&&(v.minutes===null||(Number.isInteger(v.minutes)&&v.minutes>=1&&v.minutes<=1440))&&Array.isArray(v.weekdays)&&v.weekdays.length>0&&new Set(v.weekdays).size===v.weekdays.length&&v.weekdays.every(n=>Number.isInteger(n)&&n>=0&&n<=6)&&(v.edited===undefined||typeof v.edited==='boolean')))))throw new Error('Saved schedule history is unreadable. Your stored data has not been changed.')
  return migrate(d)
}
export function load(storage: Pick<Storage, 'getItem'>, today = dayKey()): Deck { const raw = storage.getItem(STORAGE_KEY); const deck = raw === null ? seed(today) : decode(raw); roll(deck, today); return deck }
export function persist(storage: Pick<Storage, 'setItem'>, deck: Deck) { storage.setItem(STORAGE_KEY, JSON.stringify(deck)) }
