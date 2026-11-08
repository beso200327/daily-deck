import {createHash} from 'node:crypto'
import type {Page,Route} from '@playwright/test'
export const third='33333333-3333-3333-3333-333333333333',fourth='44444444-4444-4444-4444-444444444444'
export const service='https://auth-fixture.supabase.co',password='synthetic-password-only',first='11111111-1111-1111-1111-111111111111',second='22222222-2222-2222-2222-222222222222'
export async function installAuth(page:Page,extension?:(route:Route,owner:string|null)=>Promise<boolean>){
 const fixture={approved:new Set<string>(),google:true,apple:false,mode:'preview',confirmed:true,challenge:'',activeEmail:'authorized@example.test',signupCalls:0,resendCalls:0,recoverCalls:0,refreshCalls:0,resetCalls:0,tokenCalls:0,requests:[] as {path:string;method:string;body:any}[],holdUser:null as null|Promise<void>,userFailure:false,holdSignin:null as null|Promise<void>}
 const users=new Map<string,any>(),passwords=new Map<string,string>()
 const makeUser=(email:string)=>{let u=users.get(email);if(!u){u={id:email==='second@example.test'?second:email==='authorized@example.test'?first:email.includes('privaterelay.appleid.com')?fourth:third,aud:'authenticated',role:'authenticated',email,app_metadata:{provider:'email',providers:['email']},user_metadata:{},email_confirmed_at:'2026-11-08T08:00:00Z',created_at:'2026-11-08T08:00:00Z',identities:[]};users.set(email,u);passwords.set(email,password)}return u}
 makeUser('authorized@example.test');makeUser('second@example.test')
 const token=(user:any,expired=false)=>{const now=Math.floor(Date.now()/1000);const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');return`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,email:user.email,role:'authenticated',aud:'authenticated',iat:now-10,exp:expired?now-100:now+3600,session_id:user.id})}.synthetic_signature_not_a_real_token`}
 const session=(email:string,expired=false)=>{const user=makeUser(email);return{access_token:token(user,expired),refresh_token:'synthetic_refresh_'+user.id,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+(expired?-100:3600),token_type:'bearer',user}}
 const subject=(request:import('@playwright/test').Request)=>{try{return JSON.parse(Buffer.from((request.headers().authorization??'').replace('Bearer ','').split('.')[1],'base64url').toString()).sub}catch{return null}}
 await page.route(service+'/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();let body:any={};try{body=request.postDataJSON()??{}}catch{/* Binary Storage fixture payload. */}
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':request.headers()['access-control-request-headers']??'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','content-type':'application/json','x-supabase-api-version':'2024-01-01','access-control-expose-headers':'x-supabase-api-version'}
  const send=(data:unknown,status=200)=>route.fulfill({status,headers,body:JSON.stringify(data)})
  if(method==='OPTIONS'){await route.fulfill({status:204,headers});return}
  fixture.requests.push({path,method,body})
  if(extension&&await extension(route,subject(request)))return
  if(path==='/auth/v1/settings')return send({external:{google:fixture.google,apple:fixture.apple,email:true}})
  if(path==='/auth/v1/signup'){fixture.signupCalls++;makeUser(body.email);passwords.set(body.email,body.password);fixture.activeEmail=body.email;fixture.challenge=body.code_challenge;return send({...makeUser(body.email),email_confirmed_at:null})}
  if(path==='/auth/v1/resend'){fixture.resendCalls++;fixture.challenge=body.code_challenge??fixture.challenge;return send({})}
  if(path==='/auth/v1/recover'){fixture.recoverCalls++;fixture.activeEmail=body.email;fixture.challenge=body.code_challenge;return send({})}
  if(path==='/auth/v1/authorize'){
   fixture.challenge=url.searchParams.get('code_challenge')??'';fixture.activeEmail=url.searchParams.get('provider')==='apple'?'apple-private@privaterelay.appleid.com':'authorized@example.test';const back=new URL(url.searchParams.get('redirect_to')!);back.searchParams.set('code','valid-oauth-code-123');return route.fulfill({status:302,headers:{location:back.href}})
  }
  if(path==='/auth/v1/token'){
   fixture.tokenCalls++;const grant=url.searchParams.get('grant_type')
   if(grant==='password'){
    if(fixture.holdSignin)await fixture.holdSignin
    if(!fixture.confirmed)return send({code:'email_not_confirmed',msg:'Email not confirmed'},400)
    if(passwords.get(body.email)!==body.password)return send({code:'invalid_credentials',msg:'Invalid login'},400)
    return send(session(body.email))
   }
   if(grant==='refresh_token'){fixture.refreshCalls++;const email=body.refresh_token.includes(second)?'second@example.test':'authorized@example.test';return send(session(email))}
   if(grant==='pkce'){
    if(String(body.auth_code).includes('expired'))return send({code:'flow_state_expired',msg:'Expired'},400)
    const challenge=createHash('sha256').update(body.code_verifier??'').digest('base64url')
    if(!body.code_verifier||challenge!==fixture.challenge)return send({code:'bad_code_verifier',msg:'Wrong verifier'},400)
    return send(session(fixture.activeEmail))
   }
  }
  if(path==='/auth/v1/verify'){
   if(String(body.token_hash).includes('expired'))return send({code:'otp_expired',msg:'Expired'},403)
   return send(session(fixture.activeEmail))
  }
  if(path==='/auth/v1/user'){
   if(method==='GET'&&fixture.holdUser)await fixture.holdUser
   if(method==='GET'&&fixture.userFailure)return send({code:'unexpected_failure',msg:'Synthetic verification unavailable'},503)
   const user=[...users.values()].find(u=>u.id===subject(request));if(!user)return send({code:'bad_jwt',msg:'Invalid session'},401)
   if(method==='PUT'){fixture.resetCalls++;passwords.set(user.email,body.password)}return send(user)
  }
  if(path==='/auth/v1/logout')return send({})
  if(path.startsWith('/rest/v1/rpc/')){
   const user=subject(request);if(!user)return send({code:'42501',message:'Sign in'},401)
   if(path.endsWith('daily_deck_complete_preview_onboarding')){
    if(body.p_expected_user!==user)return send({code:'42501',message:'Account changed'},403)
    if(fixture.mode!=='preview')return send({code:'42501',message:'Preview blocked'},403)
    if(body.p_age_at_least_16!==true||body.p_preview_acknowledged!==true)return send({code:'23514',message:'Declaration required'},400)
    fixture.approved.add(user)
   }
   return send({owner_id:user,mode:fixture.mode,complete:fixture.mode==='preview'&&fixture.approved.has(user),minimum_age:16,preview_only:true,legal_pending:true})
  }
  return send({error:'Unexpected endpoint in synthetic fixture'},500)
 })
 return{fixture,session}
}
