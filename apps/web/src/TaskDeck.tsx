import { useRef, useState } from 'react'
import { Pencil, Clock3 } from 'lucide-react'
import { appearance, type Card } from './deck'
import { TaskVisual } from './visuals'
export type Exit = { id: string; action: 'done' | 'later' | 'skip'; single: boolean }
export function TaskDeck({cards, onAction, onEdit, busy, exit}: {cards: Card[]; onAction: (action: 'done' | 'later') => void; onEdit: () => void; busy: boolean; exit: Exit | null}) {
  const [drag, setDrag] = useState({id:'', x:0})
  const [dragging, setDragging] = useState(false)
  const pointer = useRef<{id: number; card: string; x: number; y: number} | null>(null)
  const top = cards[0]
  const x = drag.id === top?.id ? drag.x : 0
  const reveal = Math.min(1, Math.abs(x) / 240)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  return <div className="card-stack real-stack" data-testid="card-stack">
    {cards.slice(0,3).map((card,depth) => {
      const front = depth === 0
      const leaving = exit?.id === card.id
      const dx = leaving && !reduced ? (exit.single && exit.action === 'later' ? -24 : (exit.action === 'done' ? 1 : -1) * 650) : front ? x : 12 * depth * (1 - reveal)
      const rotation = reduced ? 0 : front ? dx / 38 : depth * 2 * (1-reveal)
      const visual = appearance(card)
      return <article key={card.id} data-card-id={card.id} data-testid={front ? 'active-card' : 'next-card'} aria-hidden={!front} inert={!front} className={`focus-card stacked-layer ${front ? 'front' : 'behind'} ${dragging && front ? 'dragging' : ''}`}
        style={{zIndex:4-depth, transform:`translate(${dx}px, ${front ? 0 : 12 * depth * (1-reveal)}px) scale(${front ? 1 : 1-.025*depth*(1-reveal)}) rotate(${rotation}deg)`, opacity:leaving && !(exit.single && exit.action === 'later') && !reduced ? 0 : 1}}
        onPointerDown={e => {
          if (!front || busy || !e.isPrimary || e.button !== 0 || (e.target as Element).closest('button')) return
          pointer.current = {id:e.pointerId,card:card.id,x:e.clientX,y:e.clientY}; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={e => {const p=pointer.current; if (!p || p.id!==e.pointerId || p.card!==card.id || busy) return; const dx=e.clientX-p.x,dy=e.clientY-p.y; if (Math.abs(dx)>Math.abs(dy)) setDrag({id:card.id,x:Math.max(-320,Math.min(320,dx))})}}
        onPointerUp={e => {const p=pointer.current; pointer.current=null; setDragging(false); if (p && p.id===e.pointerId && p.card===card.id && !busy) {const dx=e.clientX-p.x,dy=e.clientY-p.y; if (Math.abs(dx)>85 && Math.abs(dx)>Math.abs(dy)) onAction(dx>0?'done':'later')} setDrag({id:'',x:0})}}
        onPointerCancel={() => {pointer.current=null;setDragging(false);setDrag({id:'',x:0})}}
        onLostPointerCapture={() => {pointer.current=null;setDragging(false)}}
        aria-label={`${front ? 'Current' : 'Next'} task: ${card.title}`}>
        <div className="card-top"><span className="pill">{card.habit ? 'RECURRING HABIT' : 'TODAY ONLY'}</span>{front && <button className="icon-button" disabled={busy} aria-label="Edit current task" onClick={onEdit}><Pencil size={17}/></button>}</div>
        <TaskVisual {...visual}/><div className="card-copy"><h2>{card.title}</h2><p>{card.notes || 'A little focus. A little forward.'}</p>{card.minutes && <span className="duration"><Clock3 size={15}/>{card.minutes} min</span>}</div>
        {front && Math.abs(x)>45 && !leaving && <span className={`swipe-label ${x>0?'right':'left'}`}>{x>0?'Done':'Later'}</span>}
      </article>
    })}
  </div>
}
