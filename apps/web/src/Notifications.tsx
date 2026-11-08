import {useEffect,useRef,useState} from 'react'

/** No push backend exists. Desktop tests use the OS through the existing service worker;
 * iOS requires Home Screen Web Push and must never be represented as locally scheduled. */
export function Notifications(){
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)
 const standalone=matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone
 const supported=isSecureContext&&'Notification'in window&&'serviceWorker'in navigator
 const [permission,setPermission]=useState<NotificationPermission|'unavailable'>(supported?Notification.permission:'unavailable')
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const pending=useRef(false),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;const refresh=()=>setPermission(supported?Notification.permission:'unavailable');window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{mounted.current=false;window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}},[supported])
 async function enable(){
  if(pending.current)return
  pending.current=true;setBusy(true);setMessage('')
  try{const result=await Notification.requestPermission();if(mounted.current){setPermission(result);setMessage(result==='granted'?'Permission granted. You can send a system test notification. Deadline reminders are still unavailable.':result==='denied'?'Notifications are blocked. Change this site’s notification permission in browser settings to try again. Your tasks can still be saved.':'Permission was not granted. You can still save tasks and deadlines.')}}
  catch{if(mounted.current)setMessage('Permission could not be requested. Check browser notification settings; your tasks are unchanged.')}
  finally{pending.current=false;if(mounted.current)setBusy(false)}
 }
 async function test(){
  if(pending.current)return
  pending.current=true;setBusy(true);setMessage('')
  try{
   if(Notification.permission!=='granted')throw new Error('Enable notifications first. If blocked, change this site’s permission in browser settings.')
   const registration=await navigator.serviceWorker.getRegistration()
   if(!registration?.active)throw new Error('The app’s service worker is not ready. Reload Daily Deck online, then try again.')
   await registration.showNotification('Daily Deck — test notification',{body:'This is a system notification test. Deadline reminders are not configured in the web app.',tag:'dailydeck-system-test',icon:'/pwa-192.png',data:{kind:'test'}})
   if(mounted.current)setMessage('Test handed to the system. Check Notification Center; browser and OS settings or Focus may suppress the banner. This does not schedule deadline reminders.')
  }catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'Could not send a system notification. Check browser and OS settings.')}
  finally{pending.current=false;if(mounted.current){setBusy(false);setPermission(Notification.permission)}}
 }
 const blocked=ios||!supported
 return <section className="notification-settings" aria-labelledby="notification-heading"><h3 id="notification-heading">Notifications</h3>
  <p>System notifications can alert you about pending deadlines. Permission is requested only after you tap Enable notifications.</p>
  <p className="permission-status">Permission status: <strong>{permission==='default'?'Not requested':permission==='granted'?'Granted':permission==='denied'?'Blocked':'Not available in this browser'}</strong></p>
  {ios&&<p>{!standalone?'On iPhone, first use Safari → Share → Add to Home Screen, then launch Daily Deck from its icon. ':''}Home Screen Web Push requires iOS 16.4 or later and a push backend. Daily Deck’s push backend is not configured, so enabling notifications and sending a test on iPhone are unavailable.</p>}
  {!supported&&!ios&&<p>This browser needs HTTPS, notification support, and an active service worker to send a system test.</p>}
  <div className="photo-actions"><button type="button" className="secondary" disabled={busy||blocked||permission==='granted'||permission==='denied'} onClick={()=>void enable()}>Enable notifications</button><button type="button" className="secondary" disabled={busy||blocked||permission!=='granted'} onClick={()=>void test()}>Send test notification</button></div>
  {permission==='denied'&&<p>Permission is blocked. Re-enable this site in browser or iPhone notification settings. Saving tasks remains available.</p>}
  <p><strong>Deadline reminders: unavailable on the web.</strong> Deadlines and reminder preferences are saved locally, but no background reminder is scheduled. A desktop system test does not verify closed-app reminders.</p>
  <p>Required setup: Home Screen Web Push subscription, a service-worker push handler, and a durable backend scheduler with pending-task updates and cancellation. No open-page timer is used.</p>
  {message&&<p role="status">{message}</p>}
 </section>
}
