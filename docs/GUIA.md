# Mecânica Já — versão 1.2.0

PWA para uma oficina empresarial, com acesso exclusivo aos mecânicos. **Node.js + SQLite nativo + HTML/CSS/JavaScript**, sem framework e sem dependências de produção. Um servidor guarda os dados e as fotos; celular e computador consultam esse mesmo servidor.

## Executar no Windows

1. Instale **Node.js 24 LTS** (compatível a partir de 22.13). Não há pacotes adicionais para instalar.
2. Abra **Iniciar.bat**, mantenha a janela aberta e acesse **http://127.0.0.1:3000**. Alternativamente, no terminal desta pasta:

```powershell
node --env-file-if-exists=.env server.mjs
```

`npm start` também funciona se npm estiver instalado. O iniciador tenta o Node do sistema e depois o runtime disponível neste computador pelo Codex.

3. Por enquanto, o aplicativo **abre direto no painel**, sem cadastro, e-mail, senha ou chave de ativação. Preencha o nome do mecânico responsável em cada atendimento. As preferências não exibem contas/senhas neste modo.

A entrega começa sem contas/banco/dados de teste. A primeira execução cria `data/mecanica.sqlite` e `data/photos/`. Não abra o HTML diretamente nem use hospedagem apenas estática: o aplicativo precisa do processo Node.

## Uso local sem cadastro (configuração atual)

Sem configuração adicional, o servidor em 127.0.0.1 abre diretamente no painel. Registros, fotos, histórico, prazos e retornos continuam persistentes. Uma identidade interna apenas mantém os vínculos do banco; não representa o nome de uma pessoa, que deve ser preenchido no atendimento.

Para voltar a usar contas, defina AUTH_REQUIRED=true no arquivo .env e reinicie o servidor. O primeiro administrador poderá ser cadastrado sem apagar os registros locais. Contas já existentes continuam preservadas. Com AUTH_REQUIRED=false, o servidor exige endereço de loopback e não pode ter PUBLIC_ORIGIN. O modo local recusa requisições encaminhadas por proxy. Se usar endereço de rede ou HTTPS sem definir esse parâmetro, o servidor exige login automaticamente.

## Implementado

- Autenticação opcional (ativada por `AUTH_REQUIRED=true`) com senha, scrypt/salt, sessão de 12 horas e cookie HttpOnly/SameSite; contas criadas pelo administrador; troca da própria senha.
- Veículo cadastrado pelo atendimento, placa antiga ou Mercosul normalizada, modelo opcional, busca parcial e vários atendimentos no histórico do mesmo veículo.
- Defeito, diagnóstico, serviço, peças, mecânico, conclusão, observações e fotos separadas em Antes/Depois.
- Prazos de 30, 60 ou 1–3650 dias personalizados; alerta configurável inicialmente em 7 dias.
- Retorno com data, descrição, providências e fotos, vinculado ao original, inclusive quando arquivado. Classificação dentro/depois do prazo; o último dia ainda está dentro.
- Arquivamento automático e seção **Arquivados**, com busca por placa, datas, situação do prazo, histórico e retorno. Não há exclusão por tempo decorrido.
- PWA instalável em navegadores compatíveis. Cache somente da estrutura pública; registros e fotos precisam de conexão. Não existem bases locais separadas nos aparelhos nem edição offline.

## Prazos e arquivamento

| Dias restantes | Indicador padrão |
| --- | --- |
| Mais de 7 | Verde, com texto |
| 1 a 7 | Laranja, com texto |
| 0 | Vermelho, “Vence hoje”, borda branca pulsando suavemente |
| Negativo | Vermelho, “Prazo encerrado há X dias”, sem pulsação |

O limite é configurável entre 1 e 365 dias para toda a oficina. A preferência de movimento reduzido troca a pulsação por borda estática.

Concluir um serviço inicia/mantém o acompanhamento. O atendimento fica ativo até o último dia, inclusive; **no dia seguinte é arquivado**, sai dos ativos e permanece em Arquivados e no histórico completo. O arquivamento é uma classificação calculada pela data, sem apagar ou alterar o reparo. Não exige cron nem servidor ligado na virada: ao voltar, a classificação reflete o dia atual. Não há exclusão após dois meses.

