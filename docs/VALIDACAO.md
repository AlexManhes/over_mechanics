# Validação — Mecânica Já

**Resultado atual da versão 1.3.0: 47 testes locais aprovados em 26/10/2026.** A seção final detalha a adaptação Cloudflare/Supabase e suas pendências externas. Os registros anteriores abaixo documentam as etapas da versão local.

Windows, Node.js 24.22.1, Chromium integrado. Data: 24/10/2026. Bancos isolados, sem dados/contas de teste incluídos na entrega.

`node --test tests/*.test.mjs` → **33 aprovados, 0 falhas** (inclui o teste que agrupa os subtestes HTTP).

Cobertura: cadastro, placa/histórico, autorização, sessão e senha, fotos Antes/Depois/Retorno em disco e referências SQLite, persistência após reinício, 30/60 dias, alerta configurável, datas de Brasília, último dia ativo e dia seguinte arquivado, retorno em arquivado, preservação por mais de dois meses, migração legada com rollback e retomada, duas sessões HTTP independentes na mesma base e restauração de backup completo em nova pasta.

No navegador foram conferidos:

- Painel com ativos e arquivados separados; 8 dias em verde, 7 em laranja e vencimento hoje em vermelho com pulsação branca.
- Encerrado em vermelho sem animação; seção Arquivados com busca parcial pela placa.
- Detalhes e histórico preservados, retorno de um arquivado classificado “Depois do prazo”.
- Upload de uma imagem de 4000 × 3000 px; JPEG resultante de 2048 × 1536 px gravado no servidor.
- Layout e navegação de celular e computador.

As capturas em `docs/images/` usam dados fictícios exclusivamente para demonstrar as telas.

Limites: duas sessões confirmam o backend compartilhado, mas uma conexão entre PC/celular físicos na rede real depende de firewall/endereço comum e ainda precisa ser verificada. Câmera física e instalação em Android/iPhone requerem aparelhos e HTTPS. A virada do dia foi testada com datas controladas, sem esperar a meia-noite real. Hospedagem, HTTPS e backups agendados não foram configurados. Se o servidor for o PC, ele precisa permanecer ligado e acessível. Não houve teste de carga para grandes frotas.


Correção do iniciador Windows: arquivo ASCII com quebras CRLF e regra .gitattributes. Dois testes adicionais verificam o formato e executam o iniciador pelo cmd.exe em pasta com espaços/acentos, tanto com Node no PATH quanto pelo runtime alternativo. O backend real responde HTTP 200, com banco temporário isolado.


Uso local sem login: verificados acesso direto, salvamento de atendimento e foto, persistência após reinício, recusa de acesso remoto/proxy e reativação das contas sem perda dos dados. Dois testes adicionais cobrem essas regras.


CSS/manifesto e empresa desativada: endpoints HTTP 200 com MIME correto e URLs versionadas; testes do cache com servidor offline, cache indisponível e ausência de cache. Dados legados de empresa são preservados e o payload novo não os altera. No navegador: cadastro, detalhe, histórico e novo atendimento sem empresa, console sem erros/avisos, e CSS carregado com servidor desligado enquanto a tela orienta abrir Iniciar.bat.


Reorganização do repositório: backend em src/, guias em docs/ e exemplo de proxy em config/. O iniciador e o caminho padrão de data/ continuam na raiz. A suíte completa foi executada novamente sobre essa estrutura.


Preparação online: dois testes adicionais verificam a configuração obrigatória de produção e o fluxo atrás de proxy HTTPS (origem pública automática, chave de ativação, cookie Secure/HttpOnly, dados autenticados e health check público sem dados privados). A suíte passa com 33 testes. A publicação real, o disco do provedor, a conexão entre aparelhos físicos e a migração de dados locais ainda dependem da conta/serviço escolhido; não foram apresentados como concluídos.

## Adaptação Cloudflare + Supabase — 1.3.0

Suíte completa executada com **47 testes aprovados, zero falhas**, em 26/10/2026. Inclui as regressões Node/SQLite, iniciador Windows, cache PWA e as novas verificações:

- PostgreSQL em WASM (PGlite) executa o esquema e as funções SQL efetivos: reparos, retorno, transação/rollback, RLS e importação/exportação.
- API integrada a esse banco: autenticação obrigatória, cookies seguros com hash no banco, autorização administrativa, troca de senha/revogação, CSRF e acesso privado às fotos.
- Cadastro com placas normalizadas, vários atendimentos, 30/60 dias, cores conforme relógio de Brasília, arquivados pesquisáveis e retorno dentro/depois, sem alterar o reparo.
- Dois clientes e uma nova instância da API consultam o mesmo banco e as mesmas imagens.
- Exportação SQLite somente leitura, com empresa legada preservada, sem senhas; importação retomável e recusa de divergências; backup/restauração dos vínculos e dos bytes das fotos por SHA-256.
- Histórico com 1.100 reparos, sem o truncamento padrão de consultas paginadas.
- Proxy em streaming + verificação privada da Edge Function; chave administrativa fora do Worker/assets; bloqueio do acesso direto sem segredo.

Os adaptadores de **Supabase Auth, Storage e transporte HTTP** são exclusivos dos testes locais; eles não comprovam uma conta/projeto remoto configurados. O SQL executa em PostgreSQL real compilado para WASM. Os testes não tocaram nos dados reais da oficina. As imagens de teste são fictícias.

O build de arquivos públicos/módulos compartilhados e a sintaxe Node foram verificados. O dry-run nativo do Wrangler foi impedido pelo Controle de Aplicativo do Windows ao iniciar esbuild; não foram alteradas políticas nem apresentado esse comando local como aprovado. A [execução do GitHub Actions em Linux para o commit c641acd](https://github.com/AlexManhes/over_mechanics/actions/runs/40331013612) **concluiu com sucesso**: 46 testes aprovados, zero falhas e um teste específico de cmd.exe ignorado; `wrangler deploy --dry-run` aprovado, com 10 assets públicos e Worker de 3,36 KiB. O teste de cmd.exe passou no Windows junto à suíte local de 47 testes. Nenhuma credencial/deploy de produção foi usado no CI.

**Pendentes de configuração externa:** aplicar o esquema no Supabase, criar contas Auth, configurar segredos/bucket, publicar a Edge Function e o Worker, transferir dados reais e validar o serviço com celular/PC físicos, PC desligado e câmera/instalação PWA. Backups agendados e teste de carga na infraestrutura gratuita não estão configurados. O funcionamento real depende das cotas e disponibilidade dos provedores.
