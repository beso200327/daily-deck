import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {DeadlineLabel} from './DeadlineLabel'
import {Pencil} from 'lucide-react'
import type {Card} from './deck'
import type {Exit} from './TaskDeck'
import {LATER_RETURN_MS,QUEUE_SETTLE_MS,REDUCED_PHASE_MS} from './motion'
// Reading order settles after motion. Stable occurrence nodes travel above the unchanged scroll container.
export function DeckQueue({cards,edit,disabled,exit,revealId}:{revealId?:string|null;cards:Card[];edit:(id:string)=>void;disabled:boolean;exit:Exit|null}){
 const [rows,setRows]=useState(cards),[settled,setSettled]=useState(true),[settling,setSettling]=useState(false)
 const [metrics,setMetrics]=useState({height:60,gap:8})
 const port=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),wasMoving=useRef(false)
 const signature=cards.map(c=>c.id).join('|'),latest=useRef(cards);latest.current=cards
 const moving=exit?.action==='later'?exit:null,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches
 const returnDuration=reduced?REDUCED_PHASE_MS:LATER_RETURN_MS,settleDuration=reduced?50:QUEUE_SETTLE_MS,travelDuration=returnDuration-settleDuration
 useLayoutEffect(()=>{
  clearTimeout(timer.current)
  setRows(old=>[...old,...cards.filter(c=>!old.some(r=>r.id===c.id))])
  if(moving){wasMoving.current=true;setSettled(false);return}
  if(wasMoving.current){wasMoving.current=false;setRows(cards);setSettled(true);return}
  setSettled(false);timer.current=setTimeout(()=>{setRows(latest.current);setSettled(true)},reduced?60:300)
  return()=>clearTimeout(timer.current)
 },[signature,moving?.id])
 useLayoutEffect(()=>{setSettling(false);if(moving?.phase!=='return')return;const t=setTimeout(()=>setSettling(true),travelDuration);return()=>clearTimeout(t)},[moving?.id,moving?.phase,travelDuration])
 useLayoutEffect(()=>{
  const el=port.current,first=el?.querySelector<HTMLElement>('.queue-card');if(!el||!first)return
  const measure=()=>{const height=first.offsetHeight,gap=parseFloat(getComputedStyle(el).getPropertyValue('--queue-gap'))||8;if(height)setMetrics(old=>old.height===height&&old.gap===gap?old:{height,gap})}
  measure();const observer=new ResizeObserver(measure);observer.observe(first);observer.observe(el);return()=>observer.disconnect()
 },[rows.length])
 useLayoutEffect(()=>{if(revealId&&cards[0]?.id===revealId)port.current?.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'})},[revealId])
 useEffect(()=>()=>clearTimeout(timer.current),[])
 const step=metrics.height+metrics.gap,contentHeight=Math.max(0,cards.length*step-metrics.gap),extent=Math.max(0,rows.length*step-metrics.gap)
 return <section className="up-next" aria-label="In your deck"><div className="section-label"><span id="queue-title">IN YOUR DECK</span><span className="small-count" data-testid="queue-count">{cards.length}</span></div>{rows.length>0?<div ref={port} className="queue-scroll" role="region" aria-labelledby="queue-title" tabIndex={0} data-testid="queue-scroll" style={{'--queue-content':`${contentHeight}px`,'--queue-measured-height':`${metrics.height}px`} as React.CSSProperties} onKeyDown={e=>{if(e.target!==e.currentTarget)return;const p=e.currentTarget,delta=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:e.key==='PageDown'?p.clientHeight:e.key==='PageUp'?-p.clientHeight:null;if(delta!==null){e.preventDefault();p.scrollTop+=delta}else if(e.key==='Home'||e.key==='End'){e.preventDefault();p.scrollTop=e.key==='Home'?0:p.scrollHeight}}}><ol className="queue-list" style={{height:Math.max(contentHeight,settled?0:extent)}}>{rows.map((old,oldIndex)=>{
  const at=cards.findIndex(c=>c.id===old.id),card=at>=0?cards[at]:old,leaving=at<0,postponing=moving?.id===card.id
  const stage=postponing?(moving.phase==='out'?'lift':settling?'settle':'travel'):'idle'
  const raised=postponing&&!settling&&!reduced,lift=raised&&moving.phase==='out'?-3:0
  const visualIndex=moving?.phase==='out'?oldIndex:Math.max(0,leaving?oldIndex:at)
  const duration=postponing?(stage==='lift'?125:stage==='settle'?settleDuration:travelDuration):moving?.phase==='return'?travelDuration:280
  return <li key={card.id} data-occurrence-id={card.id} data-queue-index={at} data-queue-stage={stage} aria-hidden={leaving} inert={leaving} className={`queue-card ${at===0?'is-current':''} ${leaving?'is-leaving':''} ${postponing?'is-postponing':''} ${raised?'is-raised':''}`} style={{transform:`translate(${leaving?18:0}px,${visualIndex*step+lift}px) scale(${raised?1.015:1})`,zIndex:postponing?30:1,transitionDuration:`${reduced?50:duration}ms`}}><span className={`queue-dot ${at===0?'active':''}`} aria-hidden="true"/><div className="queue-copy"><strong title={card.title}>{card.title}</strong><small>{card.habit?'Recurring habit':'One-time task'} <DeadlineLabel card={card}/>{at===0&&<span className="queue-current"> · Up next</span>}</small></div><button type="button" className="queue-edit" aria-label={`Edit ${card.title}`} disabled={disabled||leaving} onClick={()=>edit(card.taskId)}><Pencil size={14} aria-hidden="true"/></button></li>
 })}</ol></div>:<p className="muted">A clear deck. A quieter mind.</p>}</section>
}
