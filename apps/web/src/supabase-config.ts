export type SupabaseConfiguration =
  | {status:'disabled'}
  | {status:'invalid';message:string}
  | {status:'configured';url:string;key:string}
type Environment = {VITE_SUPABASE_URL?:string;VITE_SUPABASE_PUBLISHABLE_KEY?:string}
/** Shared by the browser and build: reject privileged keys before Vite can inline them. */
export function readSupabaseConfiguration(env:Environment):SupabaseConfiguration {
 const url=env.VITE_SUPABASE_URL?.trim()??'',key=env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()??''
 if(!url&&!key)return{status:'disabled'}
 if(!url||!key)return{status:'invalid',message:'Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or leave both unset for local-only use.'}
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return{status:'invalid',message:'VITE_SUPABASE_PUBLISHABLE_KEY must be a public sb_publishable_ key. Secret keys, service_role keys and JWT keys are not accepted.'}
 try {
  const parsed=new URL(url)
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))throw new Error()
  return{status:'configured',url:parsed.origin,key}
 }catch{return{status:'invalid',message:'VITE_SUPABASE_URL must be an HTTPS project origin without credentials, a path, a query or a fragment.'}}
}
