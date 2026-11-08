import * as D from './deck'
import { validateBackupDeck } from './backup'
export type Command =
  | { kind: 'save'; task: D.Task }
  | { kind: 'delete'; taskId: string }
  | { kind: 'action'; cardId: string; action: 'done' | 'later' | 'skip' }
  | { kind: 'undo'; eventId: string }
  | { kind: 'reorder'; ids: string[] }
export function taskInput(t: D.Task) {
  return {
    id: t.id,
    kind: D.isHabit(t) ? 'habit' : 'today',
    title: t.title,
    notes: t.notes,
    minutes: t.minutes,
    weekdays: t.weekdays,
    icon: t.icon ?? 'neutral',
    photoId: t.photoId,
    deadline: t.deadline,
    remind: !!t.deadline && !!t.remind
  }
}
/** Existing synchronous domain mutations express intent; the server independently
 * executes it. Never send a proposed full snapshot as a normal write. */
export function commandBetween(before: D.Deck, after: D.Deck): Command {
  if (
    before.tasks.some((t) => !after.tasks.some((n) => n.id === t.id)) ||
    before.cards.some((c) => !after.cards.some((n) => n.id === c.id))
  )
    throw new Error('Unsupported cloud mutation. No data was uploaded.')
  const added = after.tasks.filter(
    (t) => !before.tasks.some((n) => n.id === t.id)
  )
  const deleted = after.tasks.filter(
    (t) => t.archived && !before.tasks.find((n) => n.id === t.id)?.archived
  )
  const edited = after.tasks.filter((t) => {
    const old = before.tasks.find((n) => n.id === t.id)
    return (
      old && JSON.stringify(taskInput(old)) !== JSON.stringify(taskInput(t))
    )
  })
  if (added.length === 1 && !deleted.length && !edited.length)
    return { kind: 'save', task: added[0] }
  if (deleted.length === 1 && !added.length)
    return { kind: 'delete', taskId: deleted[0].id }
  if (edited.length === 1 && !added.length && !deleted.length)
    return { kind: 'save', task: edited[0] }
  const events = after.cards.flatMap((c) => {
    const old = before.cards.find((n) => n.id === c.id)
    if (
      old &&
      JSON.stringify(c.events.slice(0, old.events.length)) !==
        JSON.stringify(old.events)
    )
      throw new Error('Historical events cannot be rewritten.')
    return c.events
      .slice(old?.events.length ?? 0)
      .map((e) => ({ card: c.id, event: e }))
  })
  if (!added.length && !edited.length && !deleted.length) {
    if (events.length === 1) {
      const { card, event } = events[0]
      if (['done', 'later', 'skip'].includes(event.action))
        return {
          kind: 'action',
          cardId: card,
          action: event.action as 'done' | 'later' | 'skip'
        }
      if (event.action === 'undo' && event.target)
        return { kind: 'undo', eventId: event.target }
    }
    if (events.length && events.every((e) => e.event.action === 'reorder'))
      return {
        kind: 'reorder',
        ids: events
          .sort((a, b) => a.event.order - b.event.order)
          .map((e) => e.card)
      }
  }
  throw new Error(
    'This action changed or is unsupported in cloud mode. Refresh before trying again.'
  )
}
export const photoIds = (deck: D.Deck) => [
  ...new Set(
    [
      ...deck.tasks,
      ...deck.cards,
      ...deck.cards.flatMap((c) => c.appearances ?? [])
    ].flatMap((t) => (t.photoId ? [t.photoId] : []))
  )
]
/** SHA-256 name-derived UUIDv8, scoped to the account and entity type.
 * All IDs are mapped, including legacy non-UUIDs. No random import IDs per row. */
export async function mappedId(owner: string, kind: string, id: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify(['daily-deck-import-v1', owner, kind, id])
      )
    )
  )
  bytes[6] = (bytes[6] & 15) | 128
  bytes[8] = (bytes[8] & 63) | 128
  const h = Array.from(bytes.slice(0, 16), (n) =>
    n.toString(16).padStart(2, '0')
  ).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export async function mapImport(owner: string, raw: D.Deck) {
  const deck = validateBackupDeck(structuredClone(raw)),
    ids = {
      tasks: new Map<string, string>(),
      cards: new Map<string, string>(),
      events: new Map<string, string>(),
      photos: new Map<string, string>()
    }
  for (const [kind, values, map] of [
    ['item', deck.tasks.map((t) => t.id), ids.tasks],
    ['occurrence', deck.cards.map((c) => c.id), ids.cards],
    ['event', deck.cards.flatMap((c) => c.events.map((e) => e.id)), ids.events],
    ['photo', photoIds(deck), ids.photos]
  ] as const)
    for (const id of values) map.set(id, await mappedId(owner, kind, id))
  const events = deck.cards.flatMap((c) => c.events),
    seq = events.map((e) => e.sequence)
  const complete =
    seq.every((n) => Number.isSafeInteger(n) && n! > 0) &&
    new Set(seq).size === seq.length &&
    deck.cards.every((c) =>
      c.events.every((e, i) => !i || e.sequence! > c.events[i - 1].sequence!)
    )
  if (!complete) {
    // Deterministic k-way merge preserves order within every occurrence, even if
    // old clocks were wrong. Timestamps themselves are never changed.
    const queues = deck.cards.map((c) => ({ id: c.id, events: [...c.events] }))
    let n = 0
    while (queues.some((q) => q.events.length)) {
      queues.sort((a, b) =>
        !a.events.length
          ? 1
          : !b.events.length
            ? -1
            : Date.parse(a.events[0].at) - Date.parse(b.events[0].at) ||
              a.id.localeCompare(b.id)
      )
      queues[0].events.shift()!.sequence = ++n
    }
  }
  for (const t of deck.tasks) {
    t.id = ids.tasks.get(t.id)!
    if (t.photoId) t.photoId = ids.photos.get(t.photoId)!
  }
  for (const c of deck.cards) {
    c.id = ids.cards.get(c.id)!
    c.taskId = ids.tasks.get(c.taskId)!
    if (c.photoId) c.photoId = ids.photos.get(c.photoId)!
    for (const a of c.appearances ?? [])
      if (a.photoId) a.photoId = ids.photos.get(a.photoId)!
    for (const e of c.events) {
      e.id = ids.events.get(e.id)!
      if (e.target) e.target = ids.events.get(e.target)!
    }
  }
  return { deck, photos: ids.photos }
}
