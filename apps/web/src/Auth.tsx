import {useEffect,useId,useRef,useState,useSyncExternalStore} from 'react'
import {auth,type AuthState} from './auth-store'
import type {AuthScreen} from './auth-policy'
import {Modal} from './Modal'
export const useAuth=()=>useSyncExternalStore(auth.subscribe,auth.snapshot)
const titles:Record<AuthScreen,string>={signin:'Welcome back',signup:'Create an account',confirmation:'Confirm your email',forgot:'Reset your password',reset:'Choose a new password',onboarding:'Before you continue',account:'Your account'}
const labels:Partial<Record<AuthScreen,string>>={signin:'Sign in',signup:'Create account',confirmation:'Resend confirmation',forgot:'Send reset link',reset:'Save new password',onboarding:'Continue Preview'}
export function AccountSection(){
 const state=useAuth()
 return <section className="data-controls" aria-labelledby="account-heading"><h3 id="account-heading">Account</h3>
  {state.user?<><p>Signed in as <strong>{state.user.email??'your account'}</strong>.</p><p>{state.onboarding?.complete?'Preview account setup completed.':'Account setup is incomplete.'} Cloud sync is not available yet.</p></>:<p>{auth.enabled?'Sign in or create a Preview test account.':'Account testing is available only in the configured Preview.'}</p>}
  <p>This browser’s local tasks, photos and history are not account data. Signing in or out never moves, uploads or clears them. Anyone using this browser can see its local deck.</p>
  {auth.enabled&&<button type="button" className="secondary" onClick={()=>void auth.open()}>{state.user?'Manage account':'Sign in or create account'}</button>}
 </section>
}
export function AuthDialog(){const state=useAuth();return state.open?<AuthForm key={state.screen} state={state}/>:null}
function AuthForm({state}:{state:AuthState}){
 const id=useId(),[email,setEmail]=useState(state.pendingEmail),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[age,setAge]=useState(false),[preview,setPreview]=useState(false),[marketing,setMarketing]=useState(false)
 const {screen,busy}=state
 const feedback=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(state.notice||state.error)feedback.current?.scrollIntoView({block:'nearest'})},[state.notice,state.error])
 const submit=(event:React.FormEvent)=>{
  event.preventDefault()
  if(screen==='signup')void auth.signUp(email,password,age)
  else if(screen==='signin')void auth.signIn(email,password)
  else if(screen==='confirmation')void auth.resend(email)
  else if(screen==='forgot')void auth.forgot(email)
  else if(screen==='reset')void auth.resetPassword(password,confirm)
  else if(screen==='onboarding')void auth.onboard(age,preview,marketing)
 }
 const setupAvailable=state.onboarding?.mode==='preview'
 return <Modal title={titles[screen]} close={auth.close} initialFocus="heading" footer={<div className="form-actions auth-footer"><button type="button" className="secondary" disabled={busy} onClick={auth.close}>Continue in local mode</button>{auth.enabled&&screen==='account'?<button type="button" className="primary" disabled={busy} onClick={()=>void auth.signOut()}>{busy?'Signing out…':'Sign out'}</button>:auth.enabled&&<button type="submit" className="primary" form={id} disabled={busy||!state.ready||(screen==='onboarding'&&!setupAvailable)}>{busy?'Working…':labels[screen]}</button>}</div>}>
  <div className="auth-notice"><strong>Preview testing only · ages 16+</strong><p>Approved terms and privacy documents are pending. This is not a public-release onboarding process.</p></div>
  <p className="auth-local-note">Your device deck stays in this browser, separate from any account. Cloud synchronization is not available.</p>
  {!auth.enabled?<p>Account testing is unavailable in this build. You can keep using the local deck.</p>:<form id={id} className="auth-form" onSubmit={submit}>
   <fieldset disabled={busy||!state.ready}>
   {['signin','signup','forgot','confirmation'].includes(screen)&&<label>Email<input name="email" type="email" autoComplete={screen==='signin'?'username':'email'} autoCapitalize="none" spellCheck={false} inputMode="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>}
   {['signin','signup','reset'].includes(screen)&&<label>{screen==='reset'?'New password':'Password'}<input name="password" type="password" autoComplete={screen==='signin'?'current-password':'new-password'} required minLength={screen==='signin'?undefined:8} maxLength={screen==='signin'?undefined:128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
   {['signup','reset'].includes(screen)&&<p>Use 8 to 128 characters. Your password manager can create and save a strong password.</p>}
   {screen==='reset'&&<label>Confirm new password<input name="password-confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>}
   {screen==='signup'&&<label className="auth-check"><input type="checkbox" required checked={age} onChange={e=>setAge(e.target.checked)}/><span>I am at least 16 years old (self-declared, not verified).</span></label>}
   {screen==='confirmation'&&<p>Open the email confirmation link in the browser where you requested it. Check spam too. If the link expired, request another after a minute. You can also return to sign in.</p>}
   {screen==='forgot'&&<p>We’ll send a reset link if an account matches. Open it in this browser; the link expires and can be used only once.</p>}
   {screen==='onboarding'&&<>
    <p>Signed in as <strong>{state.user?.email}</strong>. This does not associate this browser’s local deck with that account.</p>
    {!setupAvailable?<p>Account setup is not available yet. You can sign out or continue using the local deck.</p>:<>
     <label className="auth-check"><input type="checkbox" required checked={age} onChange={e=>setAge(e.target.checked)}/><span>I am at least 16 years old. This is my self-declaration, not verified age.</span></label>
     <label className="auth-check"><input type="checkbox" required checked={preview} onChange={e=>setPreview(e.target.checked)}/><span>I understand this is an authorized Preview test. Approved terms and privacy documents are pending; this acknowledgement is not acceptance of final legal documents.</span></label>
     <label className="auth-check"><input type="checkbox" checked={marketing} onChange={e=>setMarketing(e.target.checked)}/><span>I’d like optional product news by email. Optional and separate; no marketing emails are sent in this Preview.</span></label>
    </>}
    <div className="auth-links"><button type="button" className="text-button" onClick={()=>void auth.refresh()}>Retry account setup</button><button type="button" className="text-button" onClick={()=>void auth.signOut()}>Sign out instead</button></div>
   </>}
   {screen==='account'&&<><p>Signed in as <strong>{state.user?.email}</strong>.</p><p>Age was self-declared, not verified. Preview setup does not mean that approved legal acceptance or public-release requirements are complete.</p><p>Your local deck is shared within this browser, not stored under this account. Different accounts do not get separate cloud copies of it.</p></>}
   {['signin','signup'].includes(screen)&&<>
    <div className="auth-links"><button type="button" className="text-button" onClick={()=>void auth.open(screen==='signin'?'signup':'signin',email)}>{screen==='signin'?'Create an account instead':'Sign in instead'}</button>{screen==='signin'&&<><button type="button" className="text-button" onClick={()=>void auth.open('forgot',email)}>Forgot password?</button><button type="button" className="text-button" onClick={()=>void auth.open('confirmation',email)}>Resend confirmation</button></>}</div>
    {state.providers&&(state.providers.google||state.providers.apple)?<div className="auth-providers">
     {screen==='signin'&&<label className="auth-check"><input type="checkbox" checked={age} onChange={e=>setAge(e.target.checked)}/><span>I am at least 16 (self-declared). Required to continue with a provider.</span></label>}
     {state.providers.google&&<button type="button" className="secondary" disabled={!age} onClick={()=>void auth.oauth('google',age)}>Continue with Google</button>}
     {state.providers.apple&&<button type="button" className="secondary" disabled={!age} onClick={()=>void auth.oauth('apple',age)}>Continue with Apple</button>}
    </div>:<p>Other sign-in options are not available right now. Email sign-in is available.</p>}
    <p>Use your usual sign-in method. Apple Hide My Email can use a different address from Google or email sign-in. Daily Deck does not manually merge or link accounts.</p>
   </>}
   {['confirmation','forgot'].includes(screen)&&<button type="button" className="text-button" onClick={()=>void auth.open('signin',email)}>Back to sign in</button>}
   </fieldset>
  </form>}
  <div ref={feedback}>{!state.ready&&<p role="status">Checking account…</p>}{state.notice&&<p className="auth-status" role="status">{state.notice}</p>}
  {state.error&&<p className="field-error" role="alert">{state.error}</p>}</div>
 </Modal>
}
