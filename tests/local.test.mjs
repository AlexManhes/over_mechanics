import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {localModeEnabled,isLocalRequest} from '../lib/access.mjs';
import {todayBrasilia} from '../lib/domain.mjs';

test('modo sem login fica restrito ao computador e pode ser desativado',()=>{
  assert.equal(localModeEnabled({}),true);
  assert.equal(localModeEnabled({AUTH_REQUIRED:'true'}),false);
  assert.equal(localModeEnabled({HOST:'0.0.0.0'}),false);
  assert.throws(()=>localModeEnabled({AUTH_REQUIRED:'false',HOST:'0.0.0.0'}));
  assert.throws(()=>localModeEnabled({AUTH_REQUIRED:'false',PUBLIC_ORIGIN:'https://oficina.example'}));
  assert.equal(isLocalRequest({socket:{remoteAddress:'127.0.0.1'},headers:{host:'localhost:3000'}}),true);
  assert.equal(isLocalRequest({socket:{remoteAddress:'192.168.0.5'},headers:{host:'localhost:3000'}}),false);
  assert.equal(isLocalRequest({socket:{remoteAddress:'127.0.0.1'},headers:{host:'oficina.example'}}),false);
});
test('uso direto salva registro e foto sem cadastro; reativar login preserva os dados',async t=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const directory=await mkdtemp(path.join(os.tmpdir(),'mecanica-local-'));let child,base;
  async function start(required){child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'0',AUTH_REQUIRED:String(required),DATA_DIR:directory,PUBLIC_ORIGIN:'',COOKIE_SECURE:'false',SETUP_KEY:''},stdio:['ignore','pipe','pipe']});base=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('Servidor não iniciou')),10000);child.on('error',reject);child.stdout.on('data',part=>{out+=part;const match=/http:\/\/127\.0\.0\.1:\d+/.exec(out);if(match){clearTimeout(timer);resolve(match[0]);}});});}
  async function stop(){if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
  async function request(route,value,extra={}){return fetch(base+'/api'+route,{method:value===undefined?'GET':'POST',headers:{...(value===undefined?{}:{'Content-Type':'application/json'}),...extra},body:value===undefined?undefined:JSON.stringify(value)});}
  t.after(async()=>{await stop();await rm(directory,{recursive:true,force:true});});
  await start(false);
  const session=await(await request('/session')).json();assert.equal(session.authRequired,false);assert.equal(session.needsSetup,false);assert.equal(session.user.role,'local');
  assert.equal((await request('/data',undefined,{'X-Forwarded-For':'192.168.1.1'})).status,403);
  assert.equal((await request('/setup',{})).status,403);
  const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZxkAAAAASUVORK5CYII=';
  assert.equal((await request('/repairs',{plate:'ABC1D23',completed:todayBrasilia(),days:30,complaint:'Ruído',diagnosis:'Desgaste',service:'Troca',mechanic:'João',photos:[{stage:'before',data:photo}]})).status,201);
  let data=await(await request('/data')).json();assert.equal(data.repairs.length,1);assert.equal(data.repairs[0].mechanic,'João');assert.equal((await request('/photos/'+data.photos[0].id)).status,200);
  await stop();await start(false);data=await(await request('/data')).json();assert.equal(data.repairs.length,1);
  await stop();await start(true);assert.equal((await request('/data')).status,401);
  assert.equal((await(await request('/session')).json()).needsSetup,true);
  const setup=await request('/setup',{name:'Administrador',email:'admin@example.test',password:'SenhaFicticia123!'});assert.equal(setup.status,201);
  const cookie=setup.headers.get('set-cookie').split(';')[0];data=await(await request('/data',undefined,{Cookie:cookie})).json();assert.equal(data.repairs.length,1);assert.equal((await request('/photos/'+data.photos[0].id,undefined,{Cookie:cookie})).status,200);
});
