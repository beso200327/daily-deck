import {verificationIntent} from './account-reauth'
import {getSupabaseClient,supabaseConfiguration} from './supabase'
import {auth} from './auth-store'
import {clearAccountCache} from './account-cache'
import {accountUnavailable} from './account-events'
export type DeletionRequest={owner:string;request_id:string;resume_token:string;started?:boolean}
const requestKey='daily-deck.account-deletion.v1'
export function pendingDeletion():DeletionRequest|null{try{const r=JSON.parse(localStorage.getItem(requestKey)??'null');return /^[a-f0-9-]{36}$/.test(r?.owner??'')&&/^[a-f0-9-]{36}$/.test(r?.request_id??'')&&/^[A-Za-z0-9_-]{43}$/.test(r?.resume_token??'')?r:null}catch{return null}}
function changed(){window.dispatchEvent(new Event('daily-deck-deletion'))}
function createRequest(owner:string){
 const old=pendingDeletion();if(old){if(old.owner!==owner)throw new Error('A different account deletion is already pending in this browser. Check its status first.');return old}
 const token=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
 const job={owner,request_id:crypto.randomUUID(),resume_token:token};localStorage.setItem(requestKey,JSON.stringify(job));changed();return job
}
async function connection(){const client=await getSupabaseClient();if(!client||supabaseConfiguration.status!=='configured')throw new Error('Account data operations are unavailable in this build.');const result=await client.auth.getSession();return{client,configuration:supabaseConfiguration,session:result.data.session}}
async function send(body:Record<string,unknown>,expectedOwner?:string){
 const {configuration,session}=await connection()
 if(expectedOwner&&session?.user.id!==expectedOwner)throw new Error('The signed-in account changed. Nothing was submitted.')
 const response=await fetch(configuration.url+'/functions/v1/account-data',{method:'POST',headers:{'Content-Type':'application/json',apikey:configuration.key,...(session?{Authorization:'Bearer '+session.access_token}:{})},body:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000)})
 if(!response.ok){let value;try{value=await response.json()}catch{};throw Object.assign(new Error(value?.message??'Account operation could not be confirmed. Check your connection and retry the same request.'),{code:value?.code??'NETWORK',deletionPending:value?.deletion_pending})}
 return response
}
export async function exportAccount(){
 const owner=auth.snapshot().user?.id;if(!owner)throw new Error('Sign in before exporting account data.')
 const response=await send({action:'export',expected_owner:owner},owner),expected=response.headers.get('X-Archive-SHA256')
 if(!expected||!/^[a-f0-9]{64}$/.test(expected))throw new Error('The export service did not return a complete archive checksum. Check server setup; no export was downloaded.')
 const blob=await response.blob(),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('')
 const sessionNow=await (await getSupabaseClient())!.auth.getSession()
 if(actual!==expected||sessionNow.data.session?.user.id!==owner||auth.snapshot().user?.id!==owner)throw new Error('The export was incomplete or the account changed. No export was downloaded.')
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='daily-deck-account-v1.tar';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)
}
export async function deleteAccount(password?:string){
 const owner=auth.snapshot().user?.id;if(!owner)throw new Error('Sign in before requesting account deletion.')
 const intent=verificationIntent(sessionStorage);if(intent&&intent.owner!==owner)throw new Error('Verification returned a different account. No deletion started. Return to the intended account or cancel this verification request.')
 let proof:string|undefined
 if(password){
  const {configuration,session}=await connection();if(session?.user.id!==owner)throw new Error('The signed-in account changed.')
  const {createClient}=await import('@supabase/supabase-js'),temporary=createClient(configuration.url,configuration.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
  const r=await temporary.auth.signInWithPassword({email:session.user.email??'',password});if(r.error||r.data.user?.id!==owner||!r.data.session)throw new Error('Password verification failed. Check the password for this account or use Google to sign in again.')
  proof=r.data.session.access_token
 }
 const job=createRequest(owner)
 try{return await resumeDeletion(job,proof,true)}catch(error){
  // A confirmed pre-authorization failure created no job. Other failures keep
  // the same capability/transaction ID, including a lost begin response.
  if(['REAUTH','AUTH','INPUT','WORKER_NOT_READY','OWNER','DELETION_EXISTS','SESSION_VERIFY_UNAVAILABLE'].includes(String((error as {code?:string}).code))){localStorage.removeItem(requestKey);changed();if((error as {code?:string}).code==='DELETION_EXISTS')accountUnavailable(owner,'deleting')}
  throw error
 }
}
export async function resumeDeletion(job:DeletionRequest,reauth_token?:string,confirm=false){
 let response:Response
 try{response=await send({action:'delete',confirm,expected_owner:job.owner,request_id:job.request_id,resume_token:job.resume_token,...(reauth_token?{reauth_token}:{})},confirm?job.owner:undefined)}catch(error){
  const pending=(error as {deletionPending?:{request_id:string;owner_id:string}}).deletionPending
  if(pending?.request_id===job.request_id&&pending.owner_id===job.owner){
    localStorage.setItem(requestKey,JSON.stringify({...job,started:true}));changed();accountUnavailable(job.owner,'deleting');window.dispatchEvent(new CustomEvent('daily-deck-deletion-result',{detail:{complete:false,error:error instanceof Error?error.message:'Deletion is pending.'}}))
  }
  throw error
 }
 const result=await response.json()
 if(result.request_id!==job.request_id||result.owner_id!==job.owner||typeof result.complete!=='boolean')throw new Error('Deletion status was not verified. Keep this request and retry.')
 if(result.complete){
  if(result.owner_id!==job.owner)throw new Error('Account ownership did not match the deletion result.')
  accountUnavailable(job.owner,'deleted')
  await clearAccountCache(job.owner)
  const {client,session}=await connection();if(session?.user.id===job.owner)await client.auth.signOut({scope:'local'})
  localStorage.removeItem(requestKey);changed()
 }else {localStorage.setItem(requestKey,JSON.stringify({...job,started:true}));changed();accountUnavailable(job.owner,'deleting')}
 window.dispatchEvent(new CustomEvent('daily-deck-deletion-result',{detail:{complete:result.complete}}))
 return result.complete as boolean
}
