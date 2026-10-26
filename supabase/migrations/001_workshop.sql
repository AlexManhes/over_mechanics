-- Execute no SQL Editor de um projeto Supabase dedicado a UMA oficina.
-- Nada e acessivel com as chaves anon/publishable ou com um JWT do navegador.
begin;
create table if not exists public.mj_accounts (
  id text primary key, auth_id uuid unique references auth.users(id),
  name text not null, email text not null, role text not null check(role in ('admin','mechanic','legacy')),
  active boolean not null default false
);
create table if not exists public.mj_sessions (
  token text primary key check(length(token)=64), account_id text not null references public.mj_accounts(id), expires bigint not null
);
create index if not exists mj_sessions_expiry on public.mj_sessions(expires);
create table if not exists public.mj_attempts (key text primary key, count integer not null, expires bigint not null);
-- company e legado: preservado na migracao, desativado nas telas/API.
create table if not exists public.mj_vehicles (id text primary key, plate text unique not null check(plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'), model text not null default '', company text not null default '');
create table if not exists public.mj_repairs (
  id text primary key, vehicle_id text not null references public.mj_vehicles(id),
  complaint text not null check(length(complaint) between 1 and 6000), diagnosis text not null check(length(diagnosis) between 1 and 6000),
  service text not null check(length(service) between 1 and 6000), parts text not null, mechanic text not null check(length(mechanic) between 1 and 100),
  completed date not null, days integer not null check(days between 1 and 3650), notes text not null,
  created_by text not null references public.mj_accounts(id), created_at text not null
);
create table if not exists public.mj_returns (
  id text primary key, repair_id text not null references public.mj_repairs(id), date date not null,
  description text not null check(length(description) between 1 and 6000), action text not null check(length(action) between 1 and 6000),
  created_by text not null references public.mj_accounts(id)
);
create table if not exists public.mj_photos (
  id text primary key, repair_id text not null references public.mj_repairs(id), return_id text references public.mj_returns(id),
  stage text not null check(stage in ('before','after','return')), mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
  object_key text unique not null, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), size integer not null check(size between 1 and 2000000),
  check ((stage='return' and return_id is not null) or (stage in ('before','after') and return_id is null))
);
create table if not exists public.mj_settings(id integer primary key check(id=1), alert_days integer not null check(alert_days between 1 and 365));
insert into public.mj_settings values(1,7) on conflict do nothing;
create index if not exists mj_repairs_vehicle on public.mj_repairs(vehicle_id);
create index if not exists mj_returns_repair on public.mj_returns(repair_id);
create index if not exists mj_photos_repair on public.mj_photos(repair_id);

create or replace function public.mj_allow_attempt(p_key text) returns boolean
language plpgsql set search_path=public,pg_temp as $$
declare n bigint := floor(extract(epoch from clock_timestamp())*1000); c integer;
begin
  delete from mj_attempts where expires<n;
  insert into mj_attempts values(p_key,1,n+900000)
    on conflict(key) do update set count=mj_attempts.count+1 returning count into c;
  return c<=30;
end $$;

create or replace function public.mj_bootstrap_admin(p_id text,p_auth_id uuid,p_name text,p_email text) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
  lock table mj_accounts in share row exclusive mode;
  if exists(select 1 from mj_accounts where role='admin' and active) then raise exception 'Administrador ja cadastrado'; end if;
  insert into mj_accounts values(p_id,p_auth_id,p_name,p_email,'admin',true);
end $$;

create or replace function public.mj_create_session(p_token text,p_actor text,p_expires bigint) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
  delete from mj_sessions where expires<floor(extract(epoch from clock_timestamp())*1000);
  if not exists(select 1 from mj_accounts where id=p_actor and active and auth_id is not null and role in ('admin','mechanic')) then raise exception 'Conta indisponivel'; end if;
  insert into mj_sessions values(p_token,p_actor,p_expires);
end $$;

create or replace function public.mj_read_data() returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'vehicles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'plate',plate,'model',model) order by plate) from mj_vehicles),'[]'::jsonb),
  'repairs',coalesce((select jsonb_agg(to_jsonb(r) order by completed desc,created_at desc) from mj_repairs r),'[]'::jsonb),
  'returns',coalesce((select jsonb_agg(to_jsonb(r) order by date desc) from mj_returns r),'[]'::jsonb),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',id,'repair_id',repair_id,'return_id',return_id,'stage',stage)) from mj_photos),'[]'::jsonb),
  'alertDays',(select alert_days from mj_settings where id=1)
 )
$$;

