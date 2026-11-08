import type {SupabaseClient} from '@supabase/supabase-js'
import {AUTH_PREVIEW} from './auth-policy'
import {readSupabaseConfiguration} from './supabase-config'
export const supabaseConfiguration=readSupabaseConfiguration({VITE_SUPABASE_URL:import.meta.env.VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY})
let client:Promise<SupabaseClient>|undefined
/** Optional client. Auth storage is separate from the device deck; no task/photo access or sync. */
export async function getSupabaseClient():Promise<SupabaseClient|null>{
 if(supabaseConfiguration.status!=='configured')return null
 const {url,key}=supabaseConfiguration
 client??=import('@supabase/supabase-js').then(({createClient})=>createClient(url,key,{
  auth:{flowType:'pkce',persistSession:AUTH_PREVIEW,autoRefreshToken:AUTH_PREVIEW,detectSessionInUrl:false},
 })).catch(error=>{client=undefined;throw error})
 return client
}
/** Public Auth settings prove reachability/key acceptance only, not schema/RLS readiness.
 * Deliberately sends no user content, cookies, session token or local-storage data. */
export async function checkSupabaseConnectivity():Promise<void>{
 if(supabaseConfiguration.status!=='configured')throw new Error('Supabase is not configured. The local app remains available.')
 await getSupabaseClient()
 const {url,key}=supabaseConfiguration
 const response=await fetch(`${url}/auth/v1/settings`,{method:'GET',headers:{apikey:key},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000)})
 if(!response.ok)throw new Error(`Supabase connection check failed (HTTP ${response.status}). Check the Preview project URL and publishable key; no local data was sent.`)
 const body:unknown=await response.json()
 if(!body||typeof body!=='object'||!('external'in body)||typeof body.external!=='object')throw new Error('The endpoint did not return Supabase Auth settings. Check the configured project URL.')
}
