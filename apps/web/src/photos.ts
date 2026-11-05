import {storageSuffix} from './environment'
import {cropRect,clampCrop,defaultCrop,type Crop} from './crop'
const DB=`daily-deck-images${storageSuffix}`
const STORE='photos'
const EDITS='edits'
export type PhotoEdit = {source:Blob;width:number;height:number;crop:Crop}
export type EditedPhoto = PhotoEdit & {rendered:Blob}
function open():Promise<IDBDatabase> {
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(new Error('Photo storage is unavailable. You can still use an icon.'));return}
  let settled=false
  const request=indexedDB.open(DB,2)
  request.onupgradeneeded=()=>{for(const name of [STORE,EDITS])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name)}
  request.onerror=()=>{settled=true;reject(new Error('Could not open photo storage. Check site storage permissions.'))}
  request.onblocked=()=>{settled=true;reject(new Error('Photo storage is blocked. Close older Daily Deck tabs and try again.'))}
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();if(settled)db.close();else{settled=true;resolve(db)}}
 })
}
async function transact<T>(stores:string[],mode:IDBTransactionMode,operation:(tx:IDBTransaction)=>()=>T):Promise<T> {
 const db=await open()
 return new Promise((resolve,reject)=>{
  let tx:IDBTransaction
  try{tx=db.transaction(stores,mode)}catch{db.close();reject(new Error('Photo storage is unavailable. Please try again.'));return}
  let result:()=>T
  try{result=operation(tx)}catch{tx.abort();db.close();reject(new Error('Could not prepare photo storage. Your saved photo is unchanged.'));return}
  tx.oncomplete=()=>{db.close();resolve(result())}
  tx.onerror=tx.onabort=()=>{db.close();reject(new Error('Could not save or read this photo. Storage may be full or disabled. Your previous photo is unchanged.'))}
 })
}
export const putPhoto=(id:string,blob:Blob)=>transact([STORE],'readwrite',tx=>{tx.objectStore(STORE).put(blob,id);return()=>undefined})
export const getPhoto=(id:string):Promise<Blob|undefined>=>transact([STORE],'readonly',tx=>{const r=tx.objectStore(STORE).get(id);return()=>r.result})
export const deletePhoto=(id:string)=>transact([STORE,EDITS],'readwrite',tx=>{tx.objectStore(STORE).delete(id);tx.objectStore(EDITS).delete(id);return()=>undefined})
export const putEditedPhoto=(id:string,photo:EditedPhoto)=>transact([STORE,EDITS],'readwrite',tx=>{
 tx.objectStore(STORE).put(photo.rendered,id)
 tx.objectStore(EDITS).put({source:photo.source,width:photo.width,height:photo.height,crop:photo.crop},id)
 return()=>undefined
})
// Prefer bitmap/offscreen processing; retain a canvas fallback for older browsers.
function raster(width:number,height:number):HTMLCanvasElement|OffscreenCanvas {
 if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height)
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas
}
function encoded(canvas:HTMLCanvasElement|OffscreenCanvas,type:string,quality?:number):Promise<Blob|null>{
 return 'convertToBlob' in canvas?canvas.convertToBlob({type,quality}):new Promise(resolve=>canvas.toBlob(resolve,type,quality))
}
async function imageFrom(blob:Blob) {
 const url=URL.createObjectURL(blob),image=new Image()
 try{image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error();return image}
 catch{throw new Error('This photo could not be opened. Try a JPEG or PNG image.')}
 finally{URL.revokeObjectURL(url)}
}
export async function preparePhoto(file:File):Promise<PhotoEdit> {
 if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type))throw new Error('Choose a JPEG, PNG, WebP, or AVIF image. Export HEIC photos as JPEG first.')
 if(file.size>20*1024*1024)throw new Error('Choose a photo smaller than 20 MB.')
 if(!file.size)throw new Error('This image is empty. Choose another photo.')
 // Read only the explicitly selected file. Retain a normalized source without EXIF/GPS metadata.
 const image=await imageFrom(file)
 const width=image.naturalWidth,height=image.naturalHeight
 if(width*height>48_000_000)throw new Error('Choose an image with fewer than 48 megapixels.')
 const canvas=raster(width,height)
 const ctx=canvas.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null;if(!ctx)throw new Error('Your browser could not prepare this photo.')
 ctx.drawImage(image,0,0)
 const source=await encoded(canvas,'image/png')
 if(!source)throw new Error('This photo could not be prepared. Choose another photo.')
 return {source,width,height,crop:{...defaultCrop}}
}
export async function getPhotoEdit(id:string):Promise<PhotoEdit> {
 const stored=await transact<PhotoEdit|undefined>([EDITS],'readonly',tx=>{const r=tx.objectStore(EDITS).get(id);return()=>r.result})
 if(stored)return stored
 // Version-one photos are still valid blobs. Their available pixels become the editing source.
 const source=await getPhoto(id)
 if(!source)throw new Error('This saved photo is unavailable. Choose a replacement; your other task details are safe.')
 const image=await imageFrom(source)
 return {source,width:image.naturalWidth,height:image.naturalHeight,crop:{...defaultCrop}}
}
export async function renderPhoto(photo:PhotoEdit):Promise<EditedPhoto> {
 const image=typeof createImageBitmap==='function'?await createImageBitmap(photo.source,{imageOrientation:'from-image'}):await imageFrom(photo.source)
 try{const crop=clampCrop(photo.width,photo.height,photo.crop),rect=cropRect(photo.width,photo.height,crop)
 let width=Math.max(2,Math.floor(Math.min(1200,rect.width)/2)*2)
 for(let attempt=0;attempt<7;attempt++){
  const canvas=raster(width,width/2)
  const ctx=canvas.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null;if(!ctx)throw new Error('Your browser could not prepare this photo.')
  ctx.fillStyle='#faf6ed';ctx.fillRect(0,0,canvas.width,canvas.height)
  // HTMLImageElement decoding honors EXIF orientation; the new JPEG strips source metadata.
  ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height,0,0,canvas.width,canvas.height)
  const rendered=await encoded(canvas,'image/jpeg',Math.max(.55,.86-attempt*.05))
  if(!rendered)throw new Error('This image could not be cropped. Please try another.')
  if(rendered.size<=1024*1024)return {...photo,crop,rendered}
  width=Math.max(2,Math.floor(width*.8/2)*2)
 }
 throw new Error('This crop is still too large. Please choose a smaller image.')
 }finally{if('close' in image)image.close()}
}
// Kept for callers that need a default compressed crop; interactive selection uses the editor first.
export async function compressPhoto(file:File):Promise<Blob>{return (await renderPhoto(await preparePhoto(file))).rendered}

export type StoredPhoto={id:string;rendered:Blob;edit?:PhotoEdit}
export const listPhotos=()=>transact<StoredPhoto[]>([STORE,EDITS],'readonly',tx=>{
 const keys=tx.objectStore(STORE).getAllKeys(),photos=tx.objectStore(STORE).getAll(),edits=tx.objectStore(EDITS).getAll(),editKeys=tx.objectStore(EDITS).getAllKeys()
 return()=>keys.result.map((id,i)=>({id:String(id),rendered:photos.result[i],edit:edits.result[editKeys.result.indexOf(id)]}))
})
export const addPhotos=(photos:StoredPhoto[])=>transact([STORE,EDITS],'readwrite',tx=>{
 for(const photo of photos){tx.objectStore(STORE).add(photo.rendered,photo.id);if(photo.edit)tx.objectStore(EDITS).add(photo.edit,photo.id)}return()=>undefined
})
export const clearPhotos=()=>transact([STORE,EDITS],'readwrite',tx=>{tx.objectStore(STORE).clear();tx.objectStore(EDITS).clear();return()=>undefined})
