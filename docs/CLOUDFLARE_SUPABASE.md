# Versão online: Cloudflare + Supabase, sem cartão

## O que foi adaptado

A versão 1.3.0 tem um backend online separado, integrado à mesma interface:

- Cloudflare Worker entrega a PWA e encaminha a API por streaming.
- Supabase Edge Function executa autenticação, autorização, validação e operações da API.
- Supabase Auth valida as senhas. O aplicativo usa uma sessão própria de 12 horas, com token aleatório, hash no banco e cookie HttpOnly/Secure/SameSite. Tokens do Supabase e chaves administrativas não são enviados ao navegador.
- PostgreSQL guarda veículos, reparos, retornos, preferências e referências de fotos. Transações preservam o reparo original e impedem registros parciais.
- Storage guarda as fotos no bucket **privado** `repair-photos`. A consulta passa pela API autenticada; não há URL pública de fotos.
- Prazos, cores, arquivamento e datas de Brasília usam a mesma regra de `src/lib/domain.mjs`. Empresa responsável continua desativada; valores antigos podem ser migrados.
- Ferramentas exportam o SQLite sem alterá-lo, conferem SHA-256 das fotos, importam na nuvem e fazem backup/restauração dos dados de negócio. Não há exclusão automática de imagens.

**Código adaptado não significa aplicativo publicado.** Esta entrega ainda depende de contas gratuitas configuradas, esquema aplicado, segredos privados, deploy e validação nos provedores. Os dados reais do PC não foram transferidos automaticamente. O funcionamento continua disponível pelo iniciador local com Node/SQLite; a versão online usa PostgreSQL e Storage e funciona com o PC desligado depois de publicada.

## Limites dos planos gratuitos

Use Workers **Free** e uma organização Supabase **Free**. Não ative Workers Paid, R2, domínios pagos ou add-ons. Não informe cartão nem aceite um upgrade para continuar este procedimento. Se o provedor exigir isso no seu cadastro, interrompa essa etapa e confira as alternativas.

Em 26/10/2026, a referência consultada do Supabase Free inclui 500 MB de banco, 1 GB de arquivos, 5 GB de saída de dados e 500 mil invocações de Edge Function. Projetos podem ser pausados após uma semana sem atividade; exceder cotas pode restringir o serviço. O Worker Free tem cota diária de requisições. As fotos também consomem transferência, não apenas armazenamento. Não há garantia de disponibilidade contínua nem gratuidade ilimitada.

