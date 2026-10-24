import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runtimeConfig} from '../src/lib/runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('produção exige login, cookies seguros, HTTPS e pasta persistente explícita',()=>{
  const valid={NODE_ENV:'production',AUTH_REQUIRED:'true',COOKIE_SECURE:'true',DATA_DIR:path.join(os.tmpdir(),'volume'),RENDER_EXTERNAL_URL:'https://oficina.example/'};
  const config=runtimeConfig(valid,root);assert.equal(config.publicOrigin,'https://oficina.example');assert.equal(config.production,true);
  assert.equal(runtimeConfig({...valid,PUBLIC_ORIGIN:'https://dominio-proprio.example'},root).publicOrigin,'https://dominio-proprio.example');
  for(const patch of [{AUTH_REQUIRED:'false'},{COOKIE_SECURE:'false'},{RENDER_EXTERNAL_URL:''},{DATA_DIR:''},{DATA_DIR:'pasta-relativa'},{PUBLIC_ORIGIN:'http://oficina.example'},{PUBLIC_ORIGIN:'https://oficina.example/rota'}])assert.throws(()=>runtimeConfig({...valid,...patch},root));
  assert.equal(runtimeConfig({},root).dataDir,path.join(root,'data'));
});
test('servidor atrás de HTTPS: saúde sem dados privados, ativação protegida e cookie seguro',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'mecanica-production-'));
  const setupKey='chave-ficticia-de-validacao-123456';
  const env={...process.env,RENDER:'true',RENDER_EXTERNAL_URL:'https://oficina.example',PUBLIC_ORIGIN:'',NODE_ENV:'production',AUTH_REQUIRED:'true',COOKIE_SECURE:'true',DATA_DIR:directory,SETUP_KEY:setupKey,HOST:'127.0.0.1',PORT:'0'};
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});await rm(directory,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Servidor não iniciou')),10000);child.on('error',reject);child.stdout.on('data',part=>{output+=part;const match=/http:\/\/127\.0\.0\.1:\d+/.exec(output);if(match){clearTimeout(timer);resolve(match[0]);}});});
  const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});assert.match(health.headers.get('strict-transport-security'),/max-age=/);
  assert.equal((await fetch(base+'/api/data')).status,401);
  const body={name:'Admin de teste',email:'teste@example.test',password:'SenhaFicticia123!',setupKey};
  async function post(value,origin='https://oficina.example'){return fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(value)});}
  assert.equal((await post({...body,setupKey:''})).status,403);
  assert.equal((await post(body,'https://outro.example')).status,403);
  const result=await post(body);assert.equal(result.status,201);assert.match(result.headers.get('set-cookie'),/; Secure/);assert.match(result.headers.get('set-cookie'),/HttpOnly/);
  const cookie=result.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(base+'/api/data',{headers:{Cookie:cookie}})).status,200);
});
