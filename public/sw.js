const CACHE='mecanica-ja-v5-online';
const SHELL=['/','/index.html','/app.js','/photos.js','/styles.css','/domain.mjs','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mecanica-ja-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

async function shellResponse(request) {
  const url=new URL(request.url);
  // O shell é versionado no install. CSS/manifesto já completos não dependem
  // de o processo Node estar ligado para serem lidos novamente.
  let cache;
  try {cache=await caches.open(CACHE);const saved=await cache.match(request,{ignoreSearch:true});if(saved)return saved;} catch {}
  try {
    const response=await fetch(request);
    if(response.ok&&cache){try{await cache.put(request,response.clone());}catch{}}
    return response;
  } catch {
    // Cache vazio/corrompido: devolve uma resposta explícita, nunca undefined.
    if(url.pathname.endsWith('.css'))return new Response('/* Servidor indisponível; inicie Iniciar.bat. */',{status:503,headers:{'Content-Type':'text/css; charset=utf-8'}});
    if(url.pathname.endsWith('.webmanifest'))return new Response('{"name":"Mecânica já","start_url":"/","display":"standalone"}',{status:503,headers:{'Content-Type':'application/manifest+json'}});
    return new Response('Servidor indisponível. Abra Iniciar.bat, mantenha a janela aberta e atualize a página.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
}
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
  if(!SHELL.includes(u.pathname))return;
  e.respondWith(shellResponse(e.request));
});
