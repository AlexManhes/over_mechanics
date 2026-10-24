import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('iniciador usa CRLF e texto ASCII para compatibilidade com cmd.exe',()=>{
  const source=readFileSync(path.join(root,'Iniciar.bat'));
  assert.ok(source.every(b=>b<128));
  assert.ok(source.includes(Buffer.from('\r\n')));
  assert.equal(source.toString().replaceAll('\r\n','').includes('\n'),false);
});
test('duplo clique via cmd inicia backend real em pasta com espacos e acentos',{skip:process.platform!=='win32'},()=>{
  const temporary=mkdtempSync(path.join(os.tmpdir(),'mecanica-launcher-'));
  try {
    const fixture=path.join(temporary,'Mecânica Já teste de inicialização');mkdirSync(fixture);
    const launcher=path.join(fixture,'Iniciar.bat');writeFileSync(launcher,readFileSync(path.join(root,'Iniciar.bat')));
    // O servidor real roda com banco temporário e porta aleatória; não toca os dados da oficina.
    writeFileSync(path.join(fixture,'server.mjs'),`
      import {spawn} from 'node:child_process';
      import assert from 'node:assert/strict';
      const child=spawn(process.execPath,[${JSON.stringify(path.join(root,'server.mjs'))}],{env:{...process.env,AUTH_REQUIRED:'true',HOST:'127.0.0.1',PORT:'0',DATA_DIR:${JSON.stringify(path.join(temporary,'dados'))},PUBLIC_ORIGIN:'',COOKIE_SECURE:'false',SETUP_KEY:''},stdio:['ignore','pipe','pipe']});
      let exit;
      try {
        const base=await new Promise((resolve,reject)=>{let output='';const timeout=setTimeout(()=>reject(new Error('Servidor nao iniciou')),10000);child.on('error',reject);child.stdout.on('data',data=>{output+=data;const match=/http:\\/\\/127\\.0\\.0\\.1:\\d+/.exec(output);if(match){clearTimeout(timeout);resolve(match[0]);}});});
        const response=await fetch(base+'/api/session');assert.equal(response.status,200);assert.equal((await response.json()).needsSetup,true);
        assert.equal((await fetch(base+'/')).status,200);console.log('INICIADOR_VALIDADO_BACKEND_HTTP_200');
      } finally {
        if(child.exitCode===null && child.signalCode===null){exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;}
      }
    `);
    for(const useFallback of [false,true]) {
      const env={...process.env};
      if(useFallback)env.PATH=path.join(process.env.SystemRoot,'System32');
      const result=spawnSync(process.env.ComSpec || 'cmd.exe',['/d','/c',launcher],{env,encoding:'utf8',timeout:20000,windowsHide:true,input:'\r\n'});
      assert.equal(result.status,0,`${result.stdout}\n${result.stderr}\n${result.error||''}`);
      assert.match(result.stdout,/INICIADOR_VALIDADO_BACKEND_HTTP_200/);
      assert.doesNotMatch(result.stdout,/nao encontrado|precisa ser atualizado|encerrou com erro/);
    }
  } finally {rmSync(temporary,{recursive:true,force:true});}
});
