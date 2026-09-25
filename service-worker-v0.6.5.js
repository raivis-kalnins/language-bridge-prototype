const CACHE='language-bridge-v0.6.5';
const CORE=['./','./index.php','./repair.html','./assets/app-v0.6.5.css','./assets/app-v0.6.5.js','./data/words.json','./manifest.webmanifest','./assets/icons/language-bridge-64.png','./assets/icons/language-bridge-192.png','./assets/icons/language-bridge-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(CORE.map(x=>new Request(x,{cache:'reload'})));await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const k of await caches.keys()){if(k.startsWith('language-bridge')&&k!==CACHE)await caches.delete(k);}await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='CLEAR_APP_CACHE'){event.waitUntil((async()=>{for(const k of await caches.keys()){if(k.startsWith('language-bridge'))await caches.delete(k);}await self.registration.unregister();event.source?.postMessage?.({type:'CACHE_CLEARED'});})());}});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==location.origin||url.pathname.includes('/api/'))return;
 if(url.searchParams.has('fresh')||url.pathname.endsWith('/version.json')||url.pathname.endsWith('/repair.html')){
  event.respondWith(fetch(event.request,{cache:'no-store'}));return;
 }
 event.respondWith((async()=>{
  try{const res=await fetch(event.request,{cache:'no-store'});if(res&&res.ok){const c=await caches.open(CACHE);c.put(event.request,res.clone()).catch(()=>{});}return res;}
  catch(_){return (await caches.match(event.request))||(event.request.mode==='navigate'?await caches.match('./'):Response.error());}
 })());
});