Fontes: [Supabase Free](https://supabase.com/pricing), [invocações](https://supabase.com/docs/guides/functions/pricing), [limites das funções](https://supabase.com/docs/guides/functions/limits), [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/). O backup privado e seu agendamento continuam necessários.

## 1. Preparar contas e ferramentas

1. Crie/acesse suas contas gratuitas no [Supabase](https://supabase.com/dashboard) e na [Cloudflare](https://dash.cloudflare.com/). A integração Supabase disponível nesta conversa pode ajudar a configurar o projeto depois de conectada. Não cole chaves no chat.
2. Crie um projeto Supabase **novo, dedicado a esta oficina**, em organização Free. Guarde a senha do banco privadamente e selecione uma região adequada, por exemplo São Paulo se disponível. Não compartilhe um projeto com outros aplicativos que tenham políticas de acesso próprias.
3. Para as ferramentas locais, instale Node.js 24 LTS e as dependências de desenvolvimento com `npm install` ou, usando o lockfile incluído, `pnpm install --frozen-lockfile`. A execução local por `Iniciar.bat` continua sem exigir essas dependências.
4. Na raiz do repositório execute `npm run build:cloud`. Isso gera `dist/cloud/` com a PWA pública e `supabase/functions/_shared/` com os módulos da API. Banco, fotos reais, backups e `.env` não entram nesses diretórios. Os arquivos gerados não precisam ser enviados ao GitHub.

## 2. Criar o banco e fechar o acesso direto

No SQL Editor do projeto Supabase, execute **todo** [001_workshop.sql](../supabase/migrations/001_workshop.sql). Ele cria tabelas `mj_*`, funções transacionais e o bucket privado. RLS fica habilitado e as tabelas/RPC não concedem acesso a `anon`, `authenticated` ou `public`. Somente o backend com `service_role` acessa esses registros.

Em Authentication, desabilite o cadastro público de novos usuários. A criação administrativa continuará funcionando. O aplicativo não usa cadastro de clientes nem login social. Não crie políticas públicas para o bucket e não o marque como público.

## 3. Publicar a interface e o proxy

O endereço gratuito será semelhante a `https://over-mechanics.SUA-CONTA.workers.dev`. Não é necessário comprar domínio.

Opção pelo painel da Cloudflare, útil quando ferramentas nativas são bloqueadas no Windows:

1. Em Workers, conecte o repositório `AlexManhes/over_mechanics` pelo fluxo de [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
2. Use a raiz do repositório, comando de build `npm run build:cloud` e comando de deploy `npx wrangler deploy`. O `wrangler.jsonc` declara o Worker e os assets. Selecione Node 24.22.1 no ambiente de build quando necessário.
3. Confirme o plano Free. Este procedimento não cria banco, volume ou R2 na Cloudflare.
4. O primeiro deploy pode mostrar “A versão online ainda precisa ser configurada” até os segredos e a Edge Function estarem prontos. Isso não indica publicação funcional concluída.

Alternativamente, em um computador onde o Wrangler possa executar: `npx wrangler login`, depois `npm run deploy:cloud`. O login pode abrir o navegador. `npm run check:cloud` somente compila/verifica, sem publicar.

Neste computador, o Controle de Aplicativo do Windows bloqueou o executável nativo do esbuild durante a tentativa de dry-run. Não foram alteradas as políticas do Windows. **A compilação foi confirmada em Linux pelo [GitHub Actions do commit c641acd](https://github.com/AlexManhes/over_mechanics/actions/runs/40331013612)**: instalação pelo lockfile, suíte sem falhas e `wrangler deploy --dry-run` concluídos. Esse resultado confirma o pacote, não um deploy real com os segredos do usuário.

## 4. Configurar os segredos e a Edge Function

Gere uma chave privada aleatória de 64 caracteres hexadecimais em seu terminal, guarde-a com segurança e não a publique:

```sh
node --input-type=module -e "import {randomBytes} from 'node:crypto';console.log(randomBytes(32).toString('hex'))"
```

Configure no Worker, em variáveis/segredos do ambiente de execução:

| Nome | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
| `CLOUD_PROXY_KEY` | A chave aleatória gerada |

No Supabase, em Edge Functions → Secrets, configure:

| Nome | Valor |
| --- | --- |
| `CLOUD_PROXY_KEY` | Exatamente a mesma chave privada do Worker |
| `PUBLIC_ORIGIN` | A URL HTTPS exata do Worker, sem barra final ou caminho |

Supabase fornece `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` automaticamente à função hospedada. Não tente cadastrar variáveis personalizadas com o prefixo reservado `SUPABASE_`. A chave `service_role` **não é necessária na Cloudflare** e nunca deve estar em `public/`.

Depois do build local, publique a função `workshop` com a [CLI oficial do Supabase](https://supabase.com/docs/guides/functions/deploy), a partir da raiz:

```sh
npx supabase login
npx supabase functions deploy workshop --project-ref SEU_PROJECT_REF --use-api
```

O modo API permite empacotar no servidor sem Docker local. A configuração em `supabase/config.toml` usa `verify_jwt=false` porque o endpoint verifica **a chave privada do proxy antes de qualquer operação**, além da sessão do mecânico. Não remova essa verificação. Uma chamada direta à função sem a chave deve responder 403.

## 5. Criar o administrador

Copie `.env.cloud.example` para `.env.cloud`, ignorado pelo Git. Ajuste a URL e, privadamente, a chave JWT `service_role` da aba de chaves legadas do projeto Supabase. Essa chave é administrativa e é usada apenas pelas ferramentas locais. Não use a chave `anon` neste campo. A API atual está preparada para essa chave legada, ainda suportada; trocar para chaves `sb_secret_*` exige adaptar o cliente de autenticação.

Execute:

```sh
node --env-file=.env.cloud scripts/cloud-admin.mjs
```

Informe nome, e-mail e senha no terminal; a senha é ocultada durante a digitação. A ferramenta cria o primeiro administrador. Se a conta Auth já existir, ela exige a senha atual, sem substituí-la. Um segundo administrador inicial não é criado por esse comando. Não há formulário público de configuração da oficina na nuvem.

Depois, o administrador adiciona mecânicos nas configurações do aplicativo. Se uma falha de rede criar uma conta Auth sem concluir seu vínculo à oficina, ela ficará **sem acesso**; use `cloud-admin.mjs --mechanic` para completar esse vínculo privadamente, com a senha dessa conta. Isso não concede acesso aos autores históricos importados.

As sessões próprias duram 12 horas e não usam refresh tokens no navegador. Para retirar acesso imediatamente, desative a conta na tabela `mj_accounts` (`active=false`) e remova suas linhas em `mj_sessions`. Trocar a senha pela interface já revoga as outras sessões. Uma alteração feita apenas no painel Auth não substitui a revogação das sessões do aplicativo.

## 6. Migrar os registros e fotos do PC

Pare `Iniciar.bat` e evite novos cadastros durante a mudança. Crie primeiro um backup privado completo da pasta `data/` atual. A exportação a seguir lê o SQLite sem modificá-lo e copia as fotos; aceita também o formato legado de imagens dentro do banco.

Na raiz do projeto, crie a pasta `backups` e escolha um destino novo:

```sh
node scripts/cloud-backup.mjs export-local "C:/Users/alexs/Desktop/over_mechanics/data" "backups/migracao-inicial"
node scripts/cloud-backup.mjs validate "backups/migracao-inicial"
node --env-file=.env.cloud scripts/cloud-backup.mjs upload "backups/migracao-inicial"
```

O primeiro comando cria a pasta final, que deve ainda não existir. Ajuste a origem se `DATA_DIR` era diferente. Não compartilhe esse backup pelo GitHub.

A importação sobe as imagens sem sobrescrever objetos existentes, verifica seus hashes e aplica os registros em uma transação. Pode ser retomada com o mesmo backup, mas recusa registros de mesmo ID cujo conteúdo seja diferente. Ela importa os dados originais, inclusive o vínculo do retorno e valores legados de empresa; a empresa permanece fora das telas/API. Não tente mesclar bases independentes com placas duplicadas.

**As senhas e sessões antigas não são migradas.** Os autores anteriores ficam como identidades históricas inativas. Cadastre as novas contas de acesso; o nome do mecânico e o autor original de cada atendimento continuam preservados no histórico/banco.

Depois de validar a importação, use o endereço HTTPS online no celular **e no computador**. Cadastrar novos serviços na instalação local cria outra base; não há sincronização automática entre SQLite e Supabase.

## 7. Backup e restauração da nuvem

```sh
node --env-file=.env.cloud scripts/cloud-backup.mjs backup "backups/nuvem-2026-10-26"
node scripts/cloud-backup.mjs validate "backups/nuvem-2026-10-26"
```

Cada backup precisa de um destino novo. O pacote contém o manifesto do banco e as fotos referenciadas, com hashes. Não contém senhas, sessões, chaves, usuários Auth nem configurações dos provedores. Guarde separadamente `.env.cloud`, segredos e informações das contas em um local protegido. Copie os backups para um destino privado fora do servidor/computador de uso.

Para restaurar, prefira um projeto Supabase novo, aplique o SQL, configure o backend e use `upload` com o backup escolhido. Recrie as contas de acesso e valide os registros/fotos antes de mudar o endereço usado pelos mecânicos. Se restaurar no mesmo projeto, ative temporariamente `MAINTENANCE=true` nos segredos da Edge Function para impedir novos cadastros, e remova esse valor ao terminar. Registros divergentes não serão sobrescritos.

Backups são manuais nesta versão: nenhum agendamento foi instalado. O plano Free não substitui uma estratégia de backup. Interrupções entre upload de fotos e commit podem deixar objetos sem referência; eles são mantidos para revisão manual, pois um timeout pode ocorrer após o banco confirmar o registro. Não há limpeza automática e os backups da aplicação incluem as fotos referenciadas, não esses objetos soltos.

## 8. Validar o serviço publicado

1. Confira `/healthz` respondendo `{"status":"ok"}` no endereço HTTPS.
2. Sem login, confirme que `/api/data` e uma URL de foto respondem 401, e a função chamada diretamente sem chave responde 403.
3. Entre no celular usando dados móveis e no computador. Cadastre um atendimento com fotos Antes/Depois em um aparelho e confira o mesmo histórico e as mesmas imagens no outro.
4. Verifique prazos de 30/60 dias, limite de alerta, arquivados e registro de retorno. Os testes locais cobrem as viradas de data em Brasília sem precisar esperar os dias passarem.
5. Desligue o PC e repita a consulta no celular. Instale a PWA no navegador compatível.
6. Faça um backup e teste a restauração em um projeto separado antes de depender dele.

Essas verificações nos provedores, câmera/instalação físicas e acesso externo ainda precisam ser executadas depois da configuração. Consulte [o registro de testes](VALIDACAO.md) para distinguir SQL/testes locais de serviços reais.
