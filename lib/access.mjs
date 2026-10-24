const loopbackHosts = ['127.0.0.1', 'localhost', '::1'];
export function localModeEnabled(env = process.env) {
  const flag = env.AUTH_REQUIRED;
  if (flag !== undefined && !['true','false'].includes(flag)) throw new Error('AUTH_REQUIRED deve ser true ou false.');
  const localHost = loopbackHosts.includes(env.HOST || '127.0.0.1');
  if (flag === 'false' && (!localHost || env.PUBLIC_ORIGIN)) throw new Error('O modo sem login exige HOST=127.0.0.1 e nenhum PUBLIC_ORIGIN. Para acesso pela rede, use AUTH_REQUIRED=true.');
  return flag !== 'true' && localHost && !env.PUBLIC_ORIGIN;
}
export function isLocalRequest(req) {
  const address = req.socket.remoteAddress;
  let host; try {host = new URL(`http://${req.headers.host}`).hostname;} catch {return false;}
  return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)
    && ['127.0.0.1','localhost','[::1]'].includes(host)
    && !req.headers.forwarded && !req.headers['x-forwarded-for'];
}