create or replace function public.mj_add_repair(p_actor text,p_vehicle jsonb,p_repair jsonb,p_photos jsonb) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare v text; photo jsonb;
begin
 if not exists(select 1 from mj_accounts where id=p_actor and active and role in ('admin','mechanic')) then raise exception 'Conta indisponivel'; end if;
 if (p_repair->>'completed')::date > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data futura'; end if;
 insert into mj_vehicles(id,plate,model) values(p_vehicle->>'id',p_vehicle->>'plate',p_vehicle->>'model')
 on conflict(plate) do update set model=coalesce(nullif(excluded.model,''),mj_vehicles.model) returning id into v;
 insert into mj_repairs values(p_repair->>'id',v,p_repair->>'complaint',p_repair->>'diagnosis',p_repair->>'service',p_repair->>'parts',p_repair->>'mechanic',(p_repair->>'completed')::date,(p_repair->>'days')::integer,p_repair->>'notes',p_actor,p_repair->>'created_at');
 if jsonb_array_length(p_photos)>12 then raise exception 'Limite de fotos'; end if;
 for photo in select value from jsonb_array_elements(p_photos) loop
  if photo->>'stage' not in ('before','after') then raise exception 'Etapa invalida'; end if;
  insert into mj_photos values(photo->>'id',p_repair->>'id',null,photo->>'stage',photo->>'mime',photo->>'object_key',photo->>'sha256',(photo->>'size')::integer);
 end loop;
 return jsonb_build_object('id',p_repair->>'id','vehicleId',v);
end $$;

create or replace function public.mj_add_return(p_actor text,p_return jsonb,p_photos jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare original mj_repairs; photo jsonb;
begin
 if not exists(select 1 from mj_accounts where id=p_actor and active and role in ('admin','mechanic')) then raise exception 'Conta indisponivel'; end if;
 select * into strict original from mj_repairs where id=p_return->>'repair_id';
 if (p_return->>'date')::date<original.completed or (p_return->>'date')::date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data do retorno invalida'; end if;
 insert into mj_returns values(p_return->>'id',original.id,(p_return->>'date')::date,p_return->>'description',p_return->>'action',p_actor);
 if jsonb_array_length(p_photos)>12 then raise exception 'Limite de fotos'; end if;
 for photo in select value from jsonb_array_elements(p_photos) loop
  if photo->>'stage'<>'return' then raise exception 'Etapa invalida'; end if;
  insert into mj_photos values(photo->>'id',original.id,p_return->>'id','return',photo->>'mime',photo->>'object_key',photo->>'sha256',(photo->>'size')::integer);
 end loop;
end $$;

-- Exporta os dados de negocio. Senhas, tokens e sessoes nao entram no backup.
create or replace function public.mj_export() returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('format','over-mechanics-backup-v1',
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email)) from mj_accounts),'[]'::jsonb),
 'vehicles',coalesce((select jsonb_agg(to_jsonb(v)) from mj_vehicles v),'[]'::jsonb),
 'repairs',coalesce((select jsonb_agg(to_jsonb(r)) from mj_repairs r),'[]'::jsonb),
 'returns',coalesce((select jsonb_agg(to_jsonb(r)) from mj_returns r),'[]'::jsonb),
 'photos',coalesce((select jsonb_agg(to_jsonb(p)) from mj_photos p),'[]'::jsonb),
 'alertDays',(select alert_days from mj_settings where id=1))
$$;

-- Importacao transacional, retomavel e sem sobrescrever registros divergentes.
create or replace function public.mj_import(p_bundle jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare item jsonb; tbl text; existing jsonb;
begin
 if p_bundle->>'format'<>'over-mechanics-backup-v1' then raise exception 'Formato de backup invalido'; end if;
 lock table mj_vehicles,mj_repairs,mj_returns,mj_photos,mj_settings in share row exclusive mode;
 for item in select value from jsonb_array_elements(p_bundle->'accounts') loop
   insert into mj_accounts(id,name,email,role,active) values(item->>'id',item->>'name',item->>'email','legacy',false) on conflict(id) do nothing;
   if not exists(select 1 from mj_accounts where id=item->>'id' and name=item->>'name' and email=item->>'email') then raise exception 'Autor historico divergente'; end if;
 end loop;
 foreach tbl in array array['vehicles','repairs','returns','photos'] loop
   for item in select value from jsonb_array_elements(p_bundle->tbl) loop
     execute format('select to_jsonb(t) from %I t where id=$1','mj_'||tbl) into existing using item->>'id';
     if existing is not null then
       if existing is distinct from item then raise exception 'Registro divergente em %: %',tbl,item->>'id'; end if;
     else
       execute format('insert into %I select * from jsonb_populate_record(null::%I,$1)','mj_'||tbl,'mj_'||tbl) using item;
     end if;
   end loop;
 end loop;
 update mj_settings set alert_days=(p_bundle->>'alertDays')::integer where id=1;
end $$;

-- Buckets privados: fotos nao podem ser lidas pela URL publica do Storage.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('repair-photos','repair-photos',false,2000000,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=2000000,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

do $$ declare t text; f record;
begin
 foreach t in array array['mj_accounts','mj_sessions','mj_attempts','mj_vehicles','mj_repairs','mj_returns','mj_photos','mj_settings'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on table public.%I from public,anon,authenticated',t);
   execute format('grant all on table public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'mj\_%' escape '\' loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
