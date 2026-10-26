import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {harness,env} from './helpers/cloud-harness.mjs';
import {createWorker,photoInput} from '../src/cloud/api.mjs';
import {supabase} from '../src/cloud/supabase.mjs';
import {exportLocal,validateBackup,uploadBackup,backupCloud} from '../scripts/cloud-backup.mjs';
import {todayBrasilia,addDays} from '../src/lib/domain.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmXkAAAAASUVORK5CYII=';
const password='SenhaFicticia123!';

test('API da nuvem com SQL PostgreSQL real: reparos, fotos, usuarios, prazos e retorno',async t=>{
 const h=await harness();t.after(()=>h.pg.close());const admin=await h.addUser('admin@example.test',password,'Admin');
 const api=createWorker({fetcher:h.fetcher});let cookie='';
 async function call(route,body,extra={}){
  const headers={...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json',Origin:env.PUBLIC_ORIGIN}:{}),...extra};
  const response=await api.fetch(new Request(env.PUBLIC_ORIGIN+'/api'+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
  const newCookie=response.headers.get('set-cookie');if(newCookie)cookie=newCookie.split(';')[0];
  return {response,value:await response.json(),status:response.status};
 }
 await t.test('sem acesso anonimo e sem auto-cadastro publico',async()=>{
  assert.equal((await call('/session')).value.authRequired,true);assert.equal((await call('/session')).value.needsSetup,false);
  assert.equal((await call('/data')).status,401);assert.equal((await call('/setup',{})).status,403);
  assert.equal((await call('/login',{email:'admin@example.test',password:'errada'})).status,401);
  const login=await call('/login',{email:'admin@example.test',password});assert.equal(login.status,200);
  assert.match(login.response.headers.get('set-cookie'),/__Host-mj_session=.*HttpOnly; Secure; SameSite=Strict/);
  assert.ok(!JSON.stringify(login.value).includes('token-privado'));assert.equal(login.value.user.auth_id,undefined);
  const sessions=(await h.pg.query('select * from mj_sessions')).rows;assert.notEqual(sessions[0].token,cookie.split('=')[1]);
 });
 let original,vehicle;
 const repair={plate:'abc-1d23',model:'Modelo QA',company:'Campo desativado',complaint:'Falha relatada',diagnosis:'Diagnóstico',service:'Reparo QA',parts:'Peça',mechanic:'Mecânico QA',completed:addDays(todayBrasilia(),-40),days:30,notes:'Nota',photos:[{stage:'before',data:png},{stage:'after',data:png}]};
 await t.test('cadastra reparos de 30/60 dias na mesma placa e guarda bytes privados',async()=>{
  const first=await call('/repairs',repair);assert.equal(first.status,201);original=first.value.id;vehicle=first.value.vehicleId;
  assert.equal((await call('/repairs',{...repair,days:60,photos:[]})).value.vehicleId,vehicle);
  const d=(await call('/data')).value;assert.equal(d.vehicles.length,1);assert.equal(d.repairs.length,2);assert.equal(d.photos.length,2);
  assert.equal(d.vehicles[0].plate,'ABC1D23');assert.equal(d.vehicles[0].company,undefined);
  assert.equal(d.repairs.find(r=>r.id===original).deadline.status,'expired');assert.equal(d.repairs.find(r=>r.days===60).deadline.status,'active');
  assert.equal((await h.pg.query('select company from mj_vehicles')).rows[0].company,'');
  const photo=await api.fetch(new Request(env.PUBLIC_ORIGIN+'/api/photos/'+d.photos[0].id,{headers:{Cookie:cookie}}),env);
  assert.equal(Buffer.from(await photo.arrayBuffer()).toString('base64'),png.split(',')[1]);
  assert.equal(photo.headers.get('cache-control'),'no-store');
  const anon=await api.fetch(new Request(env.PUBLIC_ORIGIN+'/api/photos/'+d.photos[0].id),env);assert.equal(anon.status,401);
 });
 await t.test('arquivamento, busca, historico e retornos dentro/depois sem alterar original',async()=>{
  const archived=(await call('/repairs?scope=archived&plate=ABC-1d')).value.repairs;assert.equal(archived.length,1);assert.equal(archived[0].id,original);
  assert.equal((await call('/repairs?scope=active')).value.repairs.length,1);
  assert.equal((await call('/repairs?scope=archived&plate=ZZZ')).value.repairs.length,0);
  const inside=await call(`/repairs/${original}/returns`,{date:addDays(repair.completed,30),description:'Mesma falha',action:'Nova inspeção',photos:[{stage:'return',data:png}]});
  assert.equal(inside.status,201);assert.equal(inside.value.within,true);
  assert.equal((await call(`/repairs/${original}/returns`,{date:todayBrasilia(),description:'Retorno depois',action:'Verificação',photos:[]})).value.within,false);
  assert.equal((await call(`/repairs/${original}/returns`,{date:addDays(repair.completed,-1),description:'Falha',action:'Verificação'})).status,400);
  const d=(await call('/data')).value;assert.equal(d.returns.length,2);assert.equal(d.repairs.find(r=>r.id===original).service,repair.service);assert.equal(d.photos.filter(p=>p.stage==='return').length,1);
 });
 await t.test('limite de alerta e cores refletem o relogio de Brasilia',async()=>{
  assert.equal((await call('/settings',{alertDays:25})).status,200);assert.equal((await call('/data')).value.repairs.find(r=>r.days===60).deadline.status,'warning');
  const injected=createWorker({fetcher:h.fetcher,now:()=>new Date(addDays(repair.completed,30)+'T12:00:00Z')});
  // Sessao expira em 12h; usa data ficticia anterior, ainda dentro do expires.
  const today=await injected.fetch(new Request(env.PUBLIC_ORIGIN+'/api/data',{headers:{Cookie:cookie}}),env);
  const d=await today.json();assert.equal(d.repairs.find(r=>r.id===original).deadline.label,'Vence hoje');assert.equal(d.repairs.find(r=>r.id===original).archived,false);
 });
 await t.test('dois clientes e novas instancias da API consultam mesmos registros e fotos',async()=>{
  const desktop=cookie;await call('/login',{email:'admin@example.test',password});const mobile=cookie;assert.notEqual(desktop,mobile);
  const restarted=createWorker({fetcher:h.fetcher});
  const a=await (await restarted.fetch(new Request(env.PUBLIC_ORIGIN+'/api/data',{headers:{Cookie:desktop}}),env)).json();
  const b=(await call('/data')).value;assert.deepEqual(a.repairs,b.repairs);assert.deepEqual(a.photos,b.photos);
 });
 await t.test('falha de banco nao deixa reparo parcial nem apaga fotos apos timeout',async()=>{
  const count=(await call('/data')).value.repairs.length;
  const v={id:crypto.randomUUID(),plate:'DEF2E34',model:''},r={...repair,id:crypto.randomUUID(),created_at:new Date().toISOString()};delete r.photos;
  const db=supabase(env,h.fetcher),photos=await photoInput([{stage:'before',data:png}],['before']);await db.upload(photos[0]);
  await assert.rejects(db.rpc('mj_add_repair',{p_actor:admin,p_vehicle:v,p_repair:r,p_photos:[{...photos[0],bytes:undefined,stage:'return'}]}));
  assert.equal((await call('/data')).value.repairs.length,count);assert.equal((await h.pg.query('select id from mj_vehicles where plate=$1',['DEF2E34'])).rows.length,0);
  assert.ok(h.objects.has(photos[0].object_key));
 });
 await t.test('backup e restauracao com hashes, sem senhas e preservando todos os vinculos',async()=>{
  const parent=await mkdtemp(path.join(os.tmpdir(),'cloud-backup-'));t.after(()=>rm(parent,{recursive:true,force:true}));
  const destination=path.join(parent,'backup');const db=supabase(env,h.fetcher);
  const bundle=await backupCloud(destination,db);assert.equal(bundle.repairs.length,2);assert.equal(bundle.photos.length,3);
  const raw=await readFile(path.join(destination,'manifest.json'),'utf8');assert.ok(!raw.includes(password));assert.ok(!raw.includes('auth_id'));assert.ok(!raw.includes(cookie));
  const target=await harness();t.after(()=>target.pg.close());await target.addUser('novo@example.test',password);
  await uploadBackup(destination,supabase(env,target.fetcher));await uploadBackup(destination,supabase(env,target.fetcher));
  const restored=await supabase(env,target.fetcher).rpc('mj_read_data');assert.equal(restored.repairs.length,2);assert.equal(restored.returns.length,2);assert.equal(restored.photos.length,3);
  assert.equal((await target.pg.query('select active from mj_accounts where id=$1',[admin])).rows[0].active,false);
  const corrupt=bundle.photos[0];await writeFile(path.join(destination,'photos',corrupt.object_key),'foto alterada');await assert.rejects(validateBackup(destination),/corrompida/);
 });
 await t.test('CSRF, validacao e controle de acesso para mecanicos',async()=>{
  assert.equal((await call('/settings',{alertDays:7},{Origin:'https://invasor.example'})).status,403);
  assert.equal((await call('/repairs',{...repair,plate:'ERRADA'})).status,400);
  assert.equal((await call('/repairs',{...repair,completed:addDays(todayBrasilia(),1)})).status,400);
  assert.equal((await call('/users',{name:'Mecânico',email:'mecanico@example.test',password})).status,201);
  await call('/logout',{});assert.equal((await call('/data')).status,401);
  assert.equal((await call('/login',{email:'mecanico@example.test',password})).status,200);assert.equal((await call('/data')).status,200);
  assert.equal((await call('/users',{name:'Outro',email:'outro@example.test',password})).status,403);
  const old=cookie;assert.equal((await call('/password',{current:password,password:'NovaSenhaFicticia123!'})).status,200);
  const revoked=await api.fetch(new Request(env.PUBLIC_ORIGIN+'/api/data',{headers:{Cookie:old}}),env);assert.equal(revoked.status,401);
  await call('/logout',{});assert.equal((await call('/login',{email:'mecanico@example.test',password})).status,401);
  assert.equal((await call('/login',{email:'mecanico@example.test',password:'NovaSenhaFicticia123!'})).status,200);
 });
 await t.test('RLS, RPC e bucket fechados para clientes anonimos/autenticados',async()=>{
  assert.equal((await h.pg.query("select public from storage.buckets where id='repair-photos'")).rows[0].public,false);
  for(const role of ['anon','authenticated']){
   await h.pg.exec('set role '+role);
   await assert.rejects(h.pg.query('select * from public.mj_accounts'));
   await assert.rejects(h.pg.query('select public.mj_read_data()'));
   await assert.rejects(h.pg.query('select public.mj_export()'));
   await h.pg.exec('reset role');
  }
 });
});

test('exportacao SQLite e migracao PostgreSQL preservam fotos/empresa legada sem alterar origem',async t=>{
 const parent=await mkdtemp(path.join(os.tmpdir(),'local-to-cloud-'));t.after(()=>rm(parent,{recursive:true,force:true}));
 const source=path.join(parent,'data');await mkdir(source);await mkdir(path.join(source,'photos'));
 const local=new DatabaseSync(path.join(source,'mecanica.sqlite'));
 local.exec(`create table users(id text,name text,email text,password text,role text);insert into users values('local-workshop','Uso local','local@internal.invalid','HASH-QUE-NAO-DEVE-MIGRAR','local');
 create table vehicles(id text,plate text,model text,company text);insert into vehicles values('v','ABC1D23','Modelo','Empresa legada');
 create table repairs(id text,vehicle_id text,complaint text,diagnosis text,service text,parts text,mechanic text,completed text,days integer,notes text,created_by text,created_at text);
 insert into repairs values('r','v','Defeito','Diagnostico','Servico','','Mecanico','2026-01-01',30,'','local-workshop','2026-01-01T12:00:00.000Z');
 create table returns(id text,repair_id text,date text,description text,action text,created_by text);insert into returns values('t','r','2026-02-02','Mesmo defeito','Inspecao','local-workshop');
 create table photos(id text,repair_id text,return_id text,stage text,mime text,file_path text);
 create table settings(id integer,alert_days integer);insert into settings values(1,7);`);
 const name='a'.repeat(64)+'.png';local.prepare('insert into photos values(?,?,?,?,?,?)').run('p','r',null,'before','image/png',name);local.close();await writeFile(path.join(source,'photos',name),Buffer.from(png.split(',')[1],'base64'));
 const before=await readFile(path.join(source,'mecanica.sqlite'));
 const backup=path.join(parent,'migration'),bundle=await exportLocal(source,backup);
 assert.ok(!(await readFile(path.join(backup,'manifest.json'),'utf8')).includes('HASH-QUE'));
 assert.equal(bundle.vehicles[0].company,'Empresa legada');assert.deepEqual(await readFile(path.join(source,'mecanica.sqlite')),before);
 const h=await harness();t.after(()=>h.pg.close());const db=supabase(env,h.fetcher);
 await uploadBackup(backup,db);const data=await db.rpc('mj_read_data');assert.equal(data.repairs.length,1);assert.equal(data.returns.length,1);assert.equal(data.photos.length,1);assert.equal(data.vehicles[0].company,undefined);
 assert.equal((await h.pg.query('select company from mj_vehicles')).rows[0].company,'Empresa legada');
 bundle.repairs[0].service='Sobrescrita proibida';await assert.rejects(db.rpc('mj_import',{p_bundle:bundle}));assert.equal((await db.rpc('mj_read_data')).repairs[0].service,'Servico');
});

test('historico da nuvem nao e truncado no limite padrao de 1000 linhas do PostgREST',async t=>{
 const h=await harness();t.after(()=>h.pg.close());const id=await h.addUser('qa@example.test',password);
 await h.pg.query("insert into mj_vehicles values('v','ABC1234','','')");
 await h.pg.query("insert into mj_repairs select 'r'||n,'v','Defeito','Diagnostico','Servico','','Mecanico',date '2026-01-01',30,'',$1,'2026-01-01T12:00:00.000Z' from generate_series(1,1100) n",[id]);
 const data=await supabase(env,h.fetcher).rpc('mj_read_data');assert.equal(data.repairs.length,1100);
});
