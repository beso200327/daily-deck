import {useEffect,useLayoutEffect,useRef} from 'react'
import {Check,X} from 'lucide-react'
export type ToastMessage={id:string;message:string;undoId?:string}
export function Toast({toast,dismiss,undo,disabled}:{toast:ToastMessage;dismiss:(id:string)=>void;undo:(id:string)=>void;disabled:boolean}){
 const node=useRef<HTMLDivElement>(null),callback=useRef(dismiss)
 const remaining=useRef(toast.undoId?6000:3000),deadline=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),reasons=useRef(new Set<string>())
 callback.current=dismiss
 function start(){clearTimeout(timer.current);deadline.current=performance.now()+remaining.current;timer.current=setTimeout(()=>callback.current(toast.id),remaining.current)}
 function pause(reason:string){if(!reasons.current.size){if(deadline.current)remaining.current=Math.max(0,deadline.current-performance.now());clearTimeout(timer.current)}reasons.current.add(reason)}
 function resume(reason:string){reasons.current.delete(reason);if(!reasons.current.size)start()}
 useEffect(()=>{if(!reasons.current.size)start();const hidden=()=>{if(document.visibilityState==='hidden')callback.current(toast.id)};document.addEventListener('visibilitychange',hidden);return()=>{clearTimeout(timer.current);document.removeEventListener('visibilitychange',hidden)}},[toast.id])
 useLayoutEffect(()=>{
  const el=node.current!
  const place=()=>{
   const vv=visualViewport,top=(vv?.offsetTop??0)+Math.max(12,parseFloat(getComputedStyle(el).getPropertyValue('--safe-top'))||0),height=vv?.height??innerHeight
   const nav=matchMedia('(max-width:700px)').matches?document.querySelector<HTMLElement>('.navigation')?.getBoundingClientRect():null
   const bounds=el.getBoundingClientRect(),bottom=nav?.top??((vv?.offsetTop??0)+height-12)
   const blocked=[...document.querySelectorAll<HTMLElement>('.deck-actions,.deck-options,.preview-actions,.form-actions,.add-task,.undo-button,.primary,.card-top button,.update-banner button,.manage-tasks')].map(target=>target.getBoundingClientRect()).filter(r=>r.width&&r.height&&r.right>bounds.left&&r.left<bounds.right)
   const candidates=[bottom-bounds.height-12,top,...blocked.flatMap(r=>[r.top-bounds.height-12,r.bottom+12])].filter(y=>y>=top&&y+bounds.height<=bottom-8).sort((a,b)=>b-a)
   const y=candidates.find(y=>blocked.every(r=>y>=r.bottom||y+bounds.height<=r.top))??top
   el.style.top=`${Math.max(top,y)}px`
  }
  place();const observer=new ResizeObserver(place);observer.observe(el);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);visualViewport?.addEventListener('resize',place);visualViewport?.addEventListener('scroll',place)
  return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);visualViewport?.removeEventListener('resize',place);visualViewport?.removeEventListener('scroll',place)}
 },[])
 return <div ref={node} className="toast transient-toast" role="group" aria-label="Notification" data-toast-id={toast.id} onPointerEnter={e=>{if(e.pointerType!=='touch')pause('hover')}} onPointerLeave={e=>{if(e.pointerType!=='touch')resume('hover')}} onFocusCapture={()=>pause('focus')} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))resume('focus')}}>
  <Check size={16} aria-hidden="true"/><span>{toast.message}</span>{toast.undoId&&<button className="toast-undo" disabled={disabled} onClick={()=>undo(toast.undoId!)}>Undo</button>}<button aria-label="Dismiss notification" onClick={()=>dismiss(toast.id)}><X size={16}/></button>
 </div>
}
