import {mkdir,copyFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist/cloud'),shared=path.join(root,'supabase/functions/_shared');
await mkdir(dist,{recursive:true});await mkdir(shared,{recursive:true});
const publicFiles=['index.html','app.js','photos.js','styles.css','manifest.webmanifest','sw.js','icon.svg','icon-192.png','icon-512.png'];
for(const name of await readdir(dist))if(![...publicFiles,'domain.mjs'].includes(name))throw new Error('Arquivo inesperado em dist/cloud. Revise a pasta antes de publicar: '+name);
// Lista fechada: nunca copiar banco, fotos, .env e backups para os assets.
for(const name of publicFiles)await copyFile(path.join(root,'public',name),path.join(dist,name));
await copyFile(path.join(root,'src/lib/domain.mjs'),path.join(dist,'domain.mjs'));
await copyFile(path.join(root,'src/lib/domain.mjs'),path.join(root,'src/cloud/domain.mjs'));
await copyFile(path.join(root,'src/lib/domain.mjs'),path.join(shared,'domain.mjs'));
for(const name of ['api.mjs','supabase.mjs','edge.mjs'])await copyFile(path.join(root,'src/cloud',name),path.join(shared,name));
console.log('PWA e API da nuvem preparadas sem dados privados.');
