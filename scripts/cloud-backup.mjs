import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {supabase} from '../src/cloud/supabase.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const filePath=(directory,key)=>{if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))throw new Error('Caminho de imagem inválido.');return path.join(directory,'photos',key);};
async function newDirectory(directory){await mkdir(directory);await mkdir(path.join(directory,'photos'));}
async function manifest(directory,value){await writeFile(path.join(directory,'manifest.json'),JSON.stringify(value,null,2),{flag:'wx',mode:0o600});}

export async function exportLocal(dataDir,destination){
  const db=new DatabaseSync(path.join(dataDir,'mecanica.sqlite'),{readOnly:true});
  try{
    db.exec('BEGIN');
    const rows=table=>db.prepare(`SELECT * FROM ${table}`).all();
    const value={format:'over-mechanics-backup-v1',accounts:rows('users').map(({id,name,email})=>({id,name,email})),vehicles:rows('vehicles'),repairs:rows('repairs'),returns:rows('returns'),photos:[],alertDays:rows('settings')[0].alert_days};
    const photos=rows('photos');await newDirectory(destination);
    for(const p of photos){
      if(!extension[p.mime])throw new Error('Imagem em formato incompatível.');
      if(p.file_path&&!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(p.file_path))throw new Error('Caminho de foto local inválido.');
      const bytes=p.bytes?Buffer.from(p.bytes):await readFile(path.join(dataDir,'photos',p.file_path));
      const object_key=hash(p.id)+'.'+extension[p.mime];
      await writeFile(filePath(destination,object_key),bytes,{flag:'wx',mode:0o600});
      value.photos.push({id:p.id,repair_id:p.repair_id,return_id:p.return_id??null,stage:p.stage,mime:p.mime,object_key,sha256:hash(bytes),size:bytes.length});
    }
    await manifest(destination,value);db.exec('COMMIT');return value;
  }finally{db.close();}
}
export async function validateBackup(directory){
  const bundle=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
  if(bundle.format!=='over-mechanics-backup-v1'||!Number.isInteger(bundle.alertDays)||bundle.alertDays<1||bundle.alertDays>365)throw new Error('Manifesto inválido.');
  for(const table of ['accounts','vehicles','repairs','returns','photos']){
    if(!Array.isArray(bundle[table])||new Set(bundle[table].map(x=>x.id)).size!==bundle[table].length)throw new Error(`Registros inválidos em ${table}.`);
  }
  const ids=table=>new Set(bundle[table].map(x=>x.id)),accounts=ids('accounts'),vehicles=ids('vehicles'),repairs=ids('repairs'),returns=ids('returns');
  for(const r of bundle.repairs)if(!vehicles.has(r.vehicle_id)||!accounts.has(r.created_by))throw new Error('Reparo sem veículo/autor.');
  for(const r of bundle.returns)if(!repairs.has(r.repair_id)||!accounts.has(r.created_by))throw new Error('Retorno sem reparo/autor.');
  for(const p of bundle.photos){
    const isReturn=p.stage==='return',linked=bundle.returns.find(r=>r.id===p.return_id);
    if(!repairs.has(p.repair_id)||!['before','after','return'].includes(p.stage)||(isReturn?(!returns.has(p.return_id)||linked.repair_id!==p.repair_id):p.return_id!==null)||!extension[p.mime]||!p.object_key.endsWith('.'+extension[p.mime]))throw new Error('Referência de foto inválida.');
    const bytes=await readFile(filePath(directory,p.object_key));
    if(bytes.length!==p.size||hash(bytes)!==p.sha256||p.size>2000000)throw new Error('Foto ausente, alterada ou corrompida.');
  }
  return bundle;
}
export async function uploadBackup(directory,db){
  const bundle=await validateBackup(directory);
  for(const p of bundle.photos){
    let existing;try{existing=await db.download(p.object_key);}catch(e){if(e.upstreamStatus!==404&&e.upstreamStatus!==400)throw e;}
    // Storage retorna 400 "not found" em algumas versoes. Se um objeto existe,
    // sempre confira seu conteudo. Nao use upsert nem substitua imagens.
    if(existing){if(hash(Buffer.from(await existing.arrayBuffer()))!==p.sha256)throw new Error('Foto remota divergente. Importação interrompida.');}
    else await db.upload({...p,bytes:await readFile(filePath(directory,p.object_key))});
  }
  await db.rpc('mj_import',{p_bundle:bundle});return bundle;
}
export async function backupCloud(destination,db){
  const bundle=await db.rpc('mj_export');await newDirectory(destination);
  for(const p of bundle.photos){const bytes=Buffer.from(await (await db.download(p.object_key)).arrayBuffer());if(hash(bytes)!==p.sha256)throw new Error('Foto remota corrompida; backup incompleto.');await writeFile(filePath(destination,p.object_key),bytes,{flag:'wx',mode:0o600});}
  await manifest(destination,bundle);await validateBackup(destination);return bundle;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [command,first,second]=process.argv.slice(2);if(!first)throw new Error('Uso: export-local PASTA_DATA DESTINO | validate BACKUP | upload BACKUP | backup DESTINO');
    let result;
    if(command==='export-local'){if(!second)throw new Error('Informe um destino NOVO para o backup.');result=await exportLocal(path.resolve(first),path.resolve(second));}
    else if(command==='validate')result=await validateBackup(path.resolve(first));
    else if(command==='upload')result=await uploadBackup(path.resolve(first),supabase(process.env));
    else if(command==='backup')result=await backupCloud(path.resolve(first),supabase(process.env));
    else throw new Error('Comando desconhecido.');
    console.log(`Concluído: ${result.vehicles.length} veículos, ${result.repairs.length} atendimentos, ${result.returns.length} retornos e ${result.photos.length} fotos.`);
    console.log('Contas/senhas e agendamento de backup são configurados separadamente.');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
