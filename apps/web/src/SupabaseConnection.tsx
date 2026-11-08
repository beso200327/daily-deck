import {useEffect,useRef,useState} from 'react'
import {supabaseConfiguration,checkSupabaseConnectivity} from './supabase'
export function SupabaseConnection(){
 const [checking,setChecking]=useState(false),[message,setMessage]=useState('')
 const pending=useRef(false),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 async function check(){
  if(pending.current)return
  pending.current=true;setChecking(true);setMessage('')
  try{await checkSupabaseConnectivity();if(mounted.current)setMessage('Supabase Auth service is reachable and accepted the public key. This does not verify database migrations, RLS or photo storage. No task or photo data was sent.')}
  catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'Connection failed. Check your connection and Preview configuration. Your local deck is unchanged.')}
  finally{pending.current=false;if(mounted.current)setChecking(false)}
 }
 return <section aria-labelledby="supabase-heading" className="data-controls"><h3 id="supabase-heading">Supabase foundation</h3>
  <p>{supabaseConfiguration.status==='disabled'?'Not configured. Daily Deck works locally.':supabaseConfiguration.status==='invalid'?supabaseConfiguration.message:'Public service configuration is present.'}</p>
  <p>This check only reads public service settings. Optional cloud storage is managed separately in Account; the original local deck is never uploaded by this check.</p>
  <button type="button" className="secondary" disabled={checking||supabaseConfiguration.status!=='configured'} onClick={()=>void check()}>{checking?'Checking…':'Test Supabase connection'}</button>
  {message&&<p role="status">{message}</p>}
 </section>
}
