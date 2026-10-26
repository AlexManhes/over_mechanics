import {todayBrasilia,repairState,selectRepairs,normalizePlate,validateRepair,returnWithin,dayNumber} from './domain.mjs';
import {supabase,CloudError,digest,token,textDigest} from './supabase.mjs';

const fail=(message,status=400)=>{throw new CloudError(message,status);};
const clean=(value,max=6000)=>{const s=String(value??'').trim();if(s.length>max)fail(`Campo excede ${max} caracteres.`);return s;};
const accountInput=b=>{
  const name=clean(b.name,100),email=clean(b.email,200).toLowerCase(),password=String(b.password||'');
  if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10||password.length>200)fail('Informe nome, e-mail válido e senha de 10 a 200 caracteres.');
  return {name,email,password};
};
const safeUser=u=>u?{id:u.id,name:u.name,email:u.email,role:u.role}:null;
const cookie=(value,age=43200)=>`__Host-mj_session=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
const sessionToken=req=>/(?:^|;\s*)__Host-mj_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.get('cookie')||'')?.[1];
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
async function readBody(req){
  if(!req.headers.get('content-type')?.startsWith('application/json'))fail('Envie application/json.',415);
  if(Number(req.headers.get('content-length'))>34000000)fail('Limite de 34 MB por envio excedido.',413);
  const reader=req.body?.getReader();if(!reader)return {};
  const decoder=new TextDecoder();let size=0,text='';
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>34000000){await reader.cancel();fail('Limite de 34 MB por envio excedido.',413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  finally{reader.releaseLock();}
  try{const v=JSON.parse(text||'{}');if(!v||Array.isArray(v)||typeof v!=='object')throw 0;return v;}catch{fail('JSON inválido.');}
}
export async function photoInput(photos,stages){
  if(!Array.isArray(photos)||photos.length>12)fail('Envie até 12 fotos por registro.');
  const result=[];
  for(const p of photos){
    if(!p||!stages.includes(p.stage)||typeof p.data!=='string'||p.data.length>2800000)fail('Foto inválida ou maior que 2 MB.');
    const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(p.data);
    if(!match)fail('Use fotos JPEG, PNG ou WebP.');
    let bytes;try{
      if(typeof Uint8Array.fromBase64==='function')bytes=Uint8Array.fromBase64(match[2]);
      else{const raw=atob(match[2]);bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);}
    }catch{fail('Arquivo de imagem inválido.');}
    const valid=match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:match[1]==='png'?[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n):new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP';
    if(!valid||bytes.length>2000000)fail('Arquivo de imagem inválido.');
    const id=crypto.randomUUID(),ext={jpeg:'jpg',png:'png',webp:'webp'}[match[1]];
    result.push({id,stage:p.stage,mime:`image/${match[1]}`,object_key:`${id}.${ext}`,sha256:await digest(bytes),size:bytes.length,bytes});
  }
  return result;
}
const metadata=p=>{const {bytes,...rest}=p;return rest;};

// Dependencias injetaveis para validar HTTP/SQL sem fingir um Supabase publicado.
export function createWorker({fetcher=fetch,now=()=>new Date(),log=console.error}={}){
  return {async fetch(req,env){
    const url=new URL(req.url),today=()=>todayBrasilia(now());
    try{
      if(!url.pathname.startsWith('/api/')&&url.pathname!=='/healthz'){
        if(!['GET','HEAD'].includes(req.method))return secure(json({error:'Página não encontrada.'},404));
        // O build copia somente arquivos publicos; fonte, banco e segredos nao entram.
        const allowed=['/','/index.html','/app.js','/photos.js','/styles.css','/domain.mjs','/manifest.webmanifest','/sw.js','/icon.svg','/icon-192.png','/icon-512.png'];
        if(!allowed.includes(url.pathname))return secure(json({error:'Página não encontrada.'},404));
        if(!env.ASSETS)fail('Os arquivos da interface não foram preparados.',503);
        return secure(await env.ASSETS.fetch(req));
      }
      if(env.MAINTENANCE==='true')fail('Aplicativo em manutenção. Tente novamente mais tarde.',503);
      const db=supabase(env,fetcher);
      if(url.pathname==='/healthz'&&req.method==='GET'){await db.rows('mj_settings',{select:'id',id:'eq.1'});return secure(json({status:'ok'}));}
      if(!['GET','POST'].includes(req.method))fail('Método não permitido.',405);
      if(req.method==='POST'){
        if(!env.PUBLIC_ORIGIN||!env.PUBLIC_ORIGIN.startsWith('https://')||new URL(env.PUBLIC_ORIGIN).origin!==env.PUBLIC_ORIGIN)fail('Configure PUBLIC_ORIGIN com o endereço HTTPS da aplicação.',503);
        if(req.headers.get('origin')&&req.headers.get('origin')!==env.PUBLIC_ORIGIN)fail('Origem não autorizada.',403);
        if(req.headers.get('sec-fetch-site')==='cross-site')fail('Origem não autorizada.',403);
      }
      const raw=sessionToken(req),hashed=raw?await textDigest(raw):null;
      let user=null;
      if(hashed){
        const s=(await db.rows('mj_sessions',{select:'account_id',token:`eq.${hashed}`,expires:`gt.${now().getTime()}`,limit:'1'}))[0];
        if(s)user=(await db.rows('mj_accounts',{select:'id,auth_id,name,email,role',id:`eq.${s.account_id}`,active:'eq.true',role:'in.(admin,mechanic)',limit:'1'}))[0]||null;
      }
      async function rateLimit(){const ip=req.headers.get('x-mj-client-ip')||'local-development';if(!await db.rpc('mj_allow_attempt',{p_key:await textDigest(ip)}))fail('Muitas tentativas. Aguarde 15 minutos.',429);}
      async function login(u){const value=token();await db.rpc('mj_create_session',{p_token:await textDigest(value),p_actor:u.id,p_expires:now().getTime()+43200000});return json({user:safeUser(u)},200,{'Set-Cookie':cookie(value)});}
      if(url.pathname==='/api/session'&&req.method==='GET')return secure(json({user:safeUser(user),authRequired:true,needsSetup:false,today:today()}));
      if(url.pathname==='/api/setup')fail('A administração inicial é criada pela configuração privada do servidor.',403);
      if(url.pathname==='/api/login'&&req.method==='POST'){
        await rateLimit();const b=await readBody(req),email=clean(b.email,200).toLowerCase(),password=String(b.password||'');
        if(!email||!password||password.length>200)fail('E-mail ou senha incorretos.',401);
        const auth=await db.signIn(email,password);
        const u=(await db.rows('mj_accounts',{select:'id,auth_id,name,email,role',auth_id:`eq.${auth.user.id}`,active:'eq.true',role:'in.(admin,mechanic)',limit:'1'}))[0];
        if(!u)fail('Esta conta não possui acesso à oficina.',403);
        return secure(await login(u));
      }
      if(!user)fail('Entre com sua conta de mecânico.',401);
      if(url.pathname==='/api/logout'&&req.method==='POST'){await readBody(req);await db.remove('mj_sessions',{token:`eq.${hashed}`});return secure(json({ok:true},200,{'Set-Cookie':cookie('',0)}));}
      if((url.pathname==='/api/data'||url.pathname==='/api/repairs')&&req.method==='GET'){
        const data=await db.rpc('mj_read_data');const day=today();
        if(url.pathname==='/api/repairs'){
          const scope=url.searchParams.get('scope')||'all';if(!['all','active','archived'].includes(scope))fail('Filtro de arquivamento inválido.');
          return secure(json({repairs:selectRepairs(data.repairs,data.vehicles,{scope,plate:url.searchParams.get('plate')||'',alertDays:data.alertDays,today:day}).map(r=>repairState(r,data.alertDays,day)),today:day}));
        }
        return secure(json({...data,repairs:data.repairs.map(r=>repairState(r,data.alertDays,day)),today:day,serverNow:now().toISOString()}));
      }
      if(url.pathname==='/api/users'&&req.method==='POST'){
        if(user.role!=='admin')fail('Apenas administradores podem cadastrar mecânicos.',403);
        await rateLimit();const b=accountInput(await readBody(req));
        if((await db.rows('mj_accounts',{select:'id',email:`eq.${b.email}`,active:'eq.true',limit:'1'})).length)fail('Este e-mail já está cadastrado.',409);
        const created=await db.createUser({email:b.email,password:b.password});
        // Em falha de rede posterior, a conta Auth fica SEM acesso. O administrador
        // pode vincula-la novamente pela ferramenta privada, sem apagar a conta.
        await db.insert('mj_accounts',{id:crypto.randomUUID(),auth_id:created.id,name:b.name,email:b.email,role:'mechanic',active:true});
        return secure(json({ok:true},201));
      }
      if(url.pathname==='/api/password'&&req.method==='POST'){
        await rateLimit();const b=await readBody(req),password=String(b.password||''),current=String(b.current||'');
        if(password.length<10||password.length>200||current.length>200)fail('A nova senha deve ter de 10 a 200 caracteres.');
        const auth=await db.signIn(user.email,current);if(auth.user.id!==user.auth_id)fail('Senha atual incorreta.',401);
        // Revoga sessoes ANTES da troca, inclusive se o provedor falhar em seguida.
        await db.remove('mj_sessions',{account_id:`eq.${user.id}`});
        await db.updatePassword(user.auth_id,password);return secure(await login(user));
      }
      if(url.pathname==='/api/settings'&&req.method==='POST'){
        const b=await readBody(req),days=Number(b.alertDays);if(!Number.isInteger(days)||days<1||days>365)fail('O alerta deve ter de 1 a 365 dias.');
        await db.patch('mj_settings',{id:'eq.1'},{alert_days:days});return secure(json({ok:true}));
      }
      async function saveWithPhotos(photos,fn){
        // Imagens chegam primeiro. Em falha/timeout da transacao, nao as removemos:
        // a resposta pode se perder DEPOIS do commit. Isso evita apagar fotos salvas.
        // Objetos sem referencia sao mantidos para verificacao manual, sem limpeza.
        for(const p of photos)await db.upload(p);
        return fn(photos.map(metadata));
      }
      if(url.pathname==='/api/repairs'&&req.method==='POST'){
        const b=await readBody(req);validateRepair(b,today());
        const fields=Object.fromEntries(['complaint','diagnosis','service','parts','mechanic','notes'].map(k=>[k,clean(b[k],k==='mechanic'?100:6000)]));
        const photos=await photoInput(b.photos||[],['before','after']);
        const r={...fields,id:crypto.randomUUID(),completed:b.completed,days:Number(b.days),created_at:now().toISOString()};
        // Empresa responsavel permanece desativada; dados legados nao sao apagados.
        const v={id:crypto.randomUUID(),plate:normalizePlate(b.plate),model:clean(b.model,100)};
        return secure(json(await saveWithPhotos(photos,items=>db.rpc('mj_add_repair',{p_actor:user.id,p_vehicle:v,p_repair:r,p_photos:items})),201));
      }
      const returnMatch=/^\/api\/repairs\/([^/]+)\/returns$/.exec(url.pathname);
      if(returnMatch&&req.method==='POST'){
        const original=(await db.rows('mj_repairs',{select:'*',id:`eq.${returnMatch[1]}`,limit:'1'}))[0];if(!original)fail('Reparo não encontrado.',404);
        const b=await readBody(req),description=clean(b.description),action=clean(b.action);if(!description||!action)fail('Preencha a descrição e as providências.');
        const within=returnWithin(original,b.date);if(dayNumber(b.date)>dayNumber(today()))fail('O retorno não pode estar no futuro.');
        const photos=await photoInput(b.photos||[],['return']);
        await saveWithPhotos(photos,items=>db.rpc('mj_add_return',{p_actor:user.id,p_return:{id:crypto.randomUUID(),repair_id:original.id,date:b.date,description,action},p_photos:items}));
        return secure(json({ok:true,within},201));
      }
      const photoMatch=/^\/api\/photos\/([^/]+)$/.exec(url.pathname);
      if(photoMatch&&req.method==='GET'){
        const p=(await db.rows('mj_photos',{select:'object_key,mime',id:`eq.${photoMatch[1]}`,limit:'1'}))[0];if(!p)fail('Foto não encontrada.',404);
        const response=await db.download(p.object_key);
        return secure(new Response(response.body,{headers:{'Content-Type':p.mime,'Cache-Control':'no-store','Content-Disposition':'inline'}}));
      }
      fail('Recurso não encontrado.',404);
    }catch(e){
      // Somente erros de validacao sao mostrados. Falhas desconhecidas nao vazam dados.
      if(!(e instanceof CloudError)){if(/Data inválida|prazo|conclusão|placa|Preencha|retorno/.test(e.message||''))return secure(json({error:e.message},400));log('Falha interna na API da oficina.');}
      return secure(json({error:e instanceof CloudError?e.message:'Não foi possível concluir a operação. Tente novamente.'},e.status||500));
    }
  }};
}
function secure(response){
  const res=new Response(response.body,response);
  res.headers.set('X-Content-Type-Options','nosniff');res.headers.set('X-Frame-Options','DENY');res.headers.set('Referrer-Policy','same-origin');res.headers.set('Strict-Transport-Security','max-age=15552000');
  res.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return res;
}
export default createWorker();
