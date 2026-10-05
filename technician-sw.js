const CACHE='minarva-technician-shell-v1';
const CORE=[
  '/technician',
  '/technician.html',
  '/technician.webmanifest',
  '/technician-icon.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(async url=>{
      const response=await fetch(url,{cache:'reload'});
      if(response.ok||response.type==='opaque')await cache.put(url,response.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(n=>n.startsWith('minarva-technician-shell-')&&n!==CACHE).map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);

  if(url.hostname==='kwullzwhlzziosjsejud.supabase.co')return;

  if(req.mode==='navigate'&&url.pathname.startsWith('/technician')){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req);
        const cache=await caches.open(CACHE);
        if(fresh.ok)cache.put('/technician.html',fresh.clone());
        return fresh;
      }catch{
        return (await caches.match('/technician.html'))||(await caches.match('/technician'));
      }
    })());
    return;
  }

  const isShell=url.origin===self.location.origin&&(
    url.pathname==='/technician.html'||url.pathname==='/technician.webmanifest'||url.pathname==='/technician-icon.svg'
  );
  const isSupabaseLib=url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('/@supabase/supabase-js@');

  if(isShell||isSupabaseLib){
    event.respondWith((async()=>{
      const cached=await caches.match(req);
      if(cached)return cached;
      const fresh=await fetch(req);
      if(fresh.ok||fresh.type==='opaque'){
        const cache=await caches.open(CACHE);
        cache.put(req,fresh.clone());
      }
      return fresh;
    })());
  }
});