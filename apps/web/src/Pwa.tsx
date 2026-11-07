import { useEffect, useRef, useState } from 'react'
import {createPortal} from 'react-dom'
import { Download } from 'lucide-react'
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{outcome: string}> }
export function PwaControls({editing,container}: {editing: boolean;container:HTMLElement|null}) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  const [update, setUpdate] = useState(false)
  const [help, setHelp] = useState(false)
  const worker = useRef<ServiceWorker | null>(null)
  const requested = useRef(false)
  useEffect(() => {
    const install = (e: Event) => {e.preventDefault();setPrompt(e as InstallPrompt)}
    window.addEventListener('beforeinstallprompt', install)
    const installed = () => setPrompt(null)
    window.addEventListener('appinstalled', installed)
    if (!('serviceWorker' in navigator)) return () => {window.removeEventListener('beforeinstallprompt',install);window.removeEventListener('appinstalled',installed)}
    const hadController = !!navigator.serviceWorker.controller
    const changed = () => {if (requested.current) location.reload(); else if (hadController) setUpdate(true)}
    navigator.serviceWorker.addEventListener('controllerchange', changed)
    void navigator.serviceWorker.register('/sw.js', {updateViaCache:'none'}).then(registration => {
      const offer = () => {if (registration.waiting && registration.active && navigator.serviceWorker.controller) {worker.current=registration.waiting;setUpdate(true)}}
      offer()
      registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange',offer))
    }).catch(() => { /* App remains usable online if installation/caching is unavailable. */ })
    return () => {window.removeEventListener('beforeinstallprompt',install);window.removeEventListener('appinstalled',installed);navigator.serviceWorker.removeEventListener('controllerchange',changed)}
  }, [])
  return <div className="pwa-controls">
    {update && <div className="update-banner" role="status"><span>A fresh version is ready. Save any edits before reloading.</span><button disabled={editing} onClick={() => {requested.current=true;if (worker.current) worker.current.postMessage({type:'ACTIVATE_UPDATE'});else location.reload()}}>Reload update</button></div>}
    {container&&createPortal(<><button className="text-button" onClick={() => {if (prompt) void prompt.prompt().then(() => prompt.userChoice).then(() => setPrompt(null));else setHelp(!help)}}><Download size={15}/>Install on Home Screen</button>
    <button className="text-button install-guide" onClick={() => setHelp(!help)}>Installation guide</button>
    {help && <div className="installation-help"><strong>Your deck, one tap away.</strong><p>iPhone / iPad Safari: tap Share, then Add to Home Screen → Add. On supported iOS versions, enable Open as Web App.</p><p>Chrome or Edge: use the install icon in the address bar or menu → Install app. On Mac Safari: File → Add to Dock (supported macOS versions).</p><p>This launches a standalone web app. It is not a native iOS Home Screen widget. The Widget preview in Help & settings is only an interaction test.</p></div>}</>,container)}
  </div>
}
