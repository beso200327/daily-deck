import {useEffect,useRef,type ReactNode} from 'react'
import {MoreHorizontal} from 'lucide-react'
export function TodayMenu({children,changed}:{children:ReactNode;changed:(open:boolean)=>void}){
 const ref=useRef<HTMLDetailsElement>(null)
 useEffect(()=>{const close=(e:PointerEvent)=>{if(ref.current?.open&&!ref.current.contains(e.target as Node))ref.current.open=false};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[])
 return <details className="today-menu mobile-only" ref={ref} onToggle={e=>changed(e.currentTarget.open)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus()}}}><summary role="button" aria-expanded={ref.current?.open??false} aria-label="More actions"><MoreHorizontal size={24}/></summary><div className="today-menu-items" onClick={e=>{if((e.target as Element).closest('button')&&ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus({preventScroll:true})}}}>{children}</div></details>
}
