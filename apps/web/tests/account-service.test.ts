import {it,expect,vi} from 'vitest'
import {service,Problem,recentAuthentication,type Job} from '../../../supabase/functions/account-data/service'
import {sha256,bytes} from '../../../supabase/functions/account-data/archive'
const A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222',ID='33333333-3333-3333-3333-333333333333',PHOTO='44444444-4444-4444-4444-444444444444'
const now=1800000000000
const jwt=(owner=A,age=0,method='password')=>`e30.${btoa(JSON.stringify({sub:owner,role:'authenticated',iat:now/1000,amr:[{method,timestamp:now/1000-age}]}))}.verified-test-signature`
function fixture(){
 const original=`${A}/${PHOTO}/original.png`,cropped=`${A}/${PHOTO}/card.jpg`,files=new Map([[original,new Uint8Array([1,2,3])],[cropped,new Uint8Array([4,5,6])]])
 let job:Job|null=null,exists=true,removeFails=false,changed=false,reads=0,authFails=false,claimed=false
 const snapshot={owner_id:A,format_version:1,daily_deck_profiles:[{owner_id:A,marketing_opt_in:false}],daily_deck_items:[{title:'Private task',deadline_local:'14:00'}],daily_deck_events:[{action:'done',occurred_at:'2026-11-09T12:00:00Z'}],daily_deck_photos:[{source_path:original,rendered_path:cropped,source_bytes:3,rendered_bytes:3,crop_zoom:2}],files:[{name:original,metadata:{size:3}},{name:cropped,metadata:{size:3}}]}
 const verify=vi.fn(async(token:string)=>{if(authFails||!token.endsWith('.verified-test-signature'))throw new Problem(401,'AUTH','Invalid session');const owner=JSON.parse(atob(token.split('.')[1])).sub;return{id:owner,email:'owner@example.test',user_metadata:{full_name:'Owner',access_token:'DO_NOT_EXPORT_TOKEN'},app_metadata:{providers:['email'],secret:'DO_NOT_EXPORT_SECRET'}}})
 const rpc=vi.fn(async(name:string,p:any={})=>{
  if(name==='daily_deck_account_export'){expect(p.p_owner).toBe(A);return structuredClone({...snapshot,...(changed&&reads++>0?{changed:true}:{})})}
  if(name==='daily_deck_delete_job')return job?structuredClone(job):null
  if(name==='daily_deck_delete_begin'){job={owner_id:p.p_owner,request_id:p.p_request,token_hash:p.p_hash,stage:'storage',created_at:new Date(now).toISOString()};return structuredClone(job)}
  if(name==='daily_deck_delete_claim')return claimed?null:job?structuredClone(job):null
  if(name==='daily_deck_delete_files')return [...files.keys()]
  if(name==='daily_deck_delete_step'){if(p.p_next==='complete')expect(exists).toBe(false);job!.stage=p.p_next;return structuredClone(job)}
  if(name==='daily_deck_delete_release')return null
  if(name==='daily_deck_delete_queue')return job?[job.request_id]:[]
  throw new Error('Unexpected RPC '+name)
 })
 const remove=vi.fn(async(names:string[])=>{if(removeFails)throw new Error('Storage is offline');for(const n of names){expect(n.startsWith(A+'/')).toBe(true);files.delete(n)}})
 const deleteIdentity=vi.fn(async(owner:string)=>{expect(owner).toBe(A);expect(files.size).toBe(0);expect(job?.stage).toBe('auth');exists=false})
 const s=service({verify,rpc,remove,download:async name=>{const data=files.get(name);if(!data)throw new Error('Missing photo');return data},deleteIdentity,now:()=>now,uuid:()=>crypto.randomUUID()})
 return{s,files,snapshot,rpc,verify,remove,deleteIdentity,job:()=>job,setFail:(v:boolean)=>removeFails=v,change:()=>changed=true,revoke:()=>authFails=true,claim:()=>claimed=true}
}
function unpack(body:Uint8Array){const out=new Map<string,Uint8Array>();for(let pos=0;pos<body.length;){const h=body.slice(pos,pos+512),name=new TextDecoder().decode(h.slice(0,100)).split('\0')[0];if(!name)break;const size=parseInt(new TextDecoder().decode(h.slice(124,136)),8);out.set(name,body.slice(pos+512,pos+512+size));pos+=512+Math.ceil(size/512)*512}return out}
it('exports structured owner data and actual originals/crops with a versioned complete manifest and matching archive digest',async()=>{
 const f=fixture(),result=await f.s.exportData(jwt()),files=unpack(result.body),manifest=JSON.parse(new TextDecoder().decode(files.get('manifest.json')))
 expect(await sha256(result.body)).toBe(result.digest);expect(manifest).toMatchObject({version:1,complete:true,owner_id:A,restorable:false})
 expect([...files.get(`photos/${PHOTO}/original.png`)!]).toEqual([1,2,3]);expect([...files.get(`photos/${PHOTO}/card.jpg`)!]).toEqual([4,5,6])
 const account=new TextDecoder().decode(files.get('account.json'));expect(account).toContain('Private task');expect(account).toContain('14:00');expect(account).toContain('occurred_at');expect(account).not.toContain('DO_NOT_EXPORT');expect(account).not.toContain('verified-test-signature')
 for(const record of manifest.files)expect(await sha256(files.get(record.path)!)).toBe(record.sha256)
})
it('does not create an apparently complete archive when data changes, a registered photo is missing, or an oversized export is requested',async()=>{
 const f=fixture();f.change();await expect(f.s.exportData(jwt())).rejects.toMatchObject({code:'EXPORT_CHANGED'})
 const missing=fixture();missing.files.clear();await expect(missing.s.exportData(jwt())).rejects.toThrow('Missing photo')
 const large=fixture();large.snapshot.files[0].metadata.size=64*1024*1024;await expect(large.s.exportData(jwt())).rejects.toMatchObject({code:'EXPORT'})
})
it('requires verified recent original authentication, not a refreshed iat, and rejects another account proof or modified tokens',async()=>{
 expect(recentAuthentication(jwt(A,301),A,now)).toBe(false);expect(recentAuthentication(jwt(A,0,'oauth'),A,now)).toBe(true)
 const f=fixture(),body={expected_owner:A,confirm:true,request_id:ID,resume_token:'a'.repeat(43)}
 await expect(f.s.deletion(body,jwt(A,301))).rejects.toMatchObject({code:'REAUTH'})
 await expect(f.s.deletion({...body,reauth_token:jwt(B)},jwt())).rejects.toMatchObject({code:'REAUTH'})
 await expect(f.s.deletion({...body,reauth_token:jwt().replace('verified-test-signature','fake')},jwt())).rejects.toMatchObject({code:'AUTH'})
 expect(f.rpc.mock.calls.some(([n])=>n==='daily_deck_delete_begin')).toBe(false)
})
it('partial Storage failure never reports deletion; a durable capability resumes after revocation and deletes in safe order',async()=>{
 const f=fixture(),body={expected_owner:A,confirm:true,request_id:ID,resume_token:'a'.repeat(43)};f.setFail(true)
 await expect(f.s.deletion(body,jwt())).rejects.toMatchObject({code:'DELETE_PENDING'});expect(f.job()?.stage).toBe('storage');expect(f.deleteIdentity).not.toHaveBeenCalled()
 f.setFail(false);f.revoke();const done=await f.s.deletion(body,'revoked');expect(done.complete).toBe(true);expect(f.deleteIdentity).toHaveBeenCalledOnce();expect(f.job()?.stage).toBe('complete')
 await expect(f.s.deletion({...body,resume_token:'b'.repeat(43)},'')).rejects.toMatchObject({code:'RECOVERY'})
 const again=await f.s.deletion(body,'');expect(again.complete).toBe(true);expect(f.deleteIdentity).toHaveBeenCalledOnce()
})
it('concurrent workers return pending instead of claiming completion and worker retries do not need user sessions',async()=>{
 const f=fixture();f.setFail(true);await expect(f.s.deletion({expected_owner:A,confirm:true,request_id:ID,resume_token:'a'.repeat(43)},jwt(A,0,'oauth'))).rejects.toThrow()
 f.claim();expect(await f.s.advance(ID)).toMatchObject({complete:false,state:'busy'});expect(f.deleteIdentity).not.toHaveBeenCalled()
})
it('a resume cannot initiate a deletion and an expected-account mismatch cannot erase the new account after switching',async()=>{
 const f=fixture(),body={expected_owner:A,request_id:ID,resume_token:'a'.repeat(43)}
 await expect(f.s.deletion(body,jwt())).rejects.toMatchObject({code:'NO_JOB'})
 await expect(f.s.deletion({...body,confirm:true},jwt(B))).rejects.toMatchObject({code:'OWNER'})
 expect(f.rpc.mock.calls.some(([n])=>n==='daily_deck_delete_begin')).toBe(false)
})
it('HTTP handler rejects foreign origins, unprivileged workers, arbitrary owner fields and oversized bodies without side effects',async()=>{
 const {createHandler}=await import('../../../supabase/functions/account-data/handler')
 const f=fixture(),handle=createHandler(f.s,new Set(['https://preview.example.test']),'x'.repeat(64))
 const call=(body:string,origin='https://preview.example.test',extra:Record<string,string>={})=>handle(new Request('https://function.example.test',{method:'POST',headers:{origin,'content-type':'application/json',...extra},body}))
 expect((await call('{"action":"worker"}')).status).toBe(403)
 expect((await call('{"action":"export"}','https://evil.test')).status).toBe(403)
 expect((await call('{"action":"export","owner":"other"}')).status).toBe(400)
 expect((await call('['+' '.repeat(17000))).status).toBe(413)
 expect((await call('{')).status).toBe(400)
 expect(f.verify).not.toHaveBeenCalled();expect(f.remove).not.toHaveBeenCalled()
 const worker=await call('{"action":"worker"}','https://unlisted.test',{'x-daily-deck-worker-secret':'x'.repeat(64)})
 expect(worker.status).toBe(200);expect(await worker.json()).toEqual({processed:0,complete:0,pending:0})
})
