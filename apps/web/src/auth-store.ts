import type {Session,SupabaseClient,User} from '@supabase/supabase-js'
import {getSupabaseClient,supabaseConfiguration} from './supabase'
import {AUTH_PREVIEW,authError,callbackURL,parseCallback,type AuthScreen} from './auth-policy'
export type Onboarding={owner_id:string;mode:'blocked'|'preview';complete:boolean;minimum_age:16;preview_only:true;legal_pending:true}
export type AuthState={identity:'checking'|'guest'|'verified'|'error';ready:boolean;open:boolean;screen:AuthScreen;busy:boolean;user:Pick<User,'id'|'email'>|null;onboarding:Onboarding|null;providers:{google:boolean;apple:boolean}|null;notice:string;error:string;pendingEmail:string}
type Dependencies={enabled:boolean;client:()=>Promise<SupabaseClient|null>;href:()=>string;clean:()=>void;navigate:(url:string)=>void;storage:()=>Pick<Storage,'getItem'|'setItem'|'removeItem'>|undefined}
class AuthProblem extends Error {}
const recoveryKey='daily-deck.auth.recovery-ui.v1'
function status(value:unknown):Onboarding|null{
 if(!value||typeof value!=='object')return null
 const v=value as Record<string,unknown>
 return typeof v.owner_id==='string'&&['blocked','preview'].includes(String(v.mode))&&typeof v.complete==='boolean'&&v.minimum_age===16&&v.preview_only===true&&v.legal_pending===true?v as Onboarding:null
}
/** Auth is independent of deck/photos/store. Only the SDK stores session credentials. */
export class AuthStore{
 state:AuthState={identity:'checking',ready:false,open:false,screen:'signin',busy:false,user:null,onboarding:null,providers:null,notice:'',error:'',pendingEmail:''}
 private listeners=new Set<()=>void>()
 private initialized:Promise<void>|undefined
 private api:SupabaseClient|null=null
 private sequence=0
 private token=''
 private recovery:{userId:string;expires:number}|null=null
 private unsubscribe:(()=>void)|undefined
 private timers=new Set<ReturnType<typeof setTimeout>>()
 private disposed=false
 private mail=new Map<string,number>()
 constructor(private deps:Dependencies){}
 get enabled(){return this.deps.enabled}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 snapshot=()=>this.state
 private patch(value:Partial<AuthState>){if(this.disposed)return;this.state={...this.state,...value};this.listeners.forEach(listener=>listener())}
 private marker(userId?:string){try{if(!userId){this.recovery=null;this.deps.storage()?.removeItem(recoveryKey);return false}if(this.recovery?.userId===userId&&this.recovery.expires>Date.now())return true;const raw=this.deps.storage()?.getItem(recoveryKey);const value=raw?JSON.parse(raw):null;return value?.userId===userId&&typeof value.expires==='number'&&value.expires>Date.now()}catch{return false}}
 private markRecovery(userId:string){this.recovery={userId,expires:Date.now()+15*60_000};try{this.deps.storage()?.setItem(recoveryKey,JSON.stringify(this.recovery))}catch{/* Current recovery stays usable; a reload may require a new link. */}}
 start(){return this.initialized??=this.initialize()}
 private async initialize(){
  const callback=parseCallback(this.deps.href());if(callback.kind!=='none')this.deps.clean()
  if(!this.enabled){this.patch({identity:'guest',ready:true,open:callback.kind!=='none',error:callback.kind!=='none'?'Account testing is available only in the authorized Preview. Your local deck is unchanged.':''});return}
  let recovery=false,notice='',error=''
  try{
   this.api=await this.deps.client();if(!this.api)throw new AuthProblem('Accounts are unavailable here. Continue with the local deck.')
   if(callback.kind==='error'){if(callback.canceled)notice='Sign-in canceled. Your local deck is unchanged.';else error='This link is invalid, expired, or unsupported. Request a new link.'}
   if(callback.kind==='code'){
    let recoveredToken:string|undefined
    const listener=this.api.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY')recoveredToken=session?.access_token})
    let result
    try{result=await this.api.auth.exchangeCodeForSession(callback.code,callback.flowId?{flowId:callback.flowId}:undefined)}finally{listener.data.subscription.unsubscribe()}
    if(result.error)throw result.error
    if(!result.data.session)throw new AuthProblem('This link could not be verified. Request a new link.')
    recovery=recoveredToken===result.data.session.access_token
    if(callback.flow==='recovery'&&!recovery)throw new AuthProblem('This is not a valid password recovery link. Request a new reset link.')
    notice=recovery?'Choose a new password.':callback.flow==='confirmation'?'Email confirmed. Finish account setup to continue.':'Sign-in complete.'
   }
   if(callback.kind==='token'){
    const result=await this.api.auth.verifyOtp({token_hash:callback.token,type:callback.type});if(result.error)throw result.error;if(!result.data.session)throw new AuthProblem('This link could not be verified. Request a new link.')
    recovery=callback.type==='recovery';notice=recovery?'Choose a new password.':'Email confirmed. Finish account setup to continue.'
   }
   const result=await this.api.auth.getSession();if(result.error)throw result.error
   await this.adopt(result.data.session,recovery)
  }catch(e){error=e instanceof AuthProblem?e.message:authError(e);if(this.api){try{const previous=await this.api.auth.getSession();if(!previous.error&&(previous.data.session||callback.kind!=='none'))await this.adopt(previous.data.session)}catch{/* Keep local mode available. */}}}
  finally{
   this.patch({ready:true,...(this.state.identity==='checking'?{identity:'error' as const}:{}),...(callback.kind!=='none'?{open:true}:{}),...(notice?{notice}:{}),...(error?{error}: {})})
   if(callback.kind!=='none')void this.providers()
   if(this.api){const {data}=this.api.auth.onAuthStateChange((event,session)=>{
    if(event==='INITIAL_SESSION')return
    // Keep SDK calls outside its auth-change callback/lock.
    const timer=setTimeout(()=>{this.timers.delete(timer);void this.adopt(session,event==='PASSWORD_RECOVERY')},0);this.timers.add(timer)
   });this.unsubscribe=()=>data.subscription.unsubscribe()}
  }
 }
 private async adopt(session:Session|null,recovery=false){
  if(session&&session.access_token===this.token&&this.state.user&&this.state.onboarding&&!recovery)return
  const sequence=++this.sequence;this.token=session?.access_token??''
  if(session&&this.state.user?.id!==session.user.id)this.patch({identity:'checking',user:null,onboarding:null})
  if(!session){this.marker();this.patch({identity:'guest',user:null,onboarding:null,...(['account','reset','onboarding'].includes(this.state.screen)?{screen:'signin' as const}:{})});return}
  try{
   const verified=await this.api!.auth.getUser(session.access_token)
   if(sequence!==this.sequence)return
   if(verified.error||!verified.data.user||verified.data.user.id!==session.user.id)throw new AuthProblem('Your account session could not be verified. Sign in again, or continue locally.')
   const user={id:verified.data.user.id,email:verified.data.user.email}
   if(recovery)this.markRecovery(user.id)
   const resetting=recovery||this.marker(user.id)
   const result=await this.api!.rpc('daily_deck_auth_status')
   if(sequence!==this.sequence)return
   let onboarding=result.error?null:status(result.data);if(onboarding?.owner_id!==user.id)onboarding=null
   this.patch({identity:'verified',user,onboarding,screen:resetting?'reset':onboarding?.complete?'account':'onboarding',...(resetting?{open:true}:{}),...(!onboarding?{error:'Account setup is not available yet. You can still use the local deck.'}:{})})
  }catch(e){if(sequence===this.sequence)this.patch({identity:'error',user:null,onboarding:null,error:e instanceof AuthProblem?e.message:authError(e)})}
 }
 async open(screen?:AuthScreen,email?:string){screen??=this.state.user?(this.marker(this.state.user.id)?'reset':this.state.onboarding?.complete?'account':'onboarding'):'signin';this.patch({open:true,error:'',notice:'',...(screen?{screen}:{}),...(email!==undefined?{pendingEmail:email}:{})});await this.start();void this.providers()}
 close=()=>{if(!this.state.busy)this.patch({open:false,error:'',notice:'',pendingEmail:''})}
 private async providers(){
  if(!this.enabled||this.state.providers||supabaseConfiguration.status!=='configured')return
  try{const {url,key}=supabaseConfiguration;const response=await fetch(url+'/auth/v1/settings',{headers:{apikey:key},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000)});if(!response.ok)throw new Error();const body=await response.json();this.patch({providers:{google:body.external?.google===true,apple:body.external?.apple===true}})}catch{this.patch({providers:{google:false,apple:false}})}
 }
 private async run(action:()=>Promise<void>){
  if(this.state.busy)return false
  this.patch({busy:true,error:'',notice:''})
  try{await this.start();if(!this.enabled||!this.api)throw new AuthProblem('Accounts are unavailable here. Your local deck still works.');await action();return true}
  catch(e){this.patch({error:e instanceof AuthProblem?e.message:authError(e)});return false}
  finally{this.patch({busy:false})}
 }
 private email(value:string){const email=value.trim();if(!email.includes('@')||email.length>254)throw new AuthProblem('Enter a valid email address.');return email}
 private password(value:string){if(value.length<8||value.length>128)throw new AuthProblem('Use a password with 8 to 128 characters.')}
 private throttle(email:string,type:string){const id=type+email.toLowerCase(),last=this.mail.get(id)??0;if(Date.now()-last<60_000)throw new AuthProblem('Please wait a minute before requesting another email.');this.mail.set(id,Date.now())}
 signUp=(email:string,password:string,age:boolean)=>this.run(async()=>{
  email=this.email(email);this.password(password);if(age!==true)throw new AuthProblem('Daily Deck accounts are for people 16 and older. Confirm your self-declaration to continue.')
  const result=await this.api!.auth.signUp({email,password,options:{emailRedirectTo:callbackURL(new URL(this.deps.href()).origin,'confirmation')}});if(result.error)throw result.error
  this.patch({pendingEmail:email});if(result.data.session){await this.adopt(result.data.session)}else{this.mail.set('confirmation'+email.toLowerCase(),Date.now());this.patch({screen:'confirmation',notice:'If this address can be used, a confirmation email will arrive. Check your inbox and spam folder. Open the link in this browser.'})}
 })
 signIn=(email:string,password:string)=>this.run(async()=>{
  email=this.email(email);this.marker();this.patch({pendingEmail:email});const result=await this.api!.auth.signInWithPassword({email,password});if(result.error)throw result.error;await this.adopt(result.data.session)
 })
 resend=(email:string)=>this.run(async()=>{
  email=this.email(email);this.throttle(email,'confirmation');const result=await this.api!.auth.resend({type:'signup',email,options:{emailRedirectTo:callbackURL(new URL(this.deps.href()).origin,'confirmation')}});if(result.error)throw result.error;this.patch({pendingEmail:email,screen:'confirmation',notice:'If confirmation is needed, an email will arrive. Check your inbox and spam folder. Open the link in this browser.'})
 })
 forgot=(email:string)=>this.run(async()=>{
  email=this.email(email);this.throttle(email,'recovery');const result=await this.api!.auth.resetPasswordForEmail(email,{redirectTo:callbackURL(new URL(this.deps.href()).origin,'recovery')});if(result.error)throw result.error;this.patch({notice:'If an account matches this email, a reset link will arrive. Check your inbox and spam folder. Open it in this browser.'})
 })
 oauth=(provider:'google'|'apple',age:boolean)=>this.run(async()=>{
  if(!age)throw new AuthProblem('Confirm that you are at least 16 before continuing.')
  if(!this.state.providers?.[provider])throw new AuthProblem('This sign-in option is unavailable. Use email instead.')
  this.marker();const redirect=callbackURL(new URL(this.deps.href()).origin,'oauth')
  const result=await this.api!.auth.signInWithOAuth({provider,options:{redirectTo:redirect,skipBrowserRedirect:true}});if(result.error)throw result.error
  const url=new URL(result.data.url??'');if(supabaseConfiguration.status!=='configured'||url.origin!==supabaseConfiguration.url||url.username||url.password||url.hash||url.searchParams.getAll('provider').length!==1||url.searchParams.getAll('redirect_to').length!==1||url.pathname!=='/auth/v1/authorize'||url.searchParams.get('provider')!==provider||url.searchParams.get('redirect_to')!==redirect)throw new AuthProblem('This sign-in destination is not approved. Use email instead.')
  this.deps.navigate(url.href)
 })
 resetPassword=(password:string,confirm:string)=>this.run(async()=>{
  this.password(password);if(password!==confirm)throw new AuthProblem('The passwords do not match.')
  if(!this.state.user||!this.marker(this.state.user.id))throw new AuthProblem('This recovery session has expired. Request a new reset link.')
  const result=await this.api!.auth.updateUser({password});if(result.error)throw result.error;this.marker();this.patch({screen:this.state.onboarding?.complete?'account':'onboarding',notice:'Password updated. Your local deck is unchanged.'})
 })
 onboard=(age:boolean,preview:boolean,marketing:boolean)=>this.run(async()=>{
  if(!this.state.user||age!==true||preview!==true)throw new AuthProblem('A 16+ self-declaration and Preview acknowledgement are required.')
  const subject=this.state.user.id
  const result=await this.api!.rpc('daily_deck_complete_preview_onboarding',{p_expected_user:subject,p_age_at_least_16:age,p_preview_acknowledged:preview,p_marketing_opt_in:marketing});if(result.error)throw new AuthProblem('Account setup could not be saved. Check your connection, or continue with the local deck.')
  const onboarding=status(result.data);if(!onboarding?.complete||onboarding.owner_id!==subject||this.state.user?.id!==subject)throw new AuthProblem('Account setup is not available yet. The local deck remains available.')
  this.patch({onboarding,screen:'account',notice:'Preview account setup saved. Age was self-declared, not verified. Cloud storage is optional; choose a deck in Account.'})
 })
 refresh=()=>this.run(async()=>{const result=await this.api!.auth.getSession();if(result.error)throw result.error;if(!result.data.session&&this.state.identity==='error')throw new AuthProblem('Your account session is unavailable. Sign in again, or choose the local deck explicitly.');this.token='';await this.adopt(result.data.session)})
 signOut=()=>this.run(async()=>{const result=await this.api!.auth.signOut({scope:'local'});if(result.error)throw result.error;await this.adopt(null);this.patch({pendingEmail:'',screen:'signin',notice:'Signed out of this browser. Its local tasks, photos and history are unchanged.'});void this.providers()})
 dispose(){this.disposed=true;this.sequence++;this.unsubscribe?.();this.timers.forEach(clearTimeout);this.timers.clear();this.listeners.clear()}
}
export const auth=new AuthStore({enabled:AUTH_PREVIEW&&supabaseConfiguration.status==='configured',client:getSupabaseClient,href:()=>location.href,clean:()=>history.replaceState(null,'','/'),navigate:url=>location.assign(url),storage:()=>{try{return sessionStorage}catch{return undefined}}})
