import * as D from './deck'
import {assertCapacity} from './limits'
let sequence=0
let localQueue:Promise<unknown>=Promise.resolve()
export type DeckSnapshot={deck:D.Deck;day:D.Day;sequence:number}
export function transactDeck(change?:(deck:D.Deck,now:Date)=>void):Promise<DeckSnapshot>{
 const work=()=>{
  const now=new Date(),day=D.dayKey(now),deck=D.load(localStorage,day),before=change?structuredClone(deck):undefined
  if(change){change(deck,now);assertCapacity(before!,deck)}
  if(localStorage.getItem(D.STORAGE_KEY)!==JSON.stringify(deck))D.persist(localStorage,deck)
  return{deck,day,sequence:++sequence}
 }
 const run=()=>navigator.locks?navigator.locks.request('daily-deck-write',work):work()
 const result=localQueue.then(run,run);localQueue=result.catch(()=>{});return result
}
