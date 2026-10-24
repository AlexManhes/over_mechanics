import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { todayBrasilia, repairState, selectRepairs, normalizePlate, validateRepair, returnWithin, dayNumber } from './lib/domain.mjs';
import { photoStore, migratePhotos } from './lib/photos.mjs';
import { localModeEnabled, isLocalRequest } from './lib/access.mjs';
import { runtimeConfig } from './lib/runtime.mjs';

// A raiz continua sendo a pasta da instalação, preservando data/ e public/.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = runtimeConfig(process.env, root);
const localMode = localModeEnabled({...process.env, PUBLIC_ORIGIN:runtime.publicOrigin});
const dataDir = runtime.dataDir;
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'mecanica.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
-- Empresa responsável desativada. A coluna company é legada e preserva dados antigos.
CREATE TABLE IF NOT EXISTS vehicles(id TEXT PRIMARY KEY,plate TEXT UNIQUE NOT NULL,model TEXT NOT NULL,company TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS repairs(id TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),complaint TEXT NOT NULL,diagnosis TEXT NOT NULL,service TEXT NOT NULL,parts TEXT NOT NULL,mechanic TEXT NOT NULL,completed TEXT NOT NULL,days INTEGER NOT NULL,notes TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS returns(id TEXT PRIMARY KEY,repair_id TEXT NOT NULL REFERENCES repairs(id),date TEXT NOT NULL,description TEXT NOT NULL,action TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),alert_days INTEGER NOT NULL);
INSERT OR IGNORE INTO settings VALUES(1,7);`);
const photosStore = photoStore(dataDir);
migratePhotos(db, photosStore);
const q = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
if(runtime.production && !one("SELECT id FROM users WHERE role != 'local' LIMIT 1") && (!process.env.SETUP_KEY || process.env.SETUP_KEY.length < 24)) throw new Error('Configure uma SETUP_KEY aleatória de pelo menos 24 caracteres antes da primeira publicação.');
const hash = value => createHash('sha256').update(value).digest('hex');
const passwordHash = value => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(value,salt,64).toString('hex')}`; };
// Identidade técnica para os vínculos de auditoria, sem cadastrar uma pessoa.
const localUser = {id:'local-workshop',name:'Uso local',email:'',role:'local'};
if(localMode) run('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?)',localUser.id,localUser.name,'local@internal.invalid',passwordHash(randomBytes(32).toString('hex')),'local');
function passwordMatches(value, stored) { const [salt, key] = stored.split(':'); return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(key, 'hex')); }
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const clean = (v, max = 6000) => { const s = String(v ?? '').trim(); if(s.length > max) fail(`Campo excede ${max} caracteres.`); return s; };
function accountInput(b) {
  const name = clean(b.name,100), email = clean(b.email,200).toLowerCase(), password = String(b.password || '');
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 200) fail('Informe nome, e-mail válido e senha de 10 a 200 caracteres.');
  return { name, email, password };
}
function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; } }
const secure = runtime.secureCookies;
function cookie(token, age = 43200) { return `mj_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`; }
function login(user, res) {
  const token = randomBytes(32).toString('hex');
  run('DELETE FROM sessions WHERE expires < ?', Date.now());
  run('INSERT INTO sessions VALUES(?,?,?)',hash(token),user.id,Date.now()+43200000);
  res.setHeader('Set-Cookie',cookie(token));
  return { id:user.id,name:user.name,email:user.email,role:user.role };
}
function currentUser(req) {
  if(localMode) return isLocalRequest(req) ? localUser : null;
  const token = /(?:^|;\s*)mj_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  return token ? one('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',hash(token),Date.now()) : null;
}
function json(res, data, status = 200) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if(size > 34000000) fail('Limite de 34 MB por envio excedido.',413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { fail('JSON inválido.'); }
}
function photoInput(photos, stages) {
  if (!Array.isArray(photos) || photos.length > 12) fail('Envie até 12 fotos por registro.');
  return photos.map(p => {
    if(!stages.includes(p.stage) || typeof p.data !== 'string' || p.data.length > 2800000) fail('Foto inválida ou maior que 2 MB.');
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(p.data);
    if(!match) fail('Use fotos JPEG, PNG ou WebP.');
    const bytes = Buffer.from(match[2], 'base64');
    const valid = match[1] === 'jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 : match[1] === 'png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
    if(!valid || bytes.length > 2000000) fail('Arquivo de imagem inválido.');
    return {stage:p.stage,mime:`image/${match[1]}`,bytes};
  });
}
function savePhotos(photos, repairId, returnId = null) {
  for(const p of photos) {
    const id = randomUUID(), file = photosStore.write(id, p.mime, p.bytes);
    run('INSERT INTO photos(id,repair_id,return_id,stage,mime,file_path) VALUES(?,?,?,?,?,?)',id,repairId,returnId,p.stage,p.mime,file);
  }
}
const attempts = new Map();
function rateLimit(req) {
  const key = req.socket.remoteAddress; const now = Date.now();
  for(const [k,v] of attempts) if(v.until < now) attempts.delete(k);
  const a = attempts.get(key) || { count:0, until:now+900000 }; a.count++; attempts.set(key,a);
  if(a.count > 30) fail('Muitas tentativas. Aguarde 15 minutos.',429);
}
async function api(req,res,url) {
  const user = currentUser(req), method = req.method, pathname = url.pathname;
  if(localMode && !isLocalRequest(req)) fail('O acesso sem login está disponível somente neste computador.',403);
  if(method !== 'GET') {
    const expected = runtime.publicOrigin || `http://${req.headers.host}`;
    if(req.headers.origin && req.headers.origin !== expected) fail('Origem não autorizada.',403);
    if(req.headers['sec-fetch-site'] === 'cross-site') fail('Origem não autorizada.',403);
    if(!req.headers['content-type']?.startsWith('application/json')) fail('Envie application/json.',415);
  }
  if(pathname === '/api/session' && method === 'GET') return json(res,{ user, authRequired:!localMode, needsSetup: !localMode && !one("SELECT id FROM users WHERE role != 'local' LIMIT 1"), today:todayBrasilia() });
  if(localMode && ['/api/setup','/api/login','/api/logout','/api/users','/api/password'].includes(pathname)) fail('O cadastro e login estão desativados no uso local.',403);
  if(pathname === '/api/setup' && method === 'POST') {
    rateLimit(req); const b = await body(req);
    if(one("SELECT id FROM users WHERE role != 'local' LIMIT 1")) fail('A oficina já foi configurada.',409);
    const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if(process.env.SETUP_KEY ? hash(String(b.setupKey || '')) !== hash(process.env.SETUP_KEY) : !local) fail('Configure a chave SETUP_KEY no servidor para a ativação remota.',403);
    const v = accountInput(b); const id = randomUUID();
    run('INSERT INTO users VALUES(?,?,?,?,?)',id,v.name,v.email,passwordHash(v.password),'admin');
    return json(res,{user:login({id,...v,role:'admin'},res)},201);
  }
  if(pathname === '/api/login' && method === 'POST') {
    rateLimit(req); const b = await body(req); const email = clean(b.email,200).toLowerCase(), password = String(b.password || '');
    if(password.length > 200) fail('E-mail ou senha incorretos.',401);
    const u = one('SELECT * FROM users WHERE email=?',email);
    const dummy = '00000000000000000000000000000000:'+ '00'.repeat(64);
    const valid = passwordMatches(password,u?.password || dummy);
    if(!u || !valid) fail('E-mail ou senha incorretos.',401);
    return json(res,{user:login(u,res)});
  }
  if(!user) fail('Entre com sua conta de mecânico.',401);
  if(pathname === '/api/logout' && method === 'POST') { const token = /mj_session=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1]; if(token)run('DELETE FROM sessions WHERE token=?',hash(token)); res.setHeader('Set-Cookie',cookie('',0)); return json(res,{ok:true}); }
  if(pathname === '/api/data' && method === 'GET') {
    const alertDays = one('SELECT alert_days FROM settings WHERE id=1').alert_days;
    const today = todayBrasilia();
    return json(res,{vehicles:q('SELECT id,plate,model FROM vehicles ORDER BY plate'), repairs:q('SELECT * FROM repairs ORDER BY completed DESC,created_at DESC').map(r=>repairState(r,alertDays,today)),returns:q('SELECT * FROM returns ORDER BY date DESC'),photos:q('SELECT id,repair_id,return_id,stage FROM photos'),alertDays,today,serverNow:new Date().toISOString()});
  }
  if(pathname === '/api/repairs' && method === 'GET') {
    const scope=url.searchParams.get('scope') || 'all';
    if(!['active','archived','all'].includes(scope)) fail('Filtro de arquivamento inválido.');
    const alertDays=one('SELECT alert_days FROM settings WHERE id=1').alert_days, today=todayBrasilia();
    const repairs=selectRepairs(q('SELECT * FROM repairs ORDER BY completed DESC,created_at DESC'),q('SELECT id,plate,model FROM vehicles'),{scope,plate:url.searchParams.get('plate') || '',alertDays,today});
    return json(res,{repairs:repairs.map(r=>repairState(r,alertDays,today)),today});
  }
  if(pathname === '/api/users' && method === 'POST') {
    if(user.role !== 'admin') fail('Apenas administradores podem cadastrar mecânicos.',403);
    const v = accountInput(await body(req)); if(one('SELECT id FROM users WHERE email=?',v.email)) fail('Este e-mail já está cadastrado.',409);
    run('INSERT INTO users VALUES(?,?,?,?,?)',randomUUID(),v.name,v.email,passwordHash(v.password),'mechanic'); return json(res,{ok:true},201);
  }
  if(pathname === '/api/password' && method === 'POST') {
    rateLimit(req); const b=await body(req), u=one('SELECT * FROM users WHERE id=?',user.id), next=String(b.password || '');
    if(String(b.current || '').length>200 || !passwordMatches(String(b.current || ''),u.password)) fail('Senha atual incorreta.');
    if(next.length<10 || next.length>200) fail('A nova senha deve ter de 10 a 200 caracteres.');
    transaction(()=>{run('UPDATE users SET password=? WHERE id=?',passwordHash(next),user.id);run('DELETE FROM sessions WHERE user_id=?',user.id);}); return json(res,{user:login(user,res)});
  }
  if(pathname === '/api/settings' && method === 'POST') {
    const b = await body(req); const days=Number(b.alertDays); if(!Number.isInteger(days)||days<1||days>365) fail('O alerta deve ter de 1 a 365 dias.');
    run('UPDATE settings SET alert_days=? WHERE id=1',days); return json(res,{ok:true});
  }
  if(pathname === '/api/repairs' && method === 'POST') {
    const b=await body(req); validateRepair(b);
    const fields = ['complaint','diagnosis','service','parts','mechanic','notes'].map(f=>clean(b[f],f==='mechanic'?100:6000));
    // Empresa responsável desativada: const company=clean(b.company,150);
    // Não recebemos nem atualizamos esse campo; valores antigos ficam no banco.
    const plate=normalizePlate(b.plate), model=clean(b.model,100),photos=photoInput(b.photos || [],['before','after']);
    const result=transaction(()=>{
      let v=one('SELECT id,plate,model FROM vehicles WHERE plate=?',plate);
      if(!v) { v={id:randomUUID()}; run('INSERT INTO vehicles(id,plate,model,company) VALUES(?,?,?,?)',v.id,plate,model,''); }
      else run('UPDATE vehicles SET model=? WHERE id=?',model||v.model,v.id);
      const id=randomUUID(); run('INSERT INTO repairs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,v.id,fields[0],fields[1],fields[2],fields[3],fields[4],b.completed,Number(b.days),fields[5],user.id,new Date().toISOString());
      savePhotos(photos,id); return {id,vehicleId:v.id};
    }); return json(res,result,201);
  }
  const returnMatch = /^\/api\/repairs\/([^/]+)\/returns$/.exec(pathname);
  if(returnMatch && method === 'POST') {
    const r=one('SELECT * FROM repairs WHERE id=?',returnMatch[1]); if(!r) fail('Reparo não encontrado.',404);
    const b=await body(req),description=clean(b.description),action=clean(b.action), photos=photoInput(b.photos || [],['return']);
    if(!description || !action) fail('Preencha a descrição e as providências.');
    const within=returnWithin(r,b.date); if(dayNumber(b.date)>dayNumber(todayBrasilia())) fail('O retorno não pode estar no futuro.');
    transaction(()=>{const id=randomUUID();run('INSERT INTO returns VALUES(?,?,?,?,?,?)',id,r.id,b.date,description,action,user.id);savePhotos(photos,r.id,id);}); return json(res,{ok:true,within},201);
  }
  const photoMatch=/^\/api\/photos\/([^/]+)$/.exec(pathname);
  if(photoMatch && method==='GET') {
    const p=one('SELECT * FROM photos WHERE id=?',photoMatch[1]); if(!p) fail('Foto não encontrada.',404);
    let bytes; try { bytes=photosStore.read(p.file_path); } catch { fail('Arquivo de foto indisponível. Verifique o armazenamento ou restaure o backup.',404); }
    res.writeHead(200,{'Content-Type':p.mime,'Cache-Control':'no-store','Content-Disposition':'inline'}); return res.end(bytes);
  }
  fail('Recurso não encontrado.',404);
}
const staticFiles={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/photos.js':'photos.js','/styles.css':'styles.css','/domain.mjs':'../src/lib/domain.mjs','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js','/icon.svg':'icon.svg','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png'};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(runtime.production)res.setHeader('Strict-Transport-Security','max-age=15552000');
  try { const url=new URL(req.url,'http://local');
    if(url.pathname==='/healthz'&&req.method==='GET'){one('SELECT 1 AS ok');return json(res,{status:'ok'});}
    if(url.pathname.startsWith('/api/')) return await api(req,res,url);
    if(req.method!=='GET' || !staticFiles[url.pathname]) fail('Página não encontrada.',404);
    const file=path.join(root,'public',staticFiles[url.pathname]); const bytes=readFileSync(file); res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes);
  } catch(e) { if(!res.headersSent) json(res,{error:e.status ? e.message : e.code?.startsWith('SQLITE') ? 'Não foi possível salvar. Tente novamente.' : e.message || 'Erro interno.'},e.status || (e.code ? 500 : 400)); else res.end(); }
});
const {port,host}=runtime;
server.listen(port,host,()=>console.log(`Mecânica já: http://${host}:${server.address().port}`));
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
