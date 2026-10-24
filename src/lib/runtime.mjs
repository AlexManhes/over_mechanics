import path from 'node:path';

export function runtimeConfig(env, root) {
  const production = env.NODE_ENV === 'production' || env.RENDER === 'true';
  const rawOrigin = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || '';
  let publicOrigin = '';
  if (rawOrigin) {
    let value; try { value = new URL(rawOrigin); } catch { throw new Error('PUBLIC_ORIGIN deve ser um endereço HTTP/HTTPS válido.'); }
    if (!['http:','https:'].includes(value.protocol) || value.username || value.password || value.pathname !== '/' || value.search || value.hash) throw new Error('PUBLIC_ORIGIN deve conter apenas protocolo e domínio, sem caminho ou credenciais.');
    publicOrigin = value.origin;
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT inválida.');
  if (production) {
    if (env.AUTH_REQUIRED !== 'true') throw new Error('Em produção, configure AUTH_REQUIRED=true.');
    if (env.COOKIE_SECURE !== 'true') throw new Error('Em produção HTTPS, configure COOKIE_SECURE=true.');
    if (!publicOrigin.startsWith('https://')) throw new Error('Em produção, configure PUBLIC_ORIGIN HTTPS ou use RENDER_EXTERNAL_URL.');
    if (!env.DATA_DIR || !path.isAbsolute(env.DATA_DIR)) throw new Error('Em produção, DATA_DIR deve ser o caminho absoluto do disco persistente.');
  }
  return { production, publicOrigin, port, host:env.HOST || '127.0.0.1', dataDir:env.DATA_DIR || path.join(root,'data'), secureCookies:env.COOKIE_SECURE === 'true' };
}
