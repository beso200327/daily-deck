// Timers are foreground conveniences only. Every launch/resume independently catches up from persistence.
export function nextLocalMidnight(now=new Date()){return new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime()}
export function watchLocalCalendar(reconcile:()=>void){
 let midnight:ReturnType<typeof setTimeout>|undefined,stopped=false
 function schedule(){clearTimeout(midnight);if(stopped)return;midnight=setTimeout(()=>{if(document.visibilityState==='visible')reconcile();schedule()},Math.max(1,nextLocalMidnight()-Date.now()))}
 function resume(){if(document.visibilityState==='visible'){reconcile();schedule()}}
 function storage(e:StorageEvent){if(e.key===null||e.key?.startsWith('daily-deck.web.v1'))resume()}
 const poll=setInterval(()=>{if(document.visibilityState==='visible'){reconcile();schedule()}},30_000)
 document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);window.addEventListener('storage',storage)
 reconcile();schedule()
 return()=>{stopped=true;clearTimeout(midnight);clearInterval(poll);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);window.removeEventListener('storage',storage)}
}
