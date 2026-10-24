# Validação — Mecânica Já 1.2

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
