import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
// Every production build gets an immutable shell cache. New workers wait for explicit consent.
export default defineConfig({plugins:[{
  name:'daily-deck-offline-shell',
  generateBundle(_options,bundle) {
    const assets=Object.keys(bundle).filter(name=>!name.endsWith('.map'))
    const staticInputs=['index.html','public/manifest.webmanifest','public/icon.svg','public/pwa-192.png','public/pwa-512.png','public/apple-touch-icon.png','public/THIRD-PARTY-NOTICES.txt'].map(path=>readFileSync(path).toString('base64')).join('')
    const fingerprint=createHash('sha256').update(staticInputs+JSON.stringify(assets)+JSON.stringify(Object.values(bundle).map(b=>b.type==='chunk'?b.code:b.source))).digest('hex').slice(0,16)
    const urls=['/',...assets.filter(name=>name!=='index.html').map(name=>`/${name}`),'/manifest.webmanifest','/icon.svg','/pwa-192.png','/pwa-512.png','/apple-touch-icon.png','/THIRD-PARTY-NOTICES.txt']
    this.emitFile({type:'asset',fileName:'sw.js',source:`
const CACHE='daily-deck-shell-${fingerprint}';
const URLS=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const previous=(await caches.keys()).filter(key=>key.startsWith('daily-deck-shell-')&&key!==CACHE);
 await Promise.all(previous.slice(0,-1).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('/'))||fetch(request)));return;
 }
 // Only immutable build assets and install icons use cache-first. No user data or APIs are cached.
 if(URLS.includes(new URL(request.url).pathname))event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});
`})
  }
}]})
