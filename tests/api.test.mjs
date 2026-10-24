import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,readdir,cp} from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {todayBrasilia,addDays} from '../src/lib/domain.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=';
test('fluxo real da oficina com banco e fotos persistentes',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'mecanica-ja-test-'));
  let proc,base,cookie='';
  async function start(storage=dir){proc=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,AUTH_REQUIRED:'true',PORT:'0',HOST:'127.0.0.1',DATA_DIR:storage,PUBLIC_ORIGIN:'',COOKIE_SECURE:'false',SETUP_KEY:''},stdio:['ignore','pipe','pipe']});
    base=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Servidor não iniciou')),10000);proc.stdout.on('data',d=>{out+=d;const match=/http:\/\/127\.0\.0\.1:\d+/.exec(out);if(match){clearTimeout(timer);resolve(match[0]);}});proc.on('error',reject);proc.on('exit',code=>{clearTimeout(timer);if(!out)reject(new Error('Servidor encerrou '+code));});});}
  async function stop(){if(proc && proc.exitCode===null && proc.signalCode===null)await new Promise(resolve=>{proc.once('exit',resolve);proc.kill();});}
  async function call(route,body,auth=true,headers={}){const res=await fetch(base+'/api'+route,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(auth&&cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const set=res.headers.get('set-cookie');if(set&&auth)cookie=set.split(';')[0];const value=await res.json();return {status:res.status,value,sessionCookie:set?.split(';')[0]};}
  t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true});});
  await start();
  await t.test('dados e fotos exigem autenticação; CSRF bloqueado',async()=>{assert.equal((await call('/data')).status,401);assert.equal((await call('/photos/test')).status,401);assert.equal((await call('/setup',{},true,{Origin:'https://outro.example'})).status,403);});
  await t.test('ativa administrador e impede segundo cadastro público',async()=>{assert.equal((await call('/setup',{name:'Mecânico QA',email:'qa@example.test',password:'SenhaDeTeste123!'})).status,201);assert.equal((await call('/setup',{})).status,409);});
  let repairId,vehicleId;
  const completed=addDays(todayBrasilia(),-40);
  const payload={plate:'abc-1d23',model:'Strada',company:'Frota QA',complaint:'Falha na partida',diagnosis:'Motor de arranque',service:'Troca do arranque',parts:'Arranque',mechanic:'Mecânico QA',completed,days:30,notes:'Registro QA',photos:[{stage:'before',data:png},{stage:'after',data:png}]};
  await t.test('cadastro com fotos antes/depois e busca pela placa normalizada',async()=>{
    const result=await call('/repairs',payload);assert.equal(result.status,201,JSON.stringify(result.value));repairId=result.value.id;vehicleId=result.value.vehicleId;
    const {value:d}=await call('/data');assert.equal(d.vehicles.find(v=>v.plate==='ABC1D23').id,vehicleId);assert.equal(d.repairs.length,1);assert.equal(d.photos.length,2);assert.equal(d.repairs[0].deadline.status,'expired');
    assert.equal(Object.hasOwn(d.vehicles[0],'company'),false);
    const legacy=new DatabaseSync(path.join(dir,'mecanica.sqlite'));
    try {assert.equal(legacy.prepare('SELECT company FROM vehicles WHERE id=?').get(vehicleId).company,'');legacy.prepare('UPDATE vehicles SET company=? WHERE id=?').run('Empresa legada preservada',vehicleId);}finally{legacy.close();}
    const image=await fetch(base+'/api/photos/'+d.photos[0].id,{headers:{Cookie:cookie}});assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'),png.split(',')[1]);
  });
  await t.test('novo atendimento de 60 dias preserva histórico e empresa legada desativada',async()=>{assert.equal((await call('/repairs',{...payload,days:60,photos:[],model:'',company:'Valor ignorado'})).status,201);const {value:d}=await call('/data');assert.equal(d.vehicles.length,1);assert.equal(d.vehicles[0].model,'Strada');assert.equal(d.repairs.length,2);assert.equal(d.repairs.find(r=>r.days===60).deadline.status,'active');const legacy=new DatabaseSync(path.join(dir,'mecanica.sqlite'),{readOnly:true});try{assert.equal(legacy.prepare('SELECT company FROM vehicles WHERE id=?').get(vehicleId).company,'Empresa legada preservada');}finally{legacy.close();}});
  await t.test('recusa inválidos e não deixa dados parciais',async()=>{for(const patch of [{plate:'123'},{days:0},{completed:addDays(todayBrasilia(),1)},{service:''},{photos:[{stage:'before',data:'data:image/png;base64,YWJj'}]}])assert.equal((await call('/repairs',{...payload,...patch})).status,400);assert.equal((await call('/data')).value.repairs.length,2);});
  await t.test('retornos dentro e depois do prazo, com foto e original intacto',async()=>{
    assert.equal((await call(`/repairs/${repairId}/returns`,{date:addDays(completed,30),description:'Mesma falha',action:'Revisão',photos:[{stage:'return',data:png}]})).value.within,true);
    assert.equal((await call(`/repairs/${repairId}/returns`,{date:todayBrasilia(),description:'Nova ocorrência',action:'Inspeção',photos:[]})).value.within,false);
    assert.equal((await call(`/repairs/${repairId}/returns`,{date:addDays(completed,-1),description:'Falha',action:'Inspeção'})).status,400);
    assert.equal((await call(`/repairs/${repairId}/returns`,{date:addDays(todayBrasilia(),1),description:'Falha',action:'Inspeção'})).status,400);
    const {value:d}=await call('/data');assert.equal(d.returns.length,2);assert.equal(d.repairs.find(r=>r.id===repairId).service,payload.service);assert.equal(d.photos.filter(p=>p.return_id).length,1);
  });
  await t.test('limite de alerta configurável e nenhum retorno automático',async()=>{assert.equal((await call('/settings',{alertDays:25})).status,200);const {value:d}=await call('/data');assert.equal(d.repairs.find(r=>r.days===60).deadline.status,'warning');assert.equal(d.returns.length,2);});
  await t.test('persiste registros, fotos e sessão após reiniciar o servidor',async()=>{await stop();await start();const {value:d}=await call('/data');assert.equal(d.repairs.length,2);assert.equal(d.returns.length,2);assert.equal(d.photos.length,3);assert.equal(d.alertDays,25);});
  await t.test('lista ativa separa arquivados, busca placa e mantém retorno do arquivado',async()=>{
    const active=(await call('/repairs?scope=active')).value.repairs, archived=(await call('/repairs?scope=archived&plate=abc-1d')).value.repairs;
    assert.equal(active.length,1);assert.equal(active[0].days,60);assert.equal(active[0].archived,false);
    assert.equal(archived.length,1);assert.equal(archived[0].id,repairId);assert.equal(archived[0].archived,true);assert.equal(archived[0].archivedOn,addDays(completed,31));
    assert.equal((await call('/repairs?scope=archived&plate=ZZZ')).value.repairs.length,0);
    assert.equal((await call('/data')).value.returns.filter(r=>r.repair_id===repairId).length,2);
  });
  await t.test('dois clientes autenticados consultam a mesma base e as mesmas fotos',async()=>{
    const mobile=await call('/login',{email:'qa@example.test',password:'SenhaDeTeste123!'},false,{'User-Agent':'Mobile-QA'});
    assert.equal(mobile.status,200);assert.notEqual(mobile.sessionCookie,cookie);
    const headers={Cookie:mobile.sessionCookie,'User-Agent':'Mobile-QA'};
    const first=(await call('/data')).value,second=(await call('/data',undefined,false,headers)).value;
    assert.deepEqual(second.repairs,first.repairs);assert.deepEqual(second.photos,first.photos);
    await call('/settings',{alertDays:7});assert.equal((await call('/data',undefined,false,headers)).value.alertDays,7);
    const photo=await fetch(base+'/api/photos/'+first.photos[0].id,{headers});assert.equal(photo.status,200);assert.equal(Buffer.from(await photo.arrayBuffer()).toString('base64'),png.split(',')[1]);
    await call('/settings',{alertDays:25});await call('/logout',{},false,headers);
    assert.equal((await call('/data')).status,200);
  });
  await t.test('fotos são arquivos privados com referências no banco',async()=>{
    const disk=new DatabaseSync(path.join(dir,'mecanica.sqlite'),{readOnly:true});
    try {const rows=disk.prepare('SELECT * FROM photos').all();assert.equal(rows.length,3);for(const row of rows){assert.equal(row.bytes,undefined);assert.equal((await readFile(path.join(dir,'photos',row.file_path))).toString('base64'),png.split(',')[1]);assert.equal((await fetch(base+'/photos/'+row.file_path)).status,404);}}finally{disk.close();}
    assert.equal((await readdir(path.join(dir,'photos'))).length,3);
  });
  await t.test('mecânico acessa registros mas não cria outros usuários',async()=>{assert.equal((await call('/users',{name:'Segundo mecânico',email:'mecanico@example.test',password:'OutraSenha123!'})).status,201);await call('/logout',{});assert.equal((await call('/data')).status,401);assert.equal((await call('/login',{email:'mecanico@example.test',password:'errada'})).status,401);assert.equal((await call('/login',{email:'mecanico@example.test',password:'OutraSenha123!'})).status,200);assert.equal((await call('/data')).value.repairs.length,2);assert.equal((await call('/users',{name:'Invasor',email:'outro@example.test',password:'OutraSenha123!'})).status,403);});
  await t.test('senha pode ser alterada e a antiga é invalidada',async()=>{assert.equal((await call('/password',{current:'OutraSenha123!',password:'SenhaAlterada123!'})).status,200);await call('/logout',{});assert.equal((await call('/login',{email:'mecanico@example.test',password:'OutraSenha123!'})).status,401);assert.equal((await call('/login',{email:'mecanico@example.test',password:'SenhaAlterada123!'})).status,200);});
  await t.test('manifesto e CSS respondem HTTP 200 com MIME correto e URLs versionadas',async()=>{const manifestResponse=await fetch(base+'/manifest.webmanifest?v=1.1.2');assert.equal(manifestResponse.status,200);assert.match(manifestResponse.headers.get('content-type'),/application\/manifest\+json/);const manifest=await manifestResponse.json();assert.equal(manifest.name,'Mecânica já');assert.equal(manifest.display,'standalone');const css=await fetch(base+'/styles.css?v=1.1.2');assert.equal(css.status,200);assert.match(css.headers.get('content-type'),/text\/css/);assert.match(await css.text(),/:root/);for(const p of ['/','/app.js','/styles.css','/domain.mjs','/icon-192.png','/icon-512.png','/sw.js'])assert.equal((await fetch(base+p)).status,200,p);assert.equal((await fetch(base+'/data/mecanica.sqlite')).status,404);});
  await t.test('atendimento de mais de dois meses e fotos não são excluídos',async()=>{
    assert.equal((await call('/repairs',{...payload,completed:addDays(todayBrasilia(),-200),days:60})).status,201);
    const result=(await call('/repairs?scope=archived')).value.repairs;
    assert.equal(result.length,2);assert.equal((await call('/data')).value.photos.length,5);
  });
  await t.test('backup parado e restauração preservam histórico, acessos, retornos e imagens',async()=>{
    await stop();const restore=await mkdtemp(path.join(os.tmpdir(),'mecanica-restore-'));
    t.after(async()=>{await stop();await rm(restore,{recursive:true,force:true});});
    // Inclui WAL/SHM se o processo foi interrompido antes do checkpoint.
    await cp(dir,restore,{recursive:true});
    await start(restore);const {value:d}=await call('/data');assert.equal(d.repairs.length,3);assert.equal(d.photos.length,5);assert.equal(d.returns.length,2);
    const photo=await fetch(base+'/api/photos/'+d.photos[0].id,{headers:{Cookie:cookie}});assert.equal(photo.status,200);assert.equal(Buffer.from(await photo.arrayBuffer()).toString('base64'),png.split(',')[1]);
  });
});