**Encerrar o prazo não registra defeito ou retorno.** O mecânico registra o reaparecimento quando ele acontecer, sem reabrir ou substituir o original.

As datas usam **America/Sao_Paulo**, strings de calendário e soma de dias inteiros. O navegador toma o relógio do servidor como referência, evitando divergências pelo relógio do celular. Mantenha o relógio do servidor correto. Atualiza ao consultar, voltar à janela e a cada 60 segundos nas telas de consulta; formulários em edição são preservados.

Exemplo: conclusão em 24/10/2026 → 30 dias = 23/11/2026; 60 dias = 23/12/2026. No primeiro exemplo, arquiva em 24/11/2026.

## Fotos persistentes

O navegador redimensiona para até **2048 px** no maior lado, sem ampliar imagens pequenas, e converte para JPEG com qualidade inicial de **86%**. Se necessário, reduz para 80%/74% para caber em 2 MB. Se ainda ultrapassar, pede outro arquivo ou recorte. Limites: 20 MB por original, 12 fotos por registro, 2 MB por foto enviada, 34 MB por requisição base64. A otimização busca manter detalhes para consulta; não equivale a guardar a resolução original.

Fotos ficam em **`DATA_DIR/photos/`**, e o SQLite guarda suas referências (`file_path`), MIME, etapa e vínculos. `/api/photos/:id` entrega o arquivo: exige sessão quando o login está ativo e permite acesso direto apenas no próprio computador no modo local. Antes/Depois/Retorno permanecem separados. Câmera usa `capture=environment`; sua abertura depende do aparelho. HEIC depende da decodificação do navegador; prefira JPEG/PNG/WebP.

**Não há exclusão automática de fotos.** Uma futura limpeza deverá ter prazo configurável e confirmação antes de apagar. Gravações usam arquivo temporário e renomeação antes da confirmação da referência no banco.

## Celular e computador na mesma base — configuração externa

Use **uma instância do servidor Node com disco persistente**, pelo mesmo endereço em todos os aparelhos. O disco deve conter banco e fotos. Serviços que apagam arquivos ao reiniciar precisam de volume persistente em `DATA_DIR`. Não coloque SQLite em compartilhamento de rede sincronizado.

Se o servidor rodar no **PC**, ele precisa estar **ligado, sem suspensão, com o processo Node aberto e acessível pela rede**. Fechar o processo ou desligar o PC interrompe o acesso de todos. Para disponibilidade contínua, use servidor/hospedagem permanente. Essa infraestrutura não foi configurada nesta entrega.

### Teste pela rede local da oficina

Para usar pela rede, ative `AUTH_REQUIRED=true` e cadastre a administração no próprio PC antes de liberar o acesso. Copie `.env.example` para `.env`:

```dotenv
AUTH_REQUIRED=true
HOST=0.0.0.0
PORT=3000
COOKIE_SECURE=false
```

1. Execute `ipconfig` no PC e identifique seu IPv4 da rede da oficina.
2. Configure o firewall para permitir TCP 3000 somente na rede privada da oficina. Isso não foi alterado automaticamente.
3. No celular conectado à mesma rede, abra `http://IP-DO-PC:3000`, usando o IPv4 encontrado. O computador pode usar o mesmo endereço.

**127.0.0.1/localhost no celular aponta para o celular**, não para o PC. HTTP pela rede permite testar os mesmos dados, mas não oferece a mesma instalação PWA/câmera de HTTPS. Não exponha diretamente essa porta HTTP na internet.

### Produção com HTTPS

Configure domínio/DNS, certificado válido e proxy reverso. **config/Caddyfile.example** é um modelo para Caddy instalado no mesmo servidor do Node, com domínio apontando para ele e portas 80/443 disponíveis. Mantenha a porta interna do Node privada.

```dotenv
AUTH_REQUIRED=true
HOST=127.0.0.1
PORT=3000
PUBLIC_ORIGIN=https://oficina.suaempresa.com.br
COOKIE_SECURE=true
DATA_DIR=/caminho/privado/persistente/mecanica-ja
SETUP_KEY=SUBSTITUA_POR_UMA_CHAVE_ALEATORIA_ANTES_DE_PUBLICAR
```

