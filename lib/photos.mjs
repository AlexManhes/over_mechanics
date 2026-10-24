import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export function photoStore(dataDir) {
  const directory = path.join(dataDir, 'photos');
  mkdirSync(directory, { recursive: true });
  function absolute(file) {
    if (!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(file)) throw new Error('Referência de foto inválida.');
    return path.join(directory, file);
  }
  return {
    directory,
    write(id, mime, bytes) {
      if (!extensions[mime]) throw new Error('Formato de foto inválido.');
      const file = `${createHash('sha256').update(id).digest('hex')}.${extensions[mime]}`;
      const target = absolute(file);
      // Migração pode ser retomada depois de interrupção, sem sobrescrever fotos.
      if (existsSync(target)) {
        if (!readFileSync(target).equals(Buffer.from(bytes))) throw new Error('A foto existente difere da migração. Preserve os dados e verifique o backup.');
      } else {
        const temporary = path.join(directory, `${randomUUID()}.upload`);
        writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600, flush: true });
        renameSync(temporary, target);
      }
      return file;
    },
    read(file) { return readFileSync(absolute(file)); }
  };
}

const schema = name => `CREATE TABLE ${name}(id TEXT PRIMARY KEY,repair_id TEXT NOT NULL REFERENCES repairs(id),return_id TEXT REFERENCES returns(id),stage TEXT NOT NULL,mime TEXT NOT NULL,file_path TEXT UNIQUE NOT NULL)`;
export function migratePhotos(db, store) {
  const columns = db.prepare('PRAGMA table_info(photos)').all();
  if (!columns.length) { db.exec(schema('photos')); return; }
  if (!columns.some(c => c.name === 'bytes')) return;
  // Só troca a tabela depois de gravar/verificar todos os arquivos. Em falha,
  // o rollback mantém os blobs antigos. Arquivos já escritos são reaproveitados.
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(schema('photos_migration'));
    const insert = db.prepare('INSERT INTO photos_migration VALUES(?,?,?,?,?,?)');
    for (const row of db.prepare('SELECT * FROM photos').iterate()) {
      const file = store.write(row.id, row.mime, row.bytes);
      insert.run(row.id, row.repair_id, row.return_id, row.stage, row.mime, file);
    }
    db.exec('DROP TABLE photos; ALTER TABLE photos_migration RENAME TO photos; COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
