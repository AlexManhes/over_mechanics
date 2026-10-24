# Acesso pelo celular, dentro e fora da oficina

## Situação desta entrega

O código foi preparado para um servidor Node.js com SQLite e **disco persistente**, usando Render como configuração de referência. Isso ainda não significa que o serviço já foi contratado ou publicado. A publicação depende de conectar uma conta de hospedagem, escolher o plano e confirmar a criação do serviço.

Com o serviço publicado, celular e computador usarão **o mesmo endereço HTTPS**, o mesmo banco e as mesmas fotos, inclusive fora do Wi-Fi da oficina. O PC poderá ficar desligado porque o servidor passa a ser a hospedagem. Não basta abrir o repositório do GitHub ou ativar GitHub Pages.

## Custo da configuração de referência

O arquivo `render.yaml` define uma instância de 512 MB (`0.5c-512mb`) e disco persistente de 1 GB. Em 24/10/2026, os preços oficiais consultados foram US$ 7/mês de servidor e US$ 0,25/GB/mês de disco: aproximadamente **US$ 7,25/mês**, antes de impostos e eventuais excedentes. Confirme o preço no painel antes de contratar. O plano gratuito não permite esse disco persistente.

Fontes: [preços do Render](https://render.com/pricing), [discos persistentes](https://render.com/docs/disks) e [configuração de Blueprints](https://render.com/docs/blueprint-spec).

## Publicar a configuração preparada

1. Conecte sua conta do Render e o repositório `AlexManhes/over_mechanics`.
2. Crie um **Blueprint** usando o `render.yaml` da branch `main`. Revise o serviço e o custo antes de confirmar.
3. Confira que haverá **uma instância** e um disco montado em **`/var/data`**. Esse diretório conterá tanto `mecanica.sqlite` quanto `photos/`. Não use um serviço sem volume para guardar os reparos reais.
4. A configuração seleciona Node.js 24.22.1, inicia `node server.mjs` e verifica `/healthz`. A URL HTTPS padrão é fornecida pelo Render e detectada pelo aplicativo por `RENDER_EXTERNAL_URL`. Não é necessário comprar domínio para usar essa URL.
5. O Render gera uma `SETUP_KEY` aleatória para o primeiro acesso. Consulte-a privadamente nas variáveis do serviço; não publique a chave no GitHub nem no chat.
6. Abra a URL HTTPS, preencha seu nome, e-mail, senha e a chave de ativação. Essa será a conta administradora. Em seguida, cadastre os demais mecânicos nas configurações.
7. Abra **esse mesmo endereço** no celular e no computador. Cadastre um atendimento e confirme que ambos conseguem consultá-lo e abrir suas fotos.

Login é obrigatório na versão online. O modo direto sem senha continua disponível somente em loopback no próprio PC. Em produção, o servidor recusa iniciar sem autenticação, cookie seguro, endereço HTTPS e pasta de dados explicitamente configurados. Se ainda não existe administrador, também exige uma chave inicial de pelo menos 24 caracteres.

## Instalar na tela inicial

- Android compatível: abra a URL no Chrome e use o menu **Instalar aplicativo** ou **Adicionar à tela inicial**.
- iPhone: abra no Safari, toque em **Compartilhar → Adicionar à Tela de Início**.

A disponibilidade depende do navegador e do sistema. A instalação não transforma o celular no servidor: consultar/salvar registros e fotos continua exigindo internet. Os avisos de prazo são internos ao aplicativo; notificações externas não foram implementadas.

## Atualizações e persistência

As atualizações automáticas por commit foram deixadas **desativadas** no Blueprint. Depois de testar e enviar código novo, use o deploy manual no painel da hospedagem. O disco precisa continuar associado ao mesmo serviço. Reinicializações/atualizações preservam apenas o conteúdo do volume, não qualquer pasta do projeto.

Mantenha uma única instância com esse SQLite. Não crie outra instalação para cada aparelho. A URL deve ser a fonte de dados compartilhada por toda a oficina. O disco de 1 GB é inicial; acompanhe o uso e aumente a capacidade conforme a quantidade de fotos. Não há exclusão automática de fotos.

## Levar dados já existentes no PC

O primeiro deploy a partir do GitHub começa vazio. Ele não envia automaticamente o banco e as fotos do computador.

Para migrar, pare o aplicativo local e faça um backup completo de sua pasta `data/`. O administrador do servidor deverá restaurar esse conteúdo no volume privado `/var/data`, com o serviço parado ou em manutenção, preservando banco, fotos e eventuais arquivos SQLite auxiliares. Não faça a transferência pelo repositório público. Se o banco possui apenas a identidade do modo local, o cadastro do administrador online continua disponível depois da restauração.

Depois da migração, valide os registros e algumas fotos e passe a usar a URL online em todos os aparelhos. Continuar cadastrando no endereço local do PC criaria outra base independente, sem sincronização com a hospedagem.

Essa migração privada ainda precisa ser executada no serviço escolhido; não foi apresentada como concluída.

## Backup e domínio próprio

O volume persistente não substitui backups privados. Siga o [guia de backup](DADOS_E_BACKUP.md), adaptando a cópia ao acesso privado ao servidor. Planeje um destino separado e teste a restauração. O agendamento não é instalado automaticamente por este Blueprint.

Para usar um domínio próprio, configure DNS/certificado no provedor e defina `PUBLIC_ORIGIN` com o endereço HTTPS canônico, por exemplo `https://oficina.exemplo.com.br`. Sem domínio próprio, a URL padrão do Render é detectada automaticamente. Nunca coloque credenciais reais no arquivo versionado.

Referências: [variáveis automáticas](https://render.com/docs/environment-variables) e [Node.js no Render](https://render.com/docs/node-version).
