import {test,expect} from 'vitest'
import {cropRect,clampCrop,defaultCrop,panCrop,pinchCrop} from '../src/crop'
test('crop frame is always 2:1 and stays within landscape portrait and square sources',()=>{
 for(const [w,h] of [[1800,900],[900,1800],[1000,1000],[1,1]])for(const zoom of [1,2,4])for(const [x,y] of [[0,0],[1,1],[.5,.5]]){const r=cropRect(w,h,{x,y,zoom});expect(r.width/r.height).toBe(2);expect(r.x).toBeGreaterThanOrEqual(0);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(w);expect(r.y+r.height).toBeLessThanOrEqual(h)}
})
test('zoom and pan clamp without exposing empty crop space',()=>{expect(clampCrop(1800,900,{x:-100,y:100,zoom:20})).toEqual({x:.125,y:.875,zoom:4});expect(clampCrop(1800,900,{x:NaN,y:NaN,zoom:NaN})).toEqual(defaultCrop);const r=panCrop(1800,900,{...defaultCrop,zoom:2},100000,-100000,300);expect(r.x).toBe(.25);expect(r.y).toBe(.75)})
test('pinch follows the source point under the gesture midpoint',()=>{const start={x:.5,y:.5,zoom:2};const next=pinchCrop(1800,900,start,1.5,{x:150,y:75},{x:170,y:80},300);const old=cropRect(1800,900,start),r=cropRect(1800,900,next);expect(next.zoom).toBe(3);expect(r.x+170/300*r.width).toBeCloseTo(old.x+150/300*old.width);expect(r.y+80/300*r.width).toBeCloseTo(old.y+75/300*old.width)})
test('crop metadata round-trips deterministically without mutating the original input',()=>{const input={x:.7,y:.4,zoom:2.3},before=structuredClone(input);expect(cropRect(1600,1000,JSON.parse(JSON.stringify(input)))).toEqual(cropRect(1600,1000,input));expect(input).toEqual(before)})
