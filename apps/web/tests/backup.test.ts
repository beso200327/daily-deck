import {describe,it,expect} from 'vitest'
import * as D from '../src/deck'
import {mergeBackup,validateBackupDeck} from '../src/backup'
const seed=()=>D.seed('2026-11-05')
describe('non-destructive backup validation and merging',()=>{
 it('preserves IDs, snapshots, events and repeat import identity',()=>{const deck=seed();D.act(deck,deck.cards[0].id,'later',new Date(2026,10,5,10));D.act(deck,deck.cards[0].id,'done',new Date(2026,10,5,11));const imported=validateBackupDeck(deck);expect(imported).toEqual(deck);expect(mergeBackup(deck,imported)).toEqual(deck)})
 it('adds missing records without replacing existing records',()=>{const first=seed(),other=seed();const merged=mergeBackup(first,other);expect(merged.tasks).toHaveLength(6);expect(merged.cards.slice(0,3)).toEqual(first.cards);expect(first.tasks).toHaveLength(3)})
 it('rejects duplicate IDs, missing task relations and duplicate occurrences',()=>{for(const mutate of [(d:D.Deck)=>d.tasks.push(d.tasks[0]),(d:D.Deck)=>Object.assign(d.tasks[0],{unexpectedPrivateField:'reject'}),(d:D.Deck)=>d.cards[0].taskId='missing',(d:D.Deck)=>d.cards.push({...d.cards[0],id:'new-id'})]){const d=seed();mutate(d);expect(()=>validateBackupDeck(d)).toThrow()}})
 it('rejects invalid durations, sequences and undo targets',()=>{let d=seed();d.tasks[0].minutes=-2;expect(()=>validateBackupDeck(d)).toThrow();d=seed();D.act(d,d.cards[0].id,'done',new Date(2026,10,5));d.cards[0].events[0].sequence=NaN;expect(()=>validateBackupDeck(d)).toThrow();d.cards[0].events=[{id:'undo',action:'undo',target:'missing',at:new Date().toISOString(),day:'2026-11-05',order:1}];expect(()=>validateBackupDeck(d)).toThrow()})
 it('accepts a strict event prefix but rejects diverged events and edited task conflicts',()=>{const d=seed(),longer=structuredClone(d);D.act(longer,longer.cards[0].id,'later',new Date(2026,10,5));expect(mergeBackup(d,longer)).toEqual(longer);expect(mergeBackup(longer,d)).toEqual(longer);const conflicting=structuredClone(d);conflicting.tasks[0].title='Different edit';expect(()=>mergeBackup(d,conflicting)).toThrow('conflicts');expect(d.tasks[0].title).toBe('Walk for 20 minutes')})
})