São exemplos, não credenciais prontas. Ajuste o caminho para Windows/Linux. `PUBLIC_ORIGIN` deve corresponder exatamente ao endereço do navegador, sem barra final. Uma chave pode ser gerada com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guarde-a em `.env`, sem enviar ao Git.

Configure **SETUP_KEY antes de expor uma oficina sem administrador**, inclusive por proxy que apareça como conexão local. Informe essa chave no primeiro cadastro. Após criar a administração, a ativação fica desabilitada. Reinicie o processo ao mudar `.env`. Configure um serviço/gerenciador de processos para iniciar o Node e backups periódicos conforme seu ambiente.

Os dois dispositivos usam o mesmo domínio HTTPS e contas autorizadas. Consultam os mesmos registros e fotos; alterações aparecem ao abrir as telas, voltar ao aplicativo e na atualização de até 60 segundos. Hospedagem, domínio, HTTPS, firewall e disponibilidade permanente ainda dependem de configuração externa.

### Instalar PWA

Android compatível: Configurações → Instalar aplicativo ou menu do navegador. iPhone: Safari → Compartilhar → Adicionar à Tela de Início. Requer HTTPS, salvo o contexto de desenvolvimento em localhost no próprio aparelho. Alertas são internos; notificações externas não estão implementadas.

## Atualizar a primeira versão preservando os dados

1. Pare o servidor antigo e faça backup completo dos dados.
2. Preserve `.env` e a pasta de dados antiga. Se já usava `DATA_DIR`, mantenha o caminho; caso contrário, copie a pasta `data` inteira para esta instalação. Não substitua seus dados por bancos de teste.
3. Inicie a versão nova. Fotos BLOB da versão anterior são migradas para `photos/`, preservando IDs e vínculos; o banco passa a guardar referências. Todas são gravadas/verificadas antes de confirmar a troca da tabela. Em falha, a tabela legada é mantida; resolva o problema e tente novamente.
4. Confira histórico e imagens. Preserve o backup anterior para retorno ao código antigo, se necessário. O código antigo não deve operar sobre a base já migrada.

Esta entrega de código não transfere automaticamente contas ou bancos de outras pastas. A instalação anterior permanece no local anterior.

## Backup e restauração: banco e fotos

Faça o backup com o servidor **parado**, garantindo consistência entre banco e arquivos. Copiar somente `mecanica.sqlite` não basta. Inclua `photos/` e eventuais `mecanica.sqlite-wal`/`mecanica.sqlite-shm`, que podem conter dados após uma interrupção.

### Backup no Windows

Use Ctrl+C na janela do servidor e confirme que nenhuma outra instância está usando a mesma pasta. No PowerShell desta pasta:

```powershell
$origemDados = Join-Path (Get-Location) 'data'
$pastaBackup = Join-Path $env:USERPROFILE ('Documents\Backups-MecanicaJa\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path (Split-Path $pastaBackup) -Force | Out-Null
Copy-Item -LiteralPath $origemDados -Destination $pastaBackup -Recurse
```

Se usa `DATA_DIR`, substitua `$origemDados` por esse caminho. Guarde a pasta completa em local protegido, preferencialmente separado do servidor, pois inclui registros, fotos e hashes de senha. Guarde também código e configuração privadamente. Depois reinicie o servidor. Agendamento de backups depende do ambiente e não foi instalado automaticamente.

### Restaurar sem sobrescrever o estado atual

1. Pare o servidor e faça backup do estado atual.
2. Copie o conteúdo do backup escolhido para uma **nova pasta de dados vazia**, por exemplo `C:/MecanicaJa/dados-restaurados`. Ela deve conter banco, `photos/` e os arquivos auxiliares existentes.
3. Defina `DATA_DIR=C:/MecanicaJa/dados-restaurados` no `.env` e inicie o Node.
4. Entre com uma conta existente e confira veículos, histórico, retornos e fotos Antes/Depois antes de retomar o uso.

Os testes executam esse ciclo em pasta separada e recuperam novamente registros e bytes das imagens.

## Testes e organização do código

