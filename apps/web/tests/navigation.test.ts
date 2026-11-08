import {describe,it,expect} from 'vitest'
import {pageFromURL} from '../src/navigation'
describe('safe page routes',()=>{
 for(const page of ['today','habits','progress'])it(`restores ${page}`,()=>expect(pageFromURL(new URL('https://example.test/#'+page))).toBe(page[0].toUpperCase()+page.slice(1)))
 for(const route of ['/', '/#unknown','/auth/callback?code=secret#habits','/?access_token=secret#progress','/#access_token=secret','/?code=secret#habits'])it(`rejects ${route}`,()=>expect(pageFromURL(new URL('https://example.test'+route))).toBe('Today'))
})
