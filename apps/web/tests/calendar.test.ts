import {expect,it} from 'vitest'
import {nextLocalMidnight} from '../src/calendar'
process.env.TZ='America/New_York'
it('midnight follows the local calendar rather than UTC',()=>{expect(new Date(nextLocalMidnight(new Date('2026-11-05T17:00:00Z')))).toEqual(new Date('2026-11-06T05:00:00Z'))})
it('the midnight alarm handles both DST transition lengths',()=>{expect(new Date(nextLocalMidnight(new Date('2026-03-08T05:30:00Z')))).toEqual(new Date('2026-03-09T04:00:00Z'));expect(new Date(nextLocalMidnight(new Date('2026-11-01T04:30:00Z')))).toEqual(new Date('2026-11-02T05:00:00Z'))})
