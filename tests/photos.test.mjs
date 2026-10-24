import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync,readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { photoStore,migratePhotos } from '../src/lib/photos.mjs';

test('migra imagens legadas do SQLite para arquivos e preserva as referências',t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'mecanica-migration-'));
  const db=new DatabaseSync(':memory:');
  t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  db.exec('CREATE TABLE repairs(id TEXT PRIMARY KEY); INSERT INTO repairs VALUES(\'reparo1\'); CREATE TABLE returns(id TEXT PRIMARY KEY); CREATE TABLE photos(id TEXT PRIMARY KEY,repair_id TEXT,return_id TEXT,stage TEXT,mime TEXT,bytes BLOB NOT NULL)');
  const bytes=Buffer.from('foto-legada');
  db.prepare('INSERT INTO photos VALUES(?,?,?,?,?,?)').run('foto1','reparo1',null,'before','image/jpeg',bytes);
  const store=photoStore(directory);
  migratePhotos(db,store);
  const migrated=db.prepare('SELECT * FROM photos').get();
  assert.equal(migrated.id,'foto1');assert.equal(migrated.repair_id,'reparo1');assert.equal(migrated.stage,'before');
  assert.equal(migrated.bytes,undefined);assert.match(migrated.file_path,/^[a-f0-9]{64}\.jpg$/);
  assert.deepEqual(store.read(migrated.file_path),bytes);
  migratePhotos(db,store);assert.equal(readdirSync(store.directory).length,1);
  assert.throws(()=>store.read('../mecanica.sqlite'));
});
test('falha de migração mantém a foto legada e permite retomar sem apagar dados',t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'mecanica-rollback-'));
  const db=new DatabaseSync(':memory:');
  t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  db.exec('CREATE TABLE repairs(id TEXT PRIMARY KEY); INSERT INTO repairs VALUES(\'reparo1\'); CREATE TABLE returns(id TEXT PRIMARY KEY); CREATE TABLE photos(id TEXT PRIMARY KEY,repair_id TEXT,return_id TEXT,stage TEXT,mime TEXT,bytes BLOB NOT NULL)');
  db.prepare('INSERT INTO photos VALUES(?,?,?,?,?,?)').run('foto1','reparo1',null,'after','image/jpeg',Buffer.from('imagem'));
  assert.throws(()=>migratePhotos(db,{write(){throw new Error('Disco indisponível');}}));
  assert.equal(Buffer.from(db.prepare('SELECT bytes FROM photos').get().bytes).toString(),'imagem');
  migratePhotos(db,photoStore(directory));
  assert.equal(db.prepare('SELECT stage FROM photos').get().stage,'after');
});
