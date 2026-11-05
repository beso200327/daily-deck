import {it,expect,vi,afterEach} from 'vitest'
import * as D from '../src/deck'
import {transactDeck} from '../src/store'
afterEach(()=>vi.unstubAllGlobals())
it('reconciliation and actions serialize through the same lock without stale overwrites',async()=>{
 const map=new Map<string,string>(),names:string[]=[];vi.stubGlobal('localStorage',{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)}})
 let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve)
 vi.stubGlobal('navigator',{locks:{request:async(name:string,work:()=>unknown)=>{names.push(name);await held;return work()}}})
 const refresh=transactDeck(),action=transactDeck((d,now)=>D.act(d,D.pending(d,D.dayKey(now))[0].id,'done',now));await Promise.resolve();expect(map.size).toBe(0);release();const [a,b]=await Promise.all([refresh,action]);expect(names).toEqual(['daily-deck-write','daily-deck-write']);expect(b.sequence).toBeGreaterThan(a.sequence);const saved=D.decode(map.get(D.STORAGE_KEY)!);expect(saved.cards[0].events[0].action).toBe('done');expect(D.pending(saved,b.day)).toHaveLength(2)
})
it('failed writes do not return an applied snapshot or replace the existing store',async()=>{const raw=JSON.stringify(D.seed());vi.stubGlobal('localStorage',{getItem:()=>raw,setItem:()=>{throw new Error('Storage full')}});vi.stubGlobal('navigator',{});await expect(transactDeck((d,now)=>D.act(d,D.pending(d)[0].id,'done',now))).rejects.toThrow('Storage full');expect(D.decode(raw).cards.every(c=>c.events.length===0)).toBe(true)})
