import {useEffect,useRef,useState} from 'react'
import {Pencil,Clock3} from 'lucide-react'
import {appearance,type Card} from './deck'
import {TaskVisual} from './visuals'
export type Exit={id:string;card:Card;action:'done'|'later'|'skip';single:boolean;phase:'out'|'return'}
export function TaskDeck({cards,onAction,onEdit,busy,exit,onExitComplete}:{cards:Card[];onAction:(action:'done'|'later')=>void;onEdit:()=>void;busy:boolean;exit:Exit|null;onExitComplete:(id:string,phase:Exit['phase'])=>void}){
 const [drag,setDrag]=useState({id:'',x:0}),[dragging,setDragging]=useState(false),[spring,setSpring]=useState(false)
 const retained=useRef<Card[]>([]),released=useRef(0)
 useEffect(()=>{if(!exit)released.current=0},[exit])
 const pointer=useRef<{id:number;card:string;x:number;y:number;time:number}|null>(null),stack=useRef<HTMLDivElement>(null)
 const top=cards[0],x=drag.id===top?.id?drag.x:0,reveal=exit?.phase==='out'?1:Math.min(1,Math.abs(x)/240),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
 useEffect(()=>{if(busy){pointer.current=null;setDragging(false)}},[busy])
 const desired=cards.slice(0,3)
 if(exit&&!desired.some(c=>c.id===exit.id))desired.push(cards.find(c=>c.id===exit.id)??exit.card)
 // Freeze DOM order through both phases. Reordering keyed nodes can cancel a CSS transition in Safari/Chromium.
 const visible=exit?[...retained.current.filter(c=>desired.some(d=>d.id===c.id)).map(c=>desired.find(d=>d.id===c.id)!),...desired.filter(c=>!retained.current.some(d=>d.id===c.id))]:desired
 retained.current=visible
 return <div ref={stack} className="card-stack real-stack" data-testid="card-stack">{visible.map((card)=>{
  const releasing=exit?.id===card.id,front=card.id===top?.id
  const logicalDepth=cards.findIndex(c=>c.id===card.id),depth=Math.min(Math.max(0,logicalDepth),2)
  const rect=stack.current?.getBoundingClientRect(),outRight=innerWidth-(rect?.left??0)+(rect?.width??400)+80,outLeft=-((rect?.right??400)+(rect?.width??400)+80)
  const dx=releasing&&exit.phase==='out'?(reduced?0:exit.action==='later'?Math.max(-Math.max(48,(rect?.right??400)-48),Math.min(-Math.min(210,(rect?.width??400)*.55),released.current-40)):exit.action==='done'?outRight:outLeft):front?x:12*depth*(1-reveal)
  const dy=front?0:12*depth*(1-reveal),rotation=reduced?0:releasing&&exit.phase==='out'?Math.sign(dx)*9:front?Math.max(-9,Math.min(9,dx/38)):depth*2*(1-reveal)
  const visual=appearance(card)
  return <article key={card.id} data-card-id={card.id} data-phase={releasing?exit.phase:dragging&&front?'drag':'idle'} data-testid={front?'active-card':'next-card'} aria-hidden={!front} inert={!front} className={`focus-card stacked-layer ${front?'front':'behind'} ${dragging&&front?'dragging':''} ${spring&&front&&!releasing?'springing':''} ${releasing?'releasing':''}`}
   style={{zIndex:releasing?(exit.phase==='out'?10:front?5:0):4-Math.max(0,logicalDepth),transform:`translate(${dx}px,${dy}px) scale(${front?1:1-.025*depth*(1-reveal)}) rotate(${rotation}deg)`,opacity:1,transitionDuration:reduced?'80ms':'320ms'}}
   onTransitionEnd={e=>{if(releasing&&e.target===e.currentTarget&&e.propertyName==='transform')onExitComplete(card.id,exit.phase)}}
   onPointerDown={e=>{if(!front||busy||document.querySelector('dialog[open]')||!e.isPrimary||e.button!==0||(e.target as Element).closest('button'))return;pointer.current={id:e.pointerId,card:card.id,x:e.clientX,y:e.clientY,time:performance.now()};setSpring(false);setDragging(true);e.currentTarget.setPointerCapture(e.pointerId)}}
   onPointerMove={e=>{const p=pointer.current;if(!p||p.id!==e.pointerId||p.card!==card.id||busy)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;if(Math.abs(dx)>Math.abs(dy))setDrag({id:card.id,x:Math.max(-Math.min(450,(stack.current?.getBoundingClientRect().right??400)-48),Math.min(450,dx))})}}
   onPointerUp={e=>{const p=pointer.current;pointer.current=null;setDragging(false);if(p&&p.id===e.pointerId&&p.card===card.id&&!busy){const dx=e.clientX-p.x,dy=e.clientY-p.y,speed=Math.abs(dx)/Math.max(1,performance.now()-p.time);if(Math.abs(dx)>Math.abs(dy)&&(Math.abs(dx)>85||(Math.abs(dx)>35&&speed>.65))){released.current=drag.id===card.id?drag.x:0;onAction(dx>0?'done':'later');}else setSpring(true)}setDrag({id:'',x:0})}}
   onPointerCancel={()=>{pointer.current=null;setDragging(false);setSpring(true);setDrag({id:'',x:0})}} onLostPointerCapture={()=>{pointer.current=null;setDragging(false)}} aria-label={`${front?'Current':'Next'} task: ${card.title}`}>
   <div className="card-top"><span className="pill">{card.habit?'RECURRING HABIT':'TODAY ONLY'}</span>{front&&<button type="button" className="icon-button" disabled={busy} aria-label="Edit current task" onClick={onEdit}><Pencil size={17}/></button>}</div><TaskVisual {...visual}/><div className="card-copy"><h2>{card.title}</h2><p>{card.notes||'A little focus. A little forward.'}</p>{card.minutes&&<span className="duration"><Clock3 size={15}/>{card.minutes} min</span>}</div>
   {front&&(Math.abs(x)>45||releasing)&&<span className={`swipe-label ${(releasing?exit.action==='done':x>0)?'right':'left'}`}>{releasing?(exit.action==='done'?'Done':exit.action==='skip'?'Skip':'Later'):x>0?'Done':'Later'}</span>}
  </article>
 })}</div>
}
