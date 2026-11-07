import {useEffect,useState} from 'react'
// CSS dvh handles browser chrome; visualViewport additionally handles resized views and zoom.
// Enlarged text/zoom opts into natural page scrolling rather than trapping controls.
export function useViewport(){
 const [view,setView]=useState({height:window.visualViewport?.height??innerHeight,relaxed:false})
 useEffect(()=>{
  const probe=document.createElement('span');probe.style.cssText='position:fixed;top:0;left:0;height:1rem;width:1rem;visibility:hidden;pointer-events:none';document.body.append(probe)
  function measure(){
   const vv=window.visualViewport,height=vv?.height??innerHeight,font=probe.getBoundingClientRect().height,css=getComputedStyle(document.documentElement),safeTop=parseFloat(css.getPropertyValue('--screen-safe-top'))||0
   const header=document.querySelector('.page-header')?.getBoundingClientRect().height??64,nav=document.querySelector('.navigation')?.getBoundingClientRect().height??73
   const minimum=15*font+Math.max(56,Math.min(72,height*.08))+1.2*font+7+22+header+34+safeTop+nav
   setView({height,relaxed:(vv?.scale??1)>1.05||font>20||(innerWidth<=700&&minimum>height)})
  }
  const observer=new ResizeObserver(measure);observer.observe(probe);const header=document.querySelector('.page-header');if(header)observer.observe(header);visualViewport?.addEventListener('resize',measure);window.addEventListener('resize',measure);measure()
  return()=>{observer.disconnect();probe.remove();visualViewport?.removeEventListener('resize',measure);window.removeEventListener('resize',measure)}
 },[])
 return view
}
