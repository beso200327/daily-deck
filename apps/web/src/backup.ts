import * as D from './deck'
import {addPhotos,deletePhoto,listPhotos,clearPhotos,type StoredPhoto} from './photos'
const LIMIT=64*1024*1024
const FILE_LIMIT=96*1024*1024
const fail=()=>new Error('This backup is invalid or unsupported. Your current deck has not been changed.')
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
function stable(v:unknown):string {if(Array.isArray(v))return `[${v.map(stable).join(',')}]`;if(plain(v))return `{${Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;return JSON.stringify(v)}
export function validateBackupDeck(value:unknown):D.Deck {
 const deck=D.decode(JSON.stringify(value)),tasks=new Set<string>(),cards=new Set<string>(),events=new Set<string>(),days=new Set<string>()
 const shape=(v:unknown,keys:string[])=>plain(v)&&Object.keys(v).every(k=>keys.includes(k))
 if(!shape(deck,['version','tasks','cards'])||deck.tasks.length>100000||deck.cards.length>200000)throw fail()
 const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max
 const id=(v:unknown)=>text(v,199)&&(v as string).length>0
 for(const t of deck.tasks){if(!shape(t,['kind','icon','photoId','id','title','notes','minutes','weekdays','created','through','archived'])||new Set(t.weekdays).size!==t.weekdays.length||(t.kind==='today'&&t.weekdays.length>0)||(t.kind==='habit'&&!t.weekdays.length)||!id(t.id)||tasks.has(t.id)||!text(t.title,180)||!text(t.notes,3000)||(t.minutes!==null&&(!Number.isInteger(t.minutes)||t.minutes<1||t.minutes>1440)))throw fail();tasks.add(t.id)}
 for(const c of deck.cards){const pair=JSON.stringify([c.taskId,c.day]);if(!shape(c,['icon','photoId','appearances','id','taskId','title','notes','minutes','habit','day','initialOrder','events'])||c.appearances?.some(a=>!shape(a,['day','icon','photoId']))||!id(c.id)||cards.has(c.id)||!tasks.has(c.taskId)||days.has(pair)||!text(c.title,180)||!text(c.notes,3000)||(c.minutes!==null&&(!Number.isInteger(c.minutes)||c.minutes<1||c.minutes>1440)))throw fail();cards.add(c.id);days.add(pair)
  const seen=new Map<string,D.Event>();for(const e of c.events){if(!shape(e,['sequence','id','action','at','day','order','target'])||!id(e.id)||events.has(e.id)||(e.sequence!==undefined&&(!Number.isSafeInteger(e.sequence)||e.sequence<1))||(e.action==='undo'&&(!e.target||!seen.has(e.target)||!['done','later','skip'].includes(seen.get(e.target)!.action)))|| (e.action!=='undo'&&e.target!==undefined))throw fail();events.add(e.id);seen.set(e.id,e)}
 }
 return deck
}
async function encode(blob:Blob){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {type:blob.type,data:btoa(binary)}}
function decodeBlob(v:unknown):Blob {if(!plain(v)||!['image/jpeg','image/png','image/webp','image/avif'].includes(String(v.type))||typeof v.data!=='string'||!v.data.length||v.data.length>Math.ceil(LIMIT/3)*4||(v.data.length%4!==0||/[^A-Za-z0-9+/=]/.test(v.data)))throw fail();const b=atob(v.data);return new Blob([Uint8Array.from(b,c=>c.charCodeAt(0))],{type:String(v.type)})}
export async function exportBackup(storage:Storage=localStorage):Promise<Blob> {
 const raw=storage.getItem(D.STORAGE_KEY);if(raw===null)throw new Error('There is no saved deck to export yet.')
 const deck=validateBackupDeck(JSON.parse(raw)),photos=await listPhotos();if(photos.reduce((n,p)=>n+p.rendered.size+(p.edit?.source.size??0),0)>LIMIT)throw new Error('This photo library exceeds the 64 MB backup limit. No data was changed.')
 const refs=[...deck.tasks,...deck.cards,...deck.cards.flatMap(c=>c.appearances??[])].flatMap(c=>c.photoId?[c.photoId]:[]);if(refs.some(id=>!photos.some(p=>p.id===id)))throw new Error('Some saved photos are unavailable. No backup was exported and your current deck is unchanged.')
 const encoded=await Promise.all(photos.map(async p=>({id:p.id,rendered:await encode(p.rendered),...(p.edit?{edit:{...p.edit,source:await encode(p.edit.source)}}:{})})))
 const result=new Blob([JSON.stringify({format:'daily-deck-backup',version:1,exportedAt:new Date().toISOString(),deck,photos:encoded})],{type:'application/json'});if(result.size>FILE_LIMIT)throw new Error('This backup exceeds the 96 MB file limit. No data was changed.');return result
}
export async function readBackup(file:File):Promise<{deck:D.Deck;photos:StoredPhoto[]}> {
 if(file.size>FILE_LIMIT)throw new Error('Choose a Daily Deck backup smaller than 96 MB. Your current deck is unchanged.')
 try{
  const value:unknown=JSON.parse(await file.text());if(!plain(value)||value.format!=='daily-deck-backup'||value.version!==1||!Array.isArray(value.photos))throw fail()
  const deck=validateBackupDeck(value.deck),ids=new Set<string>();let bytes=0
  const photos:StoredPhoto[]=value.photos.map(p=>{if(!plain(p)||typeof p.id!=='string'||!p.id.length||p.id.length>=200||ids.has(p.id))throw fail();ids.add(p.id);const rendered=decodeBlob(p.rendered);let edit:StoredPhoto['edit']
   if(p.edit!==undefined){const e=p.edit;if(!plain(e)||!Number.isInteger(e.width)||!Number.isInteger(e.height)||Number(e.width)<1||Number(e.height)<1||Number(e.width)*Number(e.height)>48_000_000||!plain(e.crop)||!Object.values({x:e.crop.x,y:e.crop.y,zoom:e.crop.zoom}).every(n=>typeof n==='number'&&Number.isFinite(n))||Number(e.crop.x)<0||Number(e.crop.x)>1||Number(e.crop.y)<0||Number(e.crop.y)>1||Number(e.crop.zoom)<1||Number(e.crop.zoom)>4)throw fail();edit={source:decodeBlob(e.source),width:Number(e.width),height:Number(e.height),crop:{x:Number(e.crop.x),y:Number(e.crop.y),zoom:Number(e.crop.zoom)}}}
   bytes+=rendered.size+(edit?.source.size??0);if(bytes>LIMIT)throw fail();return{id:p.id,rendered,edit}
  })
  const refs=[...deck.tasks,...deck.cards,...deck.cards.flatMap(c=>c.appearances??[])].flatMap(c=>c.photoId?[c.photoId]:[]);if(refs.some(id=>!ids.has(id)))throw fail()
  // Decode pixels before accepting a backup; MIME labels alone do not prove image validity.
  for(const p of photos)for(const blob of [p.rendered,...(p.edit?[p.edit.source]:[])]){const url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();if(img.naturalWidth*img.naturalHeight>48_000_000)throw fail();if(p.edit&&blob===p.edit.source&&(img.naturalWidth!==p.edit.width||img.naturalHeight!==p.edit.height))throw fail()}finally{URL.revokeObjectURL(url)}}
  return{deck,photos}
 }catch{throw fail()}
}
export function mergeBackup(current:D.Deck,incoming:D.Deck):D.Deck {
 const result=structuredClone(current),conflict=()=>new Error('This backup conflicts with newer local records. Nothing was imported. Restore it in a separate browser profile to inspect it safely.')
 for(const t of incoming.tasks){const old=result.tasks.find(v=>v.id===t.id);if(!old){result.tasks.push(t);continue}const {through:a,...left}=old,{through:b,...right}=t;if(stable(left)!==stable(right))throw conflict();old.through=[a,b].filter(Boolean).sort().at(-1)}
 for(const c of incoming.cards){const old=result.cards.find(v=>v.id===c.id);if(!old){result.cards.push(c);continue}const {events:a,...left}=old,{events:b,...right}=c;if(stable(left)!==stable(right)||a.slice(0,Math.min(a.length,b.length)).some((e,i)=>stable(e)!==stable(b[i])))throw conflict();if(b.length>a.length)old.events=b}
 return validateBackupDeck(result)
}
async function sameBlob(a:Blob,b:Blob){if(a.type!==b.type||a.size!==b.size)return false;const x=new Uint8Array(await a.arrayBuffer()),y=new Uint8Array(await b.arrayBuffer());return x.every((n,i)=>n===y[i])}
export async function importBackup(backup:Awaited<ReturnType<typeof readBackup>>,storage:Storage=localStorage){
 const raw=storage.getItem(D.STORAGE_KEY),current=raw?validateBackupDeck(JSON.parse(raw)):{version:1 as const,tasks:[],cards:[]},merged=mergeBackup(current,backup.deck),existing=await listPhotos()
 const added:StoredPhoto[]=[]
 for(const photo of backup.photos){const old=existing.find(p=>p.id===photo.id);if(!old){added.push(photo);continue}if(!await sameBlob(old.rendered,photo.rendered)||stable(old.edit&&{...old.edit,source:undefined})!==stable(photo.edit&&{...photo.edit,source:undefined})||(old.edit&&photo.edit&&!await sameBlob(old.edit.source,photo.edit.source)))throw new Error('A saved photo conflicts with this backup. Nothing was imported.')}
 await addPhotos(added)
 try{D.persist(storage,merged)}catch{await Promise.all(added.map(p=>deletePhoto(p.id)));throw new Error('Could not save the imported deck. Existing data was preserved. Check available storage.')}
 return merged
}
export async function deleteLocalData(storage:Storage=localStorage){
 const raw=storage.getItem(D.STORAGE_KEY);D.persist(storage,{version:1,tasks:[],cards:[]})
 try{await clearPhotos()}catch(e){if(raw!==null)storage.setItem(D.STORAGE_KEY,raw);throw e}
}
export async function withDataLock<T>(body:()=>Promise<T>):Promise<T>{return navigator.locks?navigator.locks.request('daily-deck-write',body):body()}
