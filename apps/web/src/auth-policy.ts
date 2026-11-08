/** Build-only Preview switch; it cannot be enabled by localStorage or a URL flag. */
declare const __DAILY_DECK_AUTH_PREVIEW__:boolean
export const AUTH_PREVIEW=import.meta.env.DEV||(typeof __DAILY_DECK_AUTH_PREVIEW__!=='undefined'&&__DAILY_DECK_AUTH_PREVIEW__)
export type AuthScreen='signin'|'signup'|'confirmation'|'forgot'|'reset'|'onboarding'|'account'
export type Callback={kind:'none'}|{kind:'error';canceled:boolean}|{kind:'code';code:string;flow:string;flowId?:string}|{kind:'token';token:string;type:'email'|'signup'|'recovery'}
const opaque=(value:string|null)=>!!value&&value.length>=16&&value.length<=4096&&/^[A-Za-z0-9._~-]+$/.test(value)
export function callbackURL(origin:string,flow:'oauth'|'confirmation'|'recovery'){
 const url=new URL('/auth/callback',origin);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Unsupported callback origin');url.searchParams.set('flow',flow);return url.href
}
/** No next/returnTo/redirect destination is accepted. Never render raw callback errors. */
export function parseCallback(href:string):Callback{
 const url=new URL(href),hash=new URLSearchParams(url.hash.slice(1)),q=url.searchParams
 const detected=url.pathname==='/auth/callback'||['code','token_hash','access_token','refresh_token','error','error_code'].some(k=>q.has(k)||hash.has(k))
 if(!detected)return{kind:'none'}
 const bad={kind:'error' as const,canceled:false}
 if(url.pathname!=='/auth/callback')return bad
 if(hash.has('access_token')||hash.has('refresh_token')||q.has('access_token')||q.has('refresh_token'))return bad
 const allowed=new Set(['code','flow','token_hash','type','error','error_code','error_description','sb_flow_id'])
 if([...q.keys(),...hash.keys()].some(k=>!allowed.has(k))||[...q.keys()].some(k=>q.getAll(k).length!==1))return bad
 if(q.has('error')||hash.has('error'))return{kind:'error',canceled:(q.get('error')??hash.get('error'))==='access_denied'}
 if(q.has('code')&&q.has('token_hash'))return bad
 if(q.has('code')){const code=q.get('code'),flow=q.get('flow')??'oauth',flowId=q.get('sb_flow_id');if(flowId!==null&&!/^[a-zA-Z0-9_-]{8,64}$/.test(flowId))return bad;return opaque(code)&&['oauth','confirmation','recovery'].includes(flow)?{kind:'code',code:code!,flow,...(flowId?{flowId}:{})}:bad}
 const token=q.get('token_hash'),type=q.get('type')
 return opaque(token)&&['email','signup','recovery'].includes(type??'')?{kind:'token',token:token!,type:type as 'email'|'signup'|'recovery'}:bad
}
export function authError(error:unknown):string{
 const code=error&&typeof error==='object'&&'code'in error?String(error.code):''
 const messages:Record<string,string>={invalid_credentials:'The email or password is incorrect.',email_not_confirmed:'Confirm your email before signing in. You can resend the confirmation.',weak_password:'Choose a stronger password that meets the account’s password rules.',over_email_send_rate_limit:'Please wait a minute before requesting another email.',over_request_rate_limit:'Too many attempts. Please wait and try again.',otp_expired:'This link has expired or was already used. Request a new link.',flow_state_expired:'This link has expired. Request a new link in this browser.',flow_state_not_found:'Open this link in the browser where you requested it, or request a new link.',pkce_code_verifier_not_found:'Open this link in the browser where you requested it, or request a new link.',same_password:'Choose a password different from the current password.',session_not_found:'Your session expired. Sign in again.',reauthentication_needed:'Request a new recovery link before changing your password.',bad_code_verifier:'Open this link in the browser where you requested it, or request a new link.',provider_disabled:'This sign-in option is unavailable. Use email instead.',email_address_invalid:'Enter a valid email address.',user_banned:'This account is unavailable. Use the available support channel.'}
 return messages[code]??'We couldn’t complete that request. Check your connection and try again. Your local deck is unchanged.'
}
