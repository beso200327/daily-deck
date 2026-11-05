import {it,expect} from 'vitest'
import * as D from '../src/deck'
import {usage} from '../src/limits'
const day='2026-11-05',now=new Date(2026,10,5,12)
it('deletion is ID-based, retains past photos and terminal records and cancels future pending cards',()=>{
 for(const action of ['later','done','skip'] as const){
 const d=D.seed('2026-11-04'),id=d.tasks[0].id;d.tasks[0].photoId='historical-photo';D.roll(d,'2026-11-07');const past=structuredClone(d.cards.filter(c=>c.taskId===id&&c.day<day));const today=d.cards.find(c=>c.taskId===id&&c.day===day)!;D.act(d,today.id,action,now)
 D.saveTask(d,{id:'unrelated',kind:'today',title:d.tasks[0].title,notes:'',minutes:null,weekdays:[],created:day,archived:false},day)
 const terminal=structuredClone(today);D.removeTask(d,id,now);expect(usage(d).habits).toBe(2);expect(d.cards.filter(c=>c.taskId===id&&c.day<day)).toEqual(past);expect(D.pending(d,day).some(c=>c.taskId===id)).toBe(false);expect(D.pending(d,day).some(c=>c.taskId==='unrelated')).toBe(true);expect(D.outcome(today,day,day)).toBe(action==='later'?'deleted':action==='done'?'completed':'skipped');if(action!=='later'){expect(today).toEqual(terminal);expect(D.undo(d,terminal.events.at(-1)!.id,now)).toBe(false);expect(D.undoToken(d,day)).toBeUndefined();}expect(d.cards.find(c=>c.taskId===id&&c.day==='2026-11-07')?.photoId).toBe('historical-photo');const records=structuredClone(d.cards);D.removeTask(d,id,now);expect(d.cards).toEqual(records);const count=d.cards.filter(c=>c.taskId===id).length;const reopened=D.load({getItem:()=>JSON.stringify(d)},'2026-11-12');expect(reopened.cards.filter(c=>c.taskId===id)).toHaveLength(count);expect(D.pending(reopened,'2026-11-07').some(c=>c.taskId===id)).toBe(false)
 }
})
it('an unscheduled habit archives without changing unrelated cards',()=>{const d=D.seed(day);D.saveTask(d,{id:'fri',kind:'habit',title:'Friday',notes:'',minutes:null,weekdays:[5],created:day,archived:false},day);const before=structuredClone(d.cards);D.removeTask(d,'fri',now);D.roll(d,'2026-11-06');expect(d.cards.filter(c=>c.taskId==='fri')).toHaveLength(0);expect(d.cards.slice(0,3)).toEqual(before)})
