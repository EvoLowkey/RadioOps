const CACHE_NAME='valet-radio-hq-shell-v19';
const STATIC_SHELL=['/','/index.html','/styles.css','/manifest.webmanifest','/src/app.js','/src/api.js','/src/config.js','/src/permissions.js','/src/accountability.js','/src/shift-policy.js','/src/scanner.js','/src/state.js','/src/supabase-client.js','/src/view-models.js','/src/reset-password.js','/auth/reset-password.html','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/branding/valet-radio-hq-logo.png','/branding/valet-radio-hq-mark.png','/branding/favicon-64.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method !== 'GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')) return;
  if(!STATIC_SHELL.includes(url.pathname) && url.pathname!=='/auth/callback' && url.pathname!=='/auth/callback.html' && url.pathname!=='/auth/reset-password' && url.pathname!=='/auth/reset-password.html') return;
  event.respondWith(fetch(request).then(response=>{if(response.ok && STATIC_SHELL.includes(url.pathname)){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;}).catch(()=>caches.match(request).then(cached=>cached||caches.match('/index.html'))));
});
