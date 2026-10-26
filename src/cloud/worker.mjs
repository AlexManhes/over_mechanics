// Cloudflare entrega a PWA e encaminha a API por streaming, sem decodificar fotos.
const allowed=['/','/index.html','/app.js','/photos.js','/styles.css','/domain.mjs','/manifest.webmanifest','/sw.js','/icon.svg','/icon-192.png','/icon-512.png'];
export function createProxy(fetcher=fetch){return {async fetch(request,env){
  const url=new URL(request.url);let response;
  if(url.pathname.startsWith('/api/')||url.pathname==='/healthz'){
    if(!env.SUPABASE_URL||!env.CLOUD_PROXY_KEY||env.CLOUD_PROXY_KEY.length<32)response=error('A versão online ainda precisa ser configurada.',503);
    else if(!['GET','POST'].includes(request.method))response=error('Método não permitido.',405);
    else if(request.method==='POST'&&((request.headers.get('origin')&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site'))response=error('Origem não autorizada.',403);
    else if(Number(request.headers.get('content-length'))>34000000)response=error('Limite de 34 MB por envio excedido.',413);
    else{try{
      const target=new URL(env.SUPABASE_URL);
      if(target.protocol!=='https:'||target.pathname!=='/'||target.username||target.password)throw 0;
      target.pathname='/functions/v1/workshop'+url.pathname;target.search=url.search;
      const headers=new Headers();
      for(const key of ['content-type','cookie','origin','sec-fetch-site'])if(request.headers.has(key))headers.set(key,request.headers.get(key));
      headers.set('x-mj-proxy-key',env.CLOUD_PROXY_KEY);
      headers.set('x-mj-client-ip',request.headers.get('cf-connecting-ip')||'unknown');
      response=await fetcher(target,{method:request.method,headers,body:request.method==='POST'?request.body:undefined,redirect:'manual'});
      if(response.status>=300&&response.status<400)response=error('Configuração da API indisponível.',503);
    }catch{response=error('Não foi possível conectar ao servidor da oficina. Tente novamente.',503);}}
  }else if(['GET','HEAD'].includes(request.method)&&allowed.includes(url.pathname)&&env.ASSETS)response=await env.ASSETS.fetch(request);
  else response=error('Página não encontrada.',404);
  const result=new Response(response.body,response);
  result.headers.set('X-Content-Type-Options','nosniff');result.headers.set('X-Frame-Options','DENY');result.headers.set('Referrer-Policy','same-origin');result.headers.set('Strict-Transport-Security','max-age=15552000');
  result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return result;
}};}
export default createProxy();
function error(message,status){return new Response(JSON.stringify({error:message}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
