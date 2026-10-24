# Mapa do código

## Backend — `src/`

- `src/server.mjs`: servidor HTTP, rotas da API, sessões, usuários, SQL parametrizado, salvamento de reparos/retornos e entrega autenticada das fotos.
- `src/lib/domain.mjs`: datas de Brasília, cálculo de prazo, cores por situação, classificação em ativos/arquivados, placa e retorno dentro/depois do prazo. O navegador recebe esse mesmo módulo em `/domain.mjs`.
- `src/lib/access.mjs`: configuração do acesso direto local e limites de acesso por rede.
- `src/lib/photos.mjs`: gravação privada das fotos em arquivos e migração das imagens legadas do SQLite.

O `server.mjs` da raiz apenas importa o backend. Essa entrada mantém compatibilidade com `Iniciar.bat`, `npm start` e comandos anteriores. O caminho padrão de dados continua sendo `data/` na raiz, portanto a reorganização não muda a localização de atendimentos e fotos.

## Interface — `public/`

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Documento inicial e carregamento dos recursos |
| `app.js` | Painel, listas, arquivados, formulários, histórico, detalhes e retornos |
| `styles.css` | Aparência, celular/computador, cores e pulsação |
| `photos.js` | Compressão e redimensionamento antes do envio |
| `manifest.webmanifest` | Nome, ícones e instalação PWA |
| `sw.js` | Cache da estrutura pública; registros e fotos exigem servidor |
| `icon*` | Ícones da aplicação |

Em `app.js`, comece por `dashboard`, `list`, `repairForm`, `history`, `detail`, `returnForm` e `settings`. As referências a “empresa responsável” estão comentadas; a coluna legada é preservada no banco.

## Execução e infraestrutura

- `Iniciar.bat`: iniciador Windows com texto ASCII e quebras CRLF.
- `package.json`: versão mínima do Node e comandos `start`/`test`. Não há dependências de produção externas.
- `.env.example`: modelo de configuração. Copie para `.env` somente quando precisar ajustar os padrões.
- `config/Caddyfile.example`: referência para proxy HTTPS, que exige configuração no servidor.
- `.gitignore`: impede versionar dados, bancos, fotos da pasta de dados e configurações privadas.

## Testes — `tests/`

`domain.test.mjs` verifica as regras de calendário e arquivamento; `api.test.mjs` cobre HTTP, persistência, fotos e backup/restauração; `local.test.mjs` cobre uso direto e reativação do login; `photos.test.mjs` cobre migração; `service-worker.test.mjs` cobre cache e falhas de conexão; `launcher.test.mjs` verifica a inicialização Windows.

Execute todos com `node --test tests/*.test.mjs` a partir da raiz. Cada teste usa dados temporários separados dos registros da oficina.

## Fluxo dos dados

1. O navegador envia um atendimento ou retorno à API.
2. O backend valida e grava os registros no SQLite, e as fotos em `DATA_DIR/photos/`.
3. A API fornece os dados às telas; todos os aparelhos que acessam o mesmo servidor consultam a mesma base.
4. O fim do prazo muda a classificação para arquivado, sem apagar registros, fotos ou vínculos.

Para alterar o cache da PWA, aumente sua versão em `public/sw.js` e confira as URLs versionadas no HTML. As instruções completas de operação estão no [guia](GUIA.md).
