import {DeletionRecovery} from './AccountData'
import {useEffect,useRef,useState,type ReactNode} from 'react'
import {AuthDialog,useAuth} from './Auth'
import {useCloud} from './CloudControls'
import {auth} from './auth-store'
import {cloud} from './cloud-store'
export function Startup({children}:{children:ReactNode}){
 const a=useAuth(),c=useCloud(),opened=useRef<string|null>(null)
 const [localChoice,setLocalChoice]=useState<string|null>(null)
 const actor=a.user?.id??'guest',checking=!a.ready||a.identity==='checking'
 useEffect(()=>{if(checking)setLocalChoice(null)},[checking])
 // Never mount the deck (which seeds guest storage) before both decisions resolve.
 const selected=a.identity==='verified'&&a.onboarding?.complete&&c.selectionReady&&c.owner===a.user?.id
 const source=selected?c.scope:null
 const ready=!checking&&((a.identity==='guest'&&c.scope==='local'&&!c.owner)||(localChoice===actor&&c.scope==='local')||(selected&&(source==='local'||(c.snapshot&&(c.phase==='ready'||opened.current===source)))))
 // Preserve the existing read-only offline behavior only after this owner opened successfully.
 if(ready)opened.current=source
 else if(checking||!selected||opened.current!==source)opened.current=null
 const error=!checking&&!ready&&(a.identity==='error'||(a.user&&!a.onboarding?.complete)||c.error||c.phase==='offline'||c.phase==='error')
 const local=()=>{cloud.local(a.identity==='verified'?a.user?.id:undefined);setLocalChoice(actor)}
 const retry=async()=>{if(a.identity==='error')await auth.refresh();else if(a.onboarding?.complete){if(c.scope==='local')cloud.identityChanged(true);else await cloud.open()}else await auth.open()}
 return <>{ready?children:<main className="startup-screen" inert={a.open} aria-hidden={a.open||undefined}><section aria-busy={!error}><h1>{error?'Your deck is on hold':'Opening your deck…'}</h1><p role={error?'alert':'status'}>{error?(c.error||a.error||'Sign in or finish account setup to open your deck.'):checking?'Checking your account…':'Restoring your storage choice and loading your deck…'}</p>{error&&<div className="photo-actions"><button type="button" className="primary" onClick={()=>void retry().catch(()=>{})}>Retry startup</button><button type="button" className="secondary" onClick={()=>void auth.open()}>{a.user?'Account':'Sign in'}</button><button type="button" className="secondary" onClick={local}>Use local deck</button></div>}</section></main>}<AuthDialog continueLocal={local}/><DeletionRecovery/></>
}
