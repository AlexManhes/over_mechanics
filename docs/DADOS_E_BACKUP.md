# Banco, fotos, configuração e backup

## Por que esses arquivos não estão no GitHub?

O repositório é público e guarda o código necessário para executar a aplicação. Os arquivos criados durante o uso são dados da oficina:

| Arquivo/pasta | Conteúdo | Onde guardar |
| --- | --- | --- |
| `data/mecanica.sqlite` | Veículos, atendimentos, retornos, contas, preferências e referências das fotos | Servidor e backup privado |
| `data/photos/` | Fotos Antes/Depois/Retorno | Servidor e backup privado |
| `.env` | Configuração local; pode incluir chave de ativação e outros segredos | Servidor, com acesso restrito |
| `.env.example` | Modelo sem senhas reais | GitHub |

Ignorar esses caminhos no Git **não remove os arquivos do computador**. Eles continuam sendo usados pelo aplicativo. As imagens em `docs/images/` são capturas de validação com dados fictícios, não fotos reais dos reparos.

O banco real não é necessário para instalar o programa: o backend cria as tabelas automaticamente na primeira execução. Para recuperar atendimentos existentes em outro computador, é preciso restaurar o backup ou acessar o servidor onde estão os dados. Clonar o repositório sozinho não transfere o histórico.

## O que o GitHub não substitui

Commit e push guardam o código. Não fazem backup do banco, não guardam as fotos ignoradas e não executam o servidor. Não há backup automático configurado pelo projeto. O aplicativo não apaga dados ou fotos ao vencer o prazo: apenas classifica os atendimentos como arquivados.

## Backup completo no Windows

1. Pare o servidor com **Ctrl+C** e confirme que nenhuma instância usa a mesma pasta de dados.
2. Copie a pasta **`data` inteira**, incluindo `mecanica.sqlite`, `photos/` e eventuais `mecanica.sqlite-wal` e `mecanica.sqlite-shm`. Se você definiu `DATA_DIR`, use essa pasta.
3. Guarde a cópia em local privado e separado do computador servidor, por exemplo outro disco ou armazenamento de backup da empresa.
4. Reinicie o aplicativo.

Exemplo no PowerShell aberto na pasta do projeto:

```powershell
$origemDados = Join-Path (Get-Location) 'data'
$pastaBackup = Join-Path $env:USERPROFILE ('Documents\Backups-OverMechanics\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path (Split-Path $pastaBackup) -Force | Out-Null
Copy-Item -LiteralPath $origemDados -Destination $pastaBackup -Recurse
```

Copiar apenas o arquivo SQLite deixa as fotos de fora. Copiar com o servidor em uso pode produzir um backup inconsistente entre banco e arquivos. Para guardar `.env`, use um local privado separado, nunca o repositório público.

## Restauração

1. Pare o servidor e preserve um backup do estado atual.
2. Copie o backup escolhido para uma nova pasta de dados vazia, por exemplo `C:/OverMechanics/dados-restaurados`.
3. No `.env`, defina `DATA_DIR=C:/OverMechanics/dados-restaurados`.
4. Execute o programa, consulte os atendimentos e abra algumas fotos Antes/Depois/Retorno antes de retomar o uso.

O teste de integração cobre cópia completa para outra pasta e recuperação dos registros e dos bytes das fotos. O agendamento de backups e a proteção do destino ainda precisam ser configurados no seu ambiente.
