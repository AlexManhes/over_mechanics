import api from './api.mjs';
import {textDigest} from './supabase.mjs';
export function edgeHandler(env,service=api){
 return async request=>{
  const supplied=request.headers.get('x-mj-proxy-key')||'';
  if(!env.CLOUD_PROXY_KEY||env.CLOUD_PROXY_KEY.length<32||supplied.length>256||await textDigest(supplied)!==await textDigest(env.CLOUD_PROXY_KEY))return new Response('{"error":"Acesso não autorizado."}',{status:403,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const url=new URL(request.url),index=url.pathname.indexOf('/api/');
  if(index>=0)url.pathname=url.pathname.slice(index);
  else if(url.pathname.endsWith('/healthz'))url.pathname='/healthz';
  else return new Response('Recurso não encontrado.',{status:404});
  return service.fetch(new Request(url,request),env);
 };
}
