// Ferramenta privada: nunca exponha service_role pela interface.
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {supabase} from '../src/cloud/supabase.mjs';
const db=supabase(process.env);
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
const prompt=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
try{
  const name=(await prompt.question('Nome: ')).trim();
  const email=(await prompt.question('E-mail: ')).trim().toLowerCase();
  process.stdout.write('Senha de 10 a 200 caracteres (oculta): ');muted=true;
  const password=await prompt.question('');muted=false;process.stdout.write('\n');
  if(!name||name.length>100||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10||password.length>200)throw new Error('Informe nome, e-mail válido e senha de 10 a 200 caracteres.');
  let user;
  for(let page=1;!user;page++){
    const result=await db.request(`/auth/v1/admin/users?page=${page}&per_page=200`);
    user=result.users.find(u=>u.email?.toLowerCase()===email);
    if(user||result.users.length<200)break;
  }
  if(user){await db.signIn(email,password);}else user=await db.createUser({email,password});
  if(process.argv.includes('--mechanic')){
    const existing=(await db.rows('mj_accounts',{select:'id',auth_id:`eq.${user.id}`,limit:'1'}))[0];
    if(existing)throw new Error('Esta conta já está vinculada. Não foi alterada.');
    await db.insert('mj_accounts',{id:crypto.randomUUID(),auth_id:user.id,name,email,role:'mechanic',active:true});
  }else await db.rpc('mj_bootstrap_admin',{p_id:crypto.randomUUID(),p_auth_id:user.id,p_name:name,p_email:email});
  console.log('Conta autorizada na oficina. A senha não foi salva em arquivos.');
}catch(e){muted=false;console.error('\n'+e.message);process.exitCode=1;}finally{prompt.close();}
