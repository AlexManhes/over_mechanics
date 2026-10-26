// _shared e gerado por npm run build:cloud, sem dependencias de producao.
import {edgeHandler} from '../_shared/edge.mjs';
const env={SUPABASE_URL:Deno.env.get('SUPABASE_URL'),SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),PUBLIC_ORIGIN:Deno.env.get('PUBLIC_ORIGIN'),CLOUD_PROXY_KEY:Deno.env.get('CLOUD_PROXY_KEY'),MAINTENANCE:Deno.env.get('MAINTENANCE')};
Deno.serve(edgeHandler(env));
