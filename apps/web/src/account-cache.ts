import {storageSuffix} from './environment'
function deleteDatabase(name:string){return new Promise<void>((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=()=>resolve();r.onerror=()=>reject(new Error('Could not clear account images. Retry cleanup.'));r.onblocked=()=>reject(new Error('Close other Daily Deck tabs and retry account image cleanup.'))})}
export async function clearAccountCache(owner:string){
 if(!/^[a-f0-9-]{36}$/i.test(owner))throw new Error('Invalid account scope')
 try{const marker=JSON.parse(sessionStorage.getItem('daily-deck.auth.recovery-ui.v1')??'null');if(marker?.userId===owner)sessionStorage.removeItem('daily-deck.auth.recovery-ui.v1')}catch{/* No recovery marker is needed for erasure. */}
 try{const intent=JSON.parse(sessionStorage.getItem('daily-deck.auth.delete-reauth.v1')??'null');if(intent?.owner===owner)sessionStorage.removeItem('daily-deck.auth.delete-reauth.v1')}catch{}
 const prefix=`daily-deck.cloud.${owner}.`
 for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key)
 if(globalThis.indexedDB){
  const names=typeof indexedDB.databases==='function'?(await indexedDB.databases()).map(d=>d.name).filter((s):s is string=>!!s):[`daily-deck-images${storageSuffix}.account-${owner}`]
  for(const name of names)if(name.startsWith('daily-deck-images')&&name.endsWith('.account-'+owner))await deleteDatabase(name)
  // Delete only this account's immutable transfer/backup copies, never the guest deck.
  await new Promise<void>((resolve,reject)=>{
   const r=indexedDB.open('daily-deck-cloud-transfers');r.onerror=()=>reject(new Error('Could not clear account transfer copies.'))
   r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('imports')){db.close();resolve();return}const tx=db.transaction('imports','readwrite'),c=tx.objectStore('imports').openCursor();c.onsuccess=()=>{const row=c.result;if(!row)return;if(row.value?.owner===owner&&(row.key===owner||String(row.key).startsWith(owner+'/')))row.delete();row.continue()};tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(new Error('Could not clear account transfer copies. Retry cleanup.'))}}
  })
 }
}