Execute `node --test tests/*.test.mjs`. **31 testes aprovados**, incluindo cadastro, histórico, acesso, 30/60 dias, Brasília, arquivamento, retorno em arquivado, fotos no disco, migração, duas sessões na mesma base e backup/restauração. Veja **[VALIDACAO.md](VALIDACAO.md)** para os limites da conferência e capturas de tela em `docs/images/`.

| Ajuste | Arquivo/funções |
| --- | --- |
| Datas, prazo, arquivamento e filtro | `src/lib/domain.mjs`: `todayBrasilia`, `deadline`, `repairState`, `selectRepairs` |
| Autenticação, permissões e endpoints | `src/server.mjs`: `api`, `currentUser`, `login` |
| SQLite e cadastro de veículos/atendimentos | `src/server.mjs`: tabelas e rotas parametrizadas |
| Arquivos das fotos e migração legada | `src/lib/photos.mjs` |
| Compressão antes do envio | `public/photos.js`: `optimize` |
| Painel, ativos e Arquivados | `public/app.js`: `dashboard`, `filtered`, `list` |
| Formulários, histórico e retornos | `public/app.js`: `repairForm`, `history`, `detail`, `returnForm` |
| Relógio de referência e atualização | `public/app.js`: `refresh`, `currentDay`, intervalo/eventos |
| Cores, borda pulsante e celular | `public/styles.css`: `.badge`, `.repair-deadline`, `deadline-pulse` |
| Instalação e cache PWA | `public/manifest.webmanifest`, `public/sw.js` |
| Configuração e HTTPS | `.env.example`, `config/Caddyfile.example` |

Endpoints: `/api/session`, `/api/setup`, `/api/login`, `/api/logout`, `/api/users`, `/api/password`, `/api/settings`, `/api/data`, `GET /api/repairs?scope=active|archived|all&plate=...`, `POST /api/repairs`, `POST /api/repairs/:id/returns`, `GET /api/photos/:id`. Veículos são cadastrados/atualizados junto ao atendimento; `/api/data` fornece veículos, reparos, retornos e metadados das fotos. Toda a oficina é compartilhada entre mecânicos autorizados quando o login está ativo.

Fora desta versão: notificações externas, recuperação de senha por e-mail, exclusão/edição de atendimentos, limpeza de fotos, paginação para grandes frotas e edição offline. Nenhuma dessas funções é apresentada como pronta. Ao alterar os arquivos da PWA, aumente a versão do cache em `sw.js`.


## Empresa responsável — temporariamente desativada

O campo foi comentado e desativado no formulário, na lista, no histórico, nos detalhes, no preenchimento automático e na gravação pela API. Os comentários no código indicam os trechos correspondentes. A coluna legada company continua no SQLite para preservar valores já salvos, sem aparecer na API ou na interface. Novos veículos recebem valor vazio e novos atendimentos não alteram a informação antiga.

## CSS, manifesto e instalação PWA

CSS e manifesto usam URLs versionadas e são armazenados junto ao shell completo. Depois do primeiro carregamento bem-sucedido, continuam disponíveis no cache mesmo com o servidor desligado. Quando o cache ainda não existe e o servidor está ausente, a aplicação não consegue buscar os arquivos: abra Iniciar.bat e mantenha a janela aberta.

O cache não contém os registros nem as fotos. Sem servidor, a tela explica como retomá-lo; não apresenta dados desatualizados como disponíveis. Se o cache estiver vazio/corrompido, o service worker devolve resposta explícita em vez de undefined.

O aplicativo não cancela beforeinstallprompt nem adia o banner de instalação. A instalação é oferecida normalmente pelo navegador compatível. O botão de instalação, quando disponível nas preferências, orienta o uso do menu do navegador. Isso elimina o aviso informativo de banner impedido por preventDefault.

Depois de atualizar o código: feche a janela antiga do servidor, abra Iniciar.bat novamente e atualize a página com Ctrl+F5 para carregar a nova versão. Não é necessário limpar o banco ou excluir fotos.


A organização atual está descrita em [ARQUITETURA.md](ARQUITETURA.md). O motivo para não versionar banco, fotos e .env e o procedimento de backup estão em [DADOS_E_BACKUP.md](DADOS_E_BACKUP.md). O arquivo server.mjs da raiz é somente a entrada compatível; o backend fica em src/server.mjs.
