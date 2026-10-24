# Over Mechanics · Mecânica Já

Aplicativo para registrar reparos, consultar o histórico por placa, guardar fotos de Antes/Depois e acompanhar possíveis retornos dentro do prazo definido pelo mecânico.

**Node.js + SQLite + HTML/CSS/JavaScript.** Sem dependências de produção para instalar. No modo local atual, abre diretamente no painel, sem cadastro ou senha.

## Executar

1. Instale **Node.js 24 LTS** (mínimo compatível: 22.13).
2. No Windows, abra **Iniciar.bat** e mantenha a janela aberta.
3. Acesse **http://127.0.0.1:3000**.

Ou, no terminal da pasta:

```sh
node --env-file-if-exists=.env server.mjs
```

`npm start` também está disponível. Para personalizar, copie `.env.example` para `.env` e siga o [guia completo](docs/GUIA.md). Para acesso entre celular e computador, ambos devem consultar o mesmo servidor; a configuração de rede/HTTPS está no guia.

## Organização

```text
over_mechanics/
├── src/                      # Backend e regras compartilhadas
│   ├── server.mjs            # API, autenticação, SQLite e arquivos estáticos
│   └── lib/                  # Prazos, acesso local e armazenamento de fotos
├── public/                   # Telas, estilos, fotos no envio e PWA
├── tests/                    # Regras, API, persistência, backup e iniciador
├── config/                   # Exemplos de infraestrutura
├── docs/                     # Guias, validação e imagens das telas
├── data/                     # Criada em execução; ignorada pelo Git
├── .env.example              # Modelo de configuração sem credenciais
├── Iniciar.bat               # Iniciador para Windows
├── server.mjs                # Entrada compatível para iniciar o backend
└── package.json              # Comandos e versão necessária do Node
```

Veja o [mapa do código](docs/ARQUITETURA.md) para localizar cada funcionalidade.

## Banco, fotos e configuração

**Este repositório guarda o código; não é um backup dos atendimentos.**

- `data/mecanica.sqlite`: veículos, reparos, retornos, contas e referências das fotos.
- `data/photos/`: imagens dos reparos, guardadas no servidor.
- `.env`: configuração particular, que pode conter chaves e senhas.

Esses arquivos ficam fora do Git para preservar os dados da oficina. Isso **não os apaga do computador**. O modelo `.env.example` e a criação das tabelas estão no código, então uma instalação nova funciona sem receber um banco real. Para recuperar o histórico, restaure um backup completo.

Leia [como guardar e restaurar banco e fotos](docs/DADOS_E_BACKUP.md). Não envie dados reais para este repositório público.

## Recursos

- Busca por placa e vários atendimentos por veículo.
- Fotos Antes/Depois/Retorno, redimensionadas antes do envio e persistidas no servidor.
- Prazos de 30, 60 ou dias personalizados; alerta configurável e datas em `America/Sao_Paulo`.
- Verde, laranja, “Vence hoje” com borda pulsante e prazo encerrado sem pulsação.
- Arquivamento automático após o prazo, sem exclusão do histórico ou das fotos.
- Retornos vinculados ao reparo original, inclusive em arquivados.
- Login opcional, ativado para acesso pela rede; PWA em navegadores compatíveis.

O campo “empresa responsável” está comentado e desativado. Valores antigos permanecem preservados no banco.

## Testar

```sh
node --test tests/*.test.mjs
```

Consulte o [registro de validação](docs/VALIDACAO.md) para a cobertura e os limites dos testes. Câmera física, instalação em celulares e acesso entre aparelhos dependem do ambiente e de configuração externa.

## Documentação

- [Executar, configurar e hospedar](docs/GUIA.md)
- [Banco, fotos, privacidade e backup](docs/DADOS_E_BACKUP.md)
- [Mapa do código e manutenção](docs/ARQUITETURA.md)
- [Validação e testes](docs/VALIDACAO.md)
- [Exemplo de proxy HTTPS](config/Caddyfile.example)

GitHub Pages não executa este backend Node.js/SQLite. Hospedar o código no GitHub não coloca o aplicativo completo em funcionamento na internet. Se o servidor for seu PC, ele precisa permanecer ligado e acessível.
