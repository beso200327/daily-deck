import {it,expect,vi,afterEach} from 'vitest'
import {rememberVerification,verificationIntent,reauthIntentKey} from '../src/account-reauth'
afterEach(()=>vi.useRealTimers())
it('pins the intended account across Google redirects without storing credentials, rejects replacing it and expires safely',()=>{
 vi.useFakeTimers();const values=new Map<string,string>(),store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}}
 const owner='11111111-1111-1111-1111-111111111111';rememberVerification(owner,store);expect(verificationIntent(store)?.owner).toBe(owner)
 expect(()=>rememberVerification('22222222-2222-2222-2222-222222222222',store)).toThrow('different account')
 expect(Object.keys(JSON.parse(values.get(reauthIntentKey)!))).toEqual(['owner','expires']);vi.advanceTimersByTime(10*60_000+1);expect(verificationIntent(store)).toBeNull()
 expect(()=>rememberVerification(owner,undefined)).toThrow('cannot retain')
})
