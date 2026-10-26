// Cliente HTTP compartilhado pelo Worker e pelas ferramentas administrativas.
// A chave service_role nunca vai para public/ nem para respostas ao navegador.
export class CloudError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
export function supabase(env,fetcher=fetch){
  let origin;
  try {const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw 0;origin=u.origin;}catch{throw new CloudError('Configure SUPABASE_URL com o endereço HTTPS do projeto.',503);}
  const key=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key||key.length<30)throw new CloudError('Configure a chave privada do Supabase no servidor.',503);
  async function request(route,{method='GET',body,headers={},binary=false}={}){
    let response;
    try {response=await fetcher(origin+route,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,...(body!==undefined&&!binary?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:binary?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});}
    catch{throw new CloudError('Não foi possível acessar o Supabase. Tente novamente.',503);}
    if(!response.ok){
      // Nao devolver mensagens SQL, tokens, chaves ou respostas internas.
      const error=new CloudError('O armazenamento não concluiu a operação. Verifique a configuração e tente novamente.',response.status===429?429:503);
      error.upstreamStatus=response.status;
      throw error;
    }
    if(binary)return response;
    const text=await response.text();return text?JSON.parse(text):null;
  }
  const objectRoute=key=>'/storage/v1/object/repair-photos/'+key.split('/').map(encodeURIComponent).join('/');
  return {
    request,
    rpc:(name,args={})=>request('/rest/v1/rpc/'+name,{method:'POST',body:args}),
    rows:(table,query)=>request('/rest/v1/'+table+'?'+new URLSearchParams(query)),
    insert:(table,row)=>request('/rest/v1/'+table,{method:'POST',body:row}),
    remove:(table,query)=>request('/rest/v1/'+table+'?'+new URLSearchParams(query),{method:'DELETE'}),
    patch:(table,query,row)=>request('/rest/v1/'+table+'?'+new URLSearchParams(query),{method:'PATCH',body:row}),
    async signIn(email,password){
      try{return await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});}
      catch(e){if(e.upstreamStatus===400||e.upstreamStatus===401||e.upstreamStatus===422)throw new CloudError('E-mail ou senha incorretos.',401);throw e;}
    },
    createUser:values=>request('/auth/v1/admin/users',{method:'POST',body:{...values,email_confirm:true}}),
    updatePassword:(id,password)=>request('/auth/v1/admin/users/'+encodeURIComponent(id),{method:'PUT',body:{password}}),
    async upload(photo){const response=await request(objectRoute(photo.object_key),{method:'POST',headers:{'Content-Type':photo.mime,'x-upsert':'false'},body:photo.bytes,binary:true});await response.arrayBuffer();},
    download:key=>request(objectRoute(key),{binary:true}),
    deleteObjects:keys=>request('/storage/v1/object/repair-photos',{method:'DELETE',body:{prefixes:keys}})
  };
}
export async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const token=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const textDigest=value=>digest(new TextEncoder().encode(value));
