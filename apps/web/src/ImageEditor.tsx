import {useEffect,useRef,useState} from 'react'
import {Modal} from './Modal'
import {clampCrop,cropRect,defaultCrop,panCrop,pinchCrop,type Crop} from './crop'
import {renderPhoto,type PhotoEdit,type EditedPhoto} from './photos'
type Point={x:number;y:number}
export function ImageEditor({photo,cancel,use}:{photo:PhotoEdit;cancel:()=>void;use:(photo:EditedPhoto)=>void}) {
 const [crop,setCrop]=useState<Crop>(photo.crop),cropRef=useRef(crop)
 const [url,setUrl]=useState(''),[width,setWidth]=useState(280),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const frame=useRef<HTMLDivElement>(null),points=useRef(new Map<number,Point>()),gesture=useRef<{crop:Crop;points:Point[]} | null>(null)
 useEffect(()=>{const url=URL.createObjectURL(photo.source);setUrl(url);return()=>URL.revokeObjectURL(url)},[photo.source])
 useEffect(()=>{const el=frame.current!;const observer=new ResizeObserver(()=>{points.current.clear();gesture.current=null;setWidth(el.clientWidth)});observer.observe(el);setWidth(el.clientWidth);return()=>observer.disconnect()},[])
 function update(next:Crop){const value=clampCrop(photo.width,photo.height,next);cropRef.current=value;setCrop(value)}
 function rebase(){gesture.current={crop:{...cropRef.current},points:[...points.current.values()].map(p=>({...p}))}}
 function local(e:{clientX:number;clientY:number}):Point {const r=frame.current!.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
 function move(){const start=gesture.current,current=[...points.current.values()];if(!start||!current.length)return
  if(current.length>=2&&start.points.length>=2){const [a,b]=start.points,[c,d]=current;const distance=Math.hypot(b.x-a.x,b.y-a.y);const ratio=distance?Math.hypot(d.x-c.x,d.y-c.y)/distance:1;update(pinchCrop(photo.width,photo.height,start.crop,ratio,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},{x:(c.x+d.x)/2,y:(c.y+d.y)/2},width))}
  else if(current.length===1&&start.points.length===1)update(panCrop(photo.width,photo.height,start.crop,current[0].x-start.points[0].x,current[0].y-start.points[0].y,width))
 }
 const rect=cropRect(photo.width,photo.height,crop),scale=width/rect.width
 return <Modal title="Adjust photo" close={()=>{if(!busy)cancel()}} initialFocus="heading" restoreFocus={false}><p className="crop-guidance">Drag to reposition. Pinch or use the slider to zoom. This frame matches your task photo.</p>
  <div ref={frame} className="crop-frame" aria-label="Photo crop frame" data-testid="crop-frame"
   onPointerDown={e=>{if(busy||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();points.current.set(e.pointerId,local(e));e.currentTarget.setPointerCapture(e.pointerId);rebase()}}
   onPointerMove={e=>{if(!points.current.has(e.pointerId)||busy)return;points.current.set(e.pointerId,local(e));move()}}
   onPointerUp={e=>{points.current.delete(e.pointerId);rebase()}} onPointerCancel={e=>{points.current.delete(e.pointerId);rebase()}} onLostPointerCapture={e=>{points.current.delete(e.pointerId);rebase()}}>
   {url&&<img src={url} alt="Photo being adjusted" draggable={false} style={{width:photo.width*scale,height:photo.height*scale,left:-rect.x*scale,top:-rect.y*scale}}/>}<div className="crop-grid" aria-hidden="true"/>
  </div>
  <label className="zoom-label">Zoom <output>{crop.zoom.toFixed(1)}×</output><input aria-label="Photo zoom" type="range" min="1" max="4" step="0.01" value={crop.zoom} disabled={busy} onChange={e=>update({...crop,zoom:Number(e.target.value)})}/></label>
  <p className="footnote">Only the photo you select is added. It stays on this device.</p>{error&&<p role="alert" className="field-error">{error}</p>}
  <div className="crop-actions"><button className="secondary" disabled={busy} onClick={()=>update({...defaultCrop})}>Reset</button><button className="secondary" disabled={busy} onClick={cancel}>Cancel</button><button className="primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{use(await renderPhoto({...photo,crop:cropRef.current}))}catch(e){setError(e instanceof Error?e.message:'Could not crop photo.');setBusy(false)}}}>{busy?'Preparing…':'Use photo'}</button></div>
 </Modal>
}
