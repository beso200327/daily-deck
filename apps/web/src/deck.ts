export type Day = string
export type Action = 'done' | 'later' | 'skip' | 'delete' | 'undo' | 'reorder'
export type Outcome = 'completed' | 'postponed' | 'skipped' | 'missed' | 'pending' | 'deleted'
export type Task = { id: string; title: string; notes: string; minutes: number | null; weekdays: number[]; created: Day; through?: Day; archived: boolean }
export type Event = { id: string; action: Action; at: string; day: Day; order: number; target?: string }
export type Card = { id: string; taskId: string; title: string; notes: string; minutes: number | null; habit: boolean; day: Day; initialOrder: number; events: Event[] }
export type Deck = { version: 1; tasks: Task[]; cards: Card[] }
export const STORAGE_KEY = 'daily-deck.web.v1'
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
export function roll(deck: Deck, today = dayKey()) {
  for (const task of deck.tasks.filter(t => !t.archived)) {
    let day = task.through ? addDays(task.through, 1) : task.created
    while (day <= today) {
      const scheduled = task.weekdays.length ? task.weekdays.includes(dateOf(day).getDay()) : day === task.created
      if (scheduled && !deck.cards.some(c => c.taskId === task.id && c.day === day)) {
        deck.cards.push({ id: uid(), taskId: task.id, title: task.title, notes: task.notes, minutes: task.minutes, habit: !!task.weekdays.length, day, initialOrder: Math.max(0, ...deck.cards.map(order)) + 1, events: [] })
      }
      day = addDays(day, 1)
    }
    task.through = !task.through || task.through < today ? today : task.through
  }
}
export function saveTask(deck: Deck, task: Task, today = dayKey()) {
  if (!task.title.trim() || (task.minutes !== null && (!Number.isInteger(task.minutes) || task.minutes < 1 || task.minutes > 1440))) throw new Error('Add a title and an estimate from 1 to 1440 minutes.')
  roll(deck, today)
  const existing = deck.tasks.find(t => t.id === task.id)
  if (existing) {
    const through = existing.through
    Object.assign(existing, task, { through, title: task.title.trim() })
    if (!task.weekdays.length) deck.cards.filter(c => c.taskId === task.id && !terminal(c)).forEach(c => Object.assign(c, { title: task.title.trim(), notes: task.notes, minutes: task.minutes }))
  } else deck.tasks.push({ ...task, title: task.title.trim() })
  roll(deck, today)
}
export function act(deck: Deck, id: string, action: 'done' | 'later' | 'skip', now = new Date()) {
  const day = dayKey(now); roll(deck, day)
  const card = pending(deck, day).find(c => c.id === id)
  if (!card) return
  card.events.push({ id: uid(), action, day, at: now.toISOString(), order: action === 'later' ? Math.max(0, ...deck.cards.map(order)) + 1 : order(card) })
}
export function undoToken(deck: Deck, day = dayKey()) {
  return deck.cards.flatMap(c => c.events.slice(-1)).filter(e => e.day === day && ['done', 'later', 'skip'].includes(e.action)).sort((a, b) => b.at.localeCompare(a.at))[0]?.id
}
export function undo(deck: Deck, token: string, now = new Date()) {
  const card = deck.cards.find(c => c.events.at(-1)?.id === token)
  const last = card?.events.at(-1)
  if (!card || !last || last.day !== dayKey(now) || !['done', 'later', 'skip'].includes(last.action)) return false
  card.events.push({ id: uid(), action: 'undo', target: token, at: now.toISOString(), day: dayKey(now), order: last.order }); return true
}
export function removeTask(deck: Deck, id: string, now = new Date()) {
  roll(deck, dayKey(now))
  const task = deck.tasks.find(t => t.id === id)
  if (!task) return
  task.archived = true
  if (!task.weekdays.length) deck.cards.filter(c => c.taskId === id && !terminal(c)).forEach(c => c.events.push({ id: uid(), action: 'delete', at: now.toISOString(), day: dayKey(now), order: order(c) }))
}
export function reorder(deck: Deck, ids: string[], now = new Date()) {
  roll(deck, dayKey(now))
  const cards = pending(deck, dayKey(now))
  if (ids.length !== cards.length || new Set(ids).size !== cards.length || ids.some(id => !cards.some(c => c.id === id))) return false
  ids.forEach((id, i) => cards.find(c => c.id === id)!.events.push({ id: uid(), action: 'reorder', at: now.toISOString(), day: dayKey(now), order: i })); return true
}
export function seed(today = dayKey()): Deck {
  const deck: Deck = { version: 1, tasks: [], cards: [] }
  for (const [title, notes, minutes] of [['Walk for 20 minutes', 'A little movement. A better day.', 20], ['Read 10 pages', 'A few pages, a new perspective.', 15], ['Drink a glass of water', 'Pause. Take a sip. Begin again.', 2]] as const) {
    saveTask(deck, { id: uid(), title, notes, minutes, weekdays: [0, 1, 2, 3, 4, 5, 6], created: today, archived: false }, today)
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
  return d
}
export function load(storage: Pick<Storage, 'getItem'>, today = dayKey()): Deck { const raw = storage.getItem(STORAGE_KEY); const deck = raw === null ? seed(today) : decode(raw); roll(deck, today); return deck }
export function persist(storage: Pick<Storage, 'setItem'>, deck: Deck) { storage.setItem(STORAGE_KEY, JSON.stringify(deck)) }
