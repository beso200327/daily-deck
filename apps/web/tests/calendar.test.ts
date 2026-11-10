import {expect,it,vi} from 'vitest'
import {nextLocalMidnight,watchLocalCalendar} from '../src/calendar'
process.env.TZ='America/New_York'
it('midnight follows the local calendar rather than UTC',()=>{expect(new Date(nextLocalMidnight(new Date('2026-11-05T17:00:00Z')))).toEqual(new Date('2026-11-06T05:00:00Z'))})
it('the midnight alarm handles both DST transition lengths',()=>{expect(new Date(nextLocalMidnight(new Date('2026-03-08T05:30:00Z')))).toEqual(new Date('2026-03-09T04:00:00Z'));expect(new Date(nextLocalMidnight(new Date('2026-11-01T04:30:00Z')))).toEqual(new Date('2026-11-02T05:00:00Z'))})

it('reconnect and foreground reconcile, and cleanup removes the online listener and timers',()=>{
 vi.useFakeTimers()
 const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'})
 vi.stubGlobal('window',win);vi.stubGlobal('document',doc)
 try{const refresh=vi.fn(),stop=watchLocalCalendar(refresh);expect(refresh).toHaveBeenCalledTimes(1)
 win.dispatchEvent(new Event('online'));expect(refresh).toHaveBeenCalledTimes(2)
 doc.dispatchEvent(new Event('visibilitychange'));expect(refresh).toHaveBeenCalledTimes(3)
 stop();win.dispatchEvent(new Event('online'));vi.advanceTimersByTime(60_000);expect(refresh).toHaveBeenCalledTimes(3)
 }finally{vi.unstubAllGlobals();vi.useRealTimers()}
})
