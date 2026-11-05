export const CROP_ASPECT = 2
export type Crop = {x: number; y: number; zoom: number}
export const defaultCrop: Crop = {x:.5,y:.5,zoom:1}
export function cropRect(width: number,height: number,input: Crop) {
  const zoom=Math.max(1,Math.min(4,Number.isFinite(input.zoom)?input.zoom:1))
  const w=Math.min(width,height*CROP_ASPECT)/zoom,h=w/CROP_ASPECT
  const cx=Math.max(w/2,Math.min(width-w/2,(Number.isFinite(input.x)?input.x:.5)*width))
  const cy=Math.max(h/2,Math.min(height-h/2,(Number.isFinite(input.y)?input.y:.5)*height))
  return {x:cx-w/2,y:cy-h/2,width:w,height:h,zoom}
}
export function clampCrop(width:number,height:number,input:Crop):Crop {
 const r=cropRect(width,height,input);return {x:(r.x+r.width/2)/width,y:(r.y+r.height/2)/height,zoom:r.zoom}
}
export function panCrop(width:number,height:number,crop:Crop,dx:number,dy:number,frameWidth:number):Crop {
 const r=cropRect(width,height,crop),scale=frameWidth/r.width
 return clampCrop(width,height,{x:crop.x-dx/scale/width,y:crop.y-dy/scale/height,zoom:crop.zoom})
}
export function pinchCrop(width:number,height:number,crop:Crop,ratio:number,oldPoint:{x:number;y:number},newPoint:{x:number;y:number},frameWidth:number):Crop {
 const old=cropRect(width,height,crop),zoom=Math.max(1,Math.min(4,crop.zoom*ratio)),next=cropRect(width,height,{...crop,zoom})
 const anchorX=old.x+oldPoint.x/frameWidth*old.width,anchorY=old.y+oldPoint.y/frameWidth*old.width
 return clampCrop(width,height,{zoom,x:(anchorX-newPoint.x/frameWidth*next.width+next.width/2)/width,y:(anchorY-newPoint.y/frameWidth*next.width+next.height/2)/height})
}
