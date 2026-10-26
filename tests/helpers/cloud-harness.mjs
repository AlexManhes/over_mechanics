// Adaptadores de GoTrue/Storage/HTTP apenas para testes. SQL executado por
// PostgreSQL real em WASM (PGlite). Nao representa servico remoto configurado.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const env={SUPABASE_URL:'https://qa.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'chave-ficticia-apenas-testes-123456789',PUBLIC_ORIGIN:'https://oficina.example'};
export async function harness(){
 const pg=new PGlite();
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);`);
 await pg.exec(await readFile(new URL('../../supabase/migrations/001_workshop.sql',import.meta.url),'utf8'));
 const users=new Map(),objects=new Map();let requests=0;
 async function addUser(email,password,name='Mecânico',role='admin'){
  const id=crypto.randomUUID();users.set(email,{id,password,email});await pg.query('insert into auth.users values($1)',[id]);
  await pg.query('insert into mj_accounts values($1::text,$1::uuid,$2,$3,$4,true)',[id,name,email,role]);return id;
 }
 const json=(value,status=200)=>new Response(value===undefined?null:JSON.stringify(value,function(k,v){return this[k] instanceof Date?this[k].toISOString().slice(0,10):v;}),{status,headers:{'Content-Type':'application/json'}});
 async function fetcher(input,options={}){
  requests++;const u=new URL(input),headers=new Headers(options.headers),method=options.method||'GET';
  if(headers.get('apikey')!==env.SUPABASE_SERVICE_ROLE_KEY||headers.get('authorization')!==`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`)return json({error:'forbidden'},403);
  const body=typeof options.body==='string'?JSON.parse(options.body):options.body;
  if(u.pathname==='/auth/v1/token'){
   const user=users.get(body.email);if(!user||user.password!==body.password)return json({error:'invalid'},400);
   return json({user:{id:user.id,email:user.email},access_token:'token-privado-do-teste'});
  }
  if(u.pathname==='/auth/v1/admin/users'&&method==='POST'){
   if(users.has(body.email))return json({error:'duplicate'},422);
   const id=crypto.randomUUID();users.set(body.email,{id,email:body.email,password:body.password});await pg.query('insert into auth.users values($1)',[id]);return json({id,email:body.email});
  }
  if(u.pathname.startsWith('/auth/v1/admin/users/')&&method==='PUT'){
   const user=[...users.values()].find(x=>x.id===u.pathname.split('/').at(-1));user.password=body.password;return json({id:user.id});
  }
  if(u.pathname==='/auth/v1/admin/users')return json({users:[...users.values()].map(({id,email})=>({id,email}))});
  if(u.pathname.startsWith('/storage/v1/object/repair-photos/')){
   const key=u.pathname.split('/').at(-1);
   if(method==='GET')return objects.has(key)?new Response(objects.get(key)):json({error:'not found'},404);
   if(objects.has(key))return json({error:'duplicate'},409);
   objects.set(key,Buffer.from(body));return json({Key:key});
  }
  try{
   await pg.exec('set role service_role');
   if(u.pathname.startsWith('/rest/v1/rpc/')){
    const name=u.pathname.split('/').at(-1);if(!/^mj_[a-z_]+$/.test(name))throw new Error('bad function');
    const keys=Object.keys(body),values=keys.map(k=>typeof body[k]==='object'?JSON.stringify(body[k]):body[k]);
    const args=keys.map((k,i)=>`${k}=>$${i+1}::${['p_vehicle','p_repair','p_photos','p_return','p_bundle'].includes(k)?'jsonb':k==='p_auth_id'?'uuid':k==='p_expires'?'bigint':'text'}`).join(',');
    return json((await pg.query(`select public.${name}(${args}) as value`,values)).rows[0].value);
   }
   const table=u.pathname.split('/').at(-1);if(!/^mj_[a-z_]+$/.test(table))throw new Error('bad table');
   const values=[],conditions=[];
   for(const [key,value] of u.searchParams){
    if(['select','limit'].includes(key))continue;if(!/^[a-z_]+$/.test(key))throw new Error('bad field');
    const [op,...rest]=value.split('.'),v=rest.join('.');
    if(op==='in'){const entries=v.slice(1,-1).split(',');conditions.push(`${key} in (${entries.map(e=>{values.push(e);return '$'+values.length;}).join(',')})`);}
    else{values.push(v);conditions.push(`${key}${op==='gt'?'>':'='}$${values.length}`);}
   }
   const where=conditions.length?' where '+conditions.join(' and '):'';
   if(method==='POST'){
    const keys=Object.keys(body);await pg.query(`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(body));return json(undefined,201);
   }
   if(method==='DELETE'){await pg.query(`delete from ${table}${where}`,values);return json(undefined,204);}
   if(method==='PATCH'){
    const keys=Object.keys(body),offset=values.length;values.push(...Object.values(body));await pg.query(`update ${table} set ${keys.map((k,i)=>`${k}=$${offset+i+1}`).join(',')}${where}`,values);return json(undefined,204);
   }
   const fields=u.searchParams.get('select')||'*';if(!/^[a-z_,*]+$/.test(fields))throw new Error('bad select');
   return json((await pg.query(`select ${fields} from ${table}${where}${u.searchParams.has('limit')?' limit '+Number(u.searchParams.get('limit')):''}`,values)).rows);
  }catch(e){return json({error:e.message},400);}finally{await pg.exec('reset role');}
 }
 return {pg,users,objects,fetcher,addUser,get requests(){return requests;}};
}
