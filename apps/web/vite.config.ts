import { defineConfig, loadEnv } from 'vite'
import {readSupabaseConfiguration} from './src/supabase-config'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
// Every production build gets an immutable shell cache. New workers wait for explicit consent.
export default defineConfig(({mode,command})=>{
 const configuration=readSupabaseConfiguration(loadEnv(mode,process.cwd(),'VITE_SUPABASE_'))
 // Fail closed before emitting browser assets if a privileged key is misconfigured.
 if(command==='build'&&configuration.status==='invalid')throw new Error(configuration.message)
 const connect=configuration.status==='configured'?`connect-src 'self' ${configuration.url}`:"connect-src 'self'"
 return {define:{__DAILY_DECK_AUTH_PREVIEW__:JSON.stringify(process.env.VERCEL_ENV==='preview'||mode==='auth-test')},plugins:[{name:'daily-deck-supabase-csp',apply:'build',transformIndexHtml(){return[{tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:connect},injectTo:'head-prepend'}]}},{
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
self.addEventListener('notificationclick',event=>{
 if(event.notification.data?.kind!=='test')return;
 event.notification.close();
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);if(existing)await existing.focus();else await self.clients.openWindow('/');})());
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 // Auth callback URLs must reach the no-store response and never enter the shell cache.
 if(new URL(request.url).pathname==='/auth/callback')return;
 if(request.mode==='navigate'){
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match('/'))||fetch(request)));return;
 }
 // Only immutable build assets and install icons use cache-first. No user data or APIs are cached.
 if(URLS.includes(new URL(request.url).pathname))event.respondWith(caches.match(request).then(hit=>hit||fetch(request)));
});
`})
  }
}]}
})
