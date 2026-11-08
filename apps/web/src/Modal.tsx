import {useEffect,useRef,useId,type ReactNode} from 'react'
import {X} from 'lucide-react'
let locks=0
let restoreScroll=()=>{}
function lockBackground(){
 if(locks++===0){const y=window.scrollY,body=document.body,root=document.documentElement
  const old={position:body.style.position,top:body.style.top,left:body.style.left,right:body.style.right,overflow:root.style.overflow,width:body.style.width,modal:root.dataset.modalOpen}
  root.dataset.modalOpen='true';body.style.width='100%';body.style.position='fixed';body.style.top=`-${y}px`;body.style.left='0';body.style.right='0';root.style.overflow='hidden'
  restoreScroll=()=>{Object.assign(body.style,{position:old.position,top:old.top,left:old.left,right:old.right,width:old.width});root.style.overflow=old.overflow;if(old.modal===undefined)delete root.dataset.modalOpen;else root.dataset.modalOpen=old.modal;window.scrollTo({top:y,left:0,behavior:'instant'})}
 }
 return()=>{if(--locks===0)restoreScroll()}
}
export function Modal({title,close,children,initialFocus='auto',restoreFocus=true,footer}:{title:string;close:()=>void;children:ReactNode;footer?:ReactNode;initialFocus?:'auto'|'heading';restoreFocus?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId()
 useEffect(()=>{
  const dialog=ref.current!,previous=document.activeElement as HTMLElement|null,unlock=lockBackground()
  const content=dialog.querySelector<HTMLElement>('.modal-content')!
  let frame=0
  function fit(){
   const vv=window.visualViewport,zoomed=(vv?.scale??1)>1.05
   // Keyboard shrinks the visual viewport. Pinch zoom must magnify the existing
   // layout instead of moving/shrinking the entire dialog along with each pan.
   const w=zoomed?document.documentElement.clientWidth:Math.min(vv?.width??innerWidth,document.documentElement.clientWidth),h=zoomed?innerHeight:vv?.height??innerHeight,left=0,top=zoomed?0:vv?.offsetTop??0
   const css=getComputedStyle(dialog),safeTop=Math.max(10,parseFloat(css.getPropertyValue('--safe-top'))||0),safeBottom=Math.max(10,parseFloat(css.getPropertyValue('--safe-bottom'))||0)
   const width=Math.min(490,Math.max(0,w-20))
   Object.assign(dialog.style,{left:`${left+(w-width)/2}px`,top:`${top+safeTop}px`,width:`${width}px`,maxHeight:`${Math.max(100,h-safeTop-safeBottom)}px`})
   const open=[...document.querySelectorAll('dialog[open]')]
   if(open.at(-1)!==dialog)return
   const active=document.activeElement as HTMLElement|null
   if(active&&content.contains(active)&&active.matches('input:not([type=file]),textarea,select')){
    const a=active.getBoundingClientRect(),r=content.getBoundingClientRect(),footer=content.querySelector<HTMLElement>('.form-actions,.crop-actions')
    const bottom=r.bottom-Math.min(footer?.offsetHeight??0,r.height/3)-12
    if(a.bottom>bottom)content.scrollTop+=a.bottom-bottom
    else if(a.top<r.top+8)content.scrollTop-=r.top+8-a.top
   }
   if(!zoomed)content.scrollLeft=0
  }
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(fit)}
  dialog.showModal();fit()
  const heading=dialog.querySelector<HTMLElement>('h2')!
  const focus=initialFocus==='heading'||navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches?heading:dialog.querySelector<HTMLElement>('input:not([type=file]),textarea,select')??heading
  focus.focus({preventScroll:true});schedule()
  visualViewport?.addEventListener('resize',schedule);visualViewport?.addEventListener('scroll',schedule);window.addEventListener('resize',schedule);dialog.addEventListener('focusin',schedule)
  return()=>{cancelAnimationFrame(frame);visualViewport?.removeEventListener('resize',schedule);visualViewport?.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);dialog.removeEventListener('focusin',schedule);dialog.close();unlock();if(restoreFocus)previous?.focus({preventScroll:true});else [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1)?.querySelector<HTMLElement>('h2')?.focus({preventScroll:true})}
 },[])
 return <dialog ref={ref} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();close()}} className={`modal${footer ? ' has-footer' : ''}`}><div className="modal-top"><h2 id={titleId} tabIndex={-1}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={21} aria-hidden="true"/></button></div><div className="modal-content">{children}</div>{footer&&<div className="modal-footer">{footer}</div>}</dialog>
}
