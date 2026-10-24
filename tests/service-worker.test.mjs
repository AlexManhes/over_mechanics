import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function worker({offline=false,brokenCache=false}={}) {
  const handlers={},stored=new Map();
  const cache={
    async addAll(paths){for(const p of paths)stored.set(p,new Response(p==='/styles.css'?'body { color: green; }':p==='/manifest.webmanifest'?'{}':'shell'));},
    async match(request){return stored.get(new URL(request.url).pathname)?.clone();},
    async put(request,response){stored.set(new URL(request.url).pathname,response);}
  };
  const sandbox={URL,Request,Response,
    self:{location:{origin:'http://localhost:3000'},addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
    caches:{open:async()=>{if(brokenCache)throw new Error('cache indisponível');return cache;},keys:async()=>[],delete:async()=>true},
    fetch:async()=>{if(offline)throw new Error('servidor desligado');return new Response('network',{status:200});}
  };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),sandbox);
  return {handlers,cache,request(path){let promise;handlers.fetch({request:new Request('http://localhost:3000'+path),respondWith:p=>promise=p});return promise;}};
}
test('CSS e manifesto completos são servidos do cache mesmo sem servidor e com URL versionada',async()=>{
  const w=worker({offline:true});let install;
  w.handlers.install({waitUntil:p=>install=p});await install;
  const css=await w.request('/styles.css?v=1.1.2');assert.equal(css.status,200);assert.match(await css.text(),/color: green/);
  assert.equal((await w.request('/manifest.webmanifest?v=1.1.2')).status,200);
  assert.equal(w.request('/api/data'),undefined);
});
test('cache vazio e servidor ausente geram resposta explícita; falha do cache não bloqueia rede',async()=>{
  const w=worker({offline:true});
  const css=await w.request('/styles.css');assert.equal(css.status,503);assert.match(css.headers.get('content-type'),/text\/css/);
  const manifest=await w.request('/manifest.webmanifest');assert.equal(manifest.status,503);assert.match(manifest.headers.get('content-type'),/manifest\+json/);
  const response=await worker({brokenCache:true}).request('/styles.css');assert.equal(response.status,200);assert.equal(await response.text(),'network');
});
