import { expect, test } from 'vitest'
import * as D from '../src/deck'
const day='2026-11-05'
const create=(kind:'today'|'habit',weekdays:number[]=[0,1,2,3,4,5,6]):D.Task=>({id:'custom',kind,title:'Organize photos',notes:'A little space',minutes:5,weekdays,created:day,archived:false})
const blank=():D.Deck=>({version:1,tasks:[],cards:[]})
test('old version-one data migrates in place without reset, reseeding, or changed history',()=>{
 const old=D.seed(day);old.cards[0].events.push({id:'history',action:'done',at:'2026-11-05T12:00:00Z',day,order:1})
 for(const task of old.tasks){delete task.kind;delete task.icon}
 for(const card of old.cards)delete card.icon
 const migrated=D.decode(JSON.stringify(old))
 expect(migrated.tasks.map(t=>t.id)).toEqual(old.tasks.map(t=>t.id));expect(migrated.cards.map(c=>c.id)).toEqual(old.cards.map(c=>c.id));expect(migrated.cards[0].events).toEqual(old.cards[0].events)
 expect(migrated.tasks.map(t=>t.icon)).toEqual(['walk','read','water']);expect(migrated.cards.map(c=>c.icon)).toEqual(['walk','read','water']);expect(D.pending(migrated,day)).toHaveLength(2)
 expect(D.decode(JSON.stringify(migrated))).toEqual(migrated)
})
test('unrelated legacy and custom tasks always get neutral visuals',()=>{const d=blank();const task=create('today',[]);delete task.kind;D.saveTask(d,task,day);delete d.tasks[0].icon;delete d.cards[0].icon;const migrated=D.decode(JSON.stringify(d));expect(migrated.tasks[0].icon).toBe('neutral');expect(migrated.cards[0].icon).toBe('neutral')})
test('Today only normalizes stale weekday selections and never becomes a habit',()=>{const d=blank();D.saveTask(d,create('today'),day);expect(d.tasks[0].weekdays).toEqual([]);expect(D.isHabit(d.tasks[0])).toBe(false);expect(d.cards).toHaveLength(1);expect(d.cards[0].habit).toBe(false);D.roll(d,'2026-11-08');expect(d.cards).toHaveLength(1)})
test('new recurring habit scheduled today creates exactly one immediate occurrence',()=>{const d=blank();const t=create('habit',[D.dateOf(day).getDay()]);for(let i=0;i<4;i++){D.saveTask(d,t,day);D.roll(d,day)}expect(d.tasks).toHaveLength(1);expect(D.isHabit(d.tasks[0])).toBe(true);expect(d.cards).toHaveLength(1);expect(d.cards[0].habit).toBe(true)})
test('new recurring habit on another weekday has no card today',()=>{const d=blank();D.saveTask(d,create('habit',[5]),day);expect(d.tasks).toHaveLength(1);expect(d.cards).toHaveLength(0);D.roll(d,'2026-11-06');expect(d.cards).toHaveLength(1)})
test('a recurring habit must have at least one valid weekday',()=>{expect(()=>D.saveTask(blank(),create('habit',[]),day)).toThrow('weekday');expect(()=>D.saveTask(blank(),create('habit',[8]),day)).toThrow('weekday')})
test('historical visuals remain snapshots while today and future occurrences get edited visuals',()=>{
 const d=blank();const t={...create('habit'),icon:'read' as const,photoId:'old-photo'};D.saveTask(d,t,day);D.roll(d,'2026-11-06');const oldCard=structuredClone(d.cards[0]);const todayCard=d.cards[1]
 D.saveTask(d,{...d.tasks[0],title:'New title',icon:'water',photoId:'new-photo'},'2026-11-06')
 expect(d.cards[0]).toEqual(oldCard);expect(D.appearance(todayCard,'2026-11-06')).toEqual({icon:'water',photoId:'new-photo'});expect(todayCard.title).toBe(t.title)
 D.roll(d,'2026-11-07');expect(d.cards[2].photoId).toBe('new-photo');expect(d.cards[2].title).toBe('New title')
})
test('removing a carried-task photo does not remove its earlier dated appearance',()=>{const d=blank();D.saveTask(d,{...create('today',[]),photoId:'old-photo',icon:'read'},day);D.saveTask(d,{...d.tasks[0],photoId:undefined},'2026-11-06');expect(D.appearance(d.cards[0],day).photoId).toBe('old-photo');expect(D.appearance(d.cards[0],'2026-11-06').photoId).toBeUndefined()})
test('photo references and appearances survive JSON persistence without embedding image bytes',()=>{const d=blank();D.saveTask(d,{...create('today',[]),photoId:'photo-123',icon:'water'},day);const raw=JSON.stringify(d);expect(raw).not.toContain('data:image');expect(D.decode(raw)).toEqual(d)})
test('existing task type cannot be converted and rewritten over old occurrences',()=>{const d=blank();D.saveTask(d,create('habit'),day);const old=structuredClone(d);expect(()=>D.saveTask(d,{...d.tasks[0],kind:'today',weekdays:[]},day)).toThrow('type');expect(d).toEqual(old)})
test('a new task drafted before midnight is created on the day it is actually saved',()=>{const d=blank();D.saveTask(d,create('today',[]),'2026-11-06');expect(d.tasks[0].created).toBe('2026-11-06');expect(d.cards[0].day).toBe('2026-11-06');expect(D.history(d,day,'2026-11-06')).toHaveLength(0)})
