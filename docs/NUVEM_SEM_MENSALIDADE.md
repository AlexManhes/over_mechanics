# Nuvem sem mensalidade de hospedagem

**Referência opcional não selecionada.** O usuário prefere não informar cartão. A solução atual foi adaptada para [Cloudflare + Supabase](CLOUDFLARE_SUPABASE.md); siga esse guia. Nenhuma conta ou VM Oracle foi criada.

## Situação

O objetivo é acessar com o PC da oficina desligado, sem comprar domínio e sem mensalidade. Uma alternativa compatível com o backend atual é uma VM **Oracle Cloud Always Free**, com Ubuntu, Node.js, SQLite e fotos no disco persistente da VM. Um subdomínio gratuito do DuckDNS e o Caddy podem fornecer o endereço HTTPS.

**Esta é uma configuração de referência, ainda não publicada.** Não há conta Oracle conectada, VM criada, subdomínio reservado, dados transferidos ou certificado emitido por esta entrega. O acesso real por celular ainda depende dessas etapas e da validação final.

## Condições da gratuidade

- A Oracle exige cartão para verificar o cadastro e pode fazer uma autorização temporária. Dados de cartão devem ser informados exclusivamente no site oficial, nunca no chat ou no repositório.
- Use somente recursos elegíveis **Always Free**, na região principal da conta e dentro das cotas exibidas no painel. Os créditos de teste de 30 dias não equivalem à gratuidade permanente. Não é necessário migrar para Pay As You Go; não faça isso para contornar falta de capacidade.
- A oferta depende da aprovação do cadastro e da capacidade disponível. A Oracle pode retomar instâncias consideradas ociosas; portanto esta opção não garante funcionamento ininterrupto. Não gere carga artificial para evitar essa política.
- O armazenamento tem limites. Confira a soma dos volumes e o espaço disponível para as fotos. Não habilite serviços pagos ou exclusão automática de fotos.
- DuckDNS fornece um subdomínio, como `nome-escolhido.duckdns.org`; a disponibilidade do nome e o funcionamento do serviço são externos ao projeto.

Consulte os termos e as cotas atuais antes de criar recursos: [Oracle Free Tier](https://www.oracle.com/cloud/free/), [recursos Always Free e retomada por ociosidade](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [DuckDNS](https://www.duckdns.org/). Referências consultadas em 24/10/2026. Não há promessa de gratuidade ou disponibilidade sem limites.

## Preparar o servidor

1. Crie sua conta gratuita no site oficial da Oracle. Escolha uma VM Ubuntu com imagem e formato elegíveis Always Free, volume persistente e IP público. Confirme a elegibilidade e o custo no painel antes de criar. Não use uma imagem de marketplace com licença paga.
2. Guarde a chave SSH privadamente. Restrinja SSH (porta 22) ao seu IP de administração. Configure na rede da nuvem e no firewall do Ubuntu a entrada TCP 80 e 443. A porta 3000 ficará somente em loopback; não abra essa porta publicamente.
3. No DuckDNS, reserve o subdomínio e aponte-o para o IP público da VM. Se o IP mudar, atualize esse registro. Não publique o token do DuckDNS.
4. Instale Node.js **24 LTS**, compatível com a arquitetura da VM (x64 ou ARM64), seguindo o [download oficial](https://nodejs.org/en/download). Para o serviço de exemplo, o executável deve estar em `/usr/local/bin/node`; se instalar em outro caminho, ajuste `ExecStart`. Confirme a versão e a disponibilidade de `node:sqlite`.
5. Instale o Caddy pelo [pacote oficial para Ubuntu](https://caddyserver.com/docs/install#debian-ubuntu-raspbian). Ele precisa de DNS correto, portas 80/443 acessíveis e armazenamento persistente para emitir e renovar os certificados. Veja [HTTPS automático](https://caddyserver.com/docs/automatic-https).
6. Clone `https://github.com/AlexManhes/over_mechanics` em `/opt/over_mechanics`. Crie um usuário de sistema sem login chamado `overmechanics`, com grupo do mesmo nome, e a pasta `/var/lib/over-mechanics`, pertencente a esse usuário, com modo `0700`. Deixe o código legível, mas sem permissão de escrita para esse usuário. Não é necessário executar `npm install` para esta versão.

## Configuração privada

Crie `/etc/over-mechanics.env`, com proprietário `root:root` e modo `0600`. Use as linhas abaixo, substituindo o endereço e a chave fictícios. Esse arquivo usa o formato simples `CHAVE=valor`, sem comandos de shell.

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
AUTH_REQUIRED=true
COOKIE_SECURE=true
PUBLIC_ORIGIN=https://nome-escolhido.duckdns.org
DATA_DIR=/var/lib/over-mechanics
SETUP_KEY=SUBSTITUA_POR_UMA_CHAVE_ALEATORIA_PRIVADA
```

Gere uma chave aleatória de pelo menos 24 caracteres e substitua o exemplo. Ela autoriza o cadastro inicial do administrador. Guarde-a privadamente; o exemplo não é uma chave válida para uso real. O servidor recusa produção sem os requisitos de autenticação, HTTPS e diretório de dados explícito. O login é obrigatório para este acesso externo.

Copie [o modelo de serviço](../config/over-mechanics.service.example) para `/etc/systemd/system/over-mechanics.service`, depois de ajustar os caminhos. Ele lê a configuração privada, executa com usuário dedicado, reinicia em falhas e permite escrita apenas na pasta de dados e no temporário privado.

Para o Caddy, adapte [o exemplo de proxy](../config/Caddyfile.example), substituindo o domínio por `nome-escolhido.duckdns.org`, e use-o em `/etc/caddy/Caddyfile`. Valide com `caddy validate --config /etc/caddy/Caddyfile` antes de recarregar. Não configure cache das rotas `/api/` nem das fotos privadas.

Depois de revisar os arquivos no servidor:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now over-mechanics
sudo systemctl status over-mechanics
curl --fail http://127.0.0.1:3000/healthz
sudo systemctl reload caddy
```

O endpoint `/healthz` só confirma que o backend responde e acessa o banco. O HTTPS e o acesso externo precisam de verificação separada. Em caso de erro, consulte `journalctl -u over-mechanics -n 50` e `journalctl -u caddy -n 50`, removendo segredos antes de compartilhar saídas.

## Preservar os atendimentos e as fotos atuais

Clonar o GitHub começa com uma base vazia. Pare o aplicativo do PC e faça [backup completo](DADOS_E_BACKUP.md) do banco e das fotos. Com o serviço da VM parado, transfira esse conteúdo por SSH para `/var/lib/over-mechanics`, preservando a estrutura, e ajuste a propriedade para `overmechanics:overmechanics`. Não substitua um banco em uso e não envie dados reais pelo repositório público.

Reinicie a VM pelo serviço acima. Se ainda não existir administrador, abra o endereço HTTPS e cadastre-o com a chave inicial. Depois, crie as contas dos mecânicos. Use **o mesmo endereço HTTPS** no PC e no celular. O PC deixa de ser o servidor; continuar cadastrando na instalação local criaria dados separados, sem sincronização automática.

## Validar antes do uso diário

1. Abra o endereço HTTPS no PC e no celular usando dados móveis, com o Wi-Fi desligado. Confirme o certificado válido e a exigência de login para registros e fotos.
2. Cadastre um atendimento fictício com fotos Antes/Depois em um aparelho e consulte-o no outro. Confirme histórico, prazos e retorno, inclusive em arquivados.
3. Reinicie o serviço da VM e consulte novamente o mesmo registro e as fotos. Desligue o PC da oficina e repita a consulta no celular.
4. Instale a PWA no navegador compatível. Ela continua exigindo conexão com a VM para consultar e gravar dados.
5. Remova os dados fictícios somente se houver uma forma administrativa explícita para isso; não apague arquivos do banco manualmente. O aplicativo não implementa limpeza automática.

Esses testes externos ainda não foram executados: faltam a conta e os recursos do usuário. A configuração de systemd é um modelo para Ubuntu e não foi executada no Windows.

## Backup e manutenção

O disco da VM preserva arquivos entre reinicializações, mas não substitui backup. Pare o serviço, copie **todo** `/var/lib/over-mechanics` para destino privado fora da VM e reinicie. Guarde também a configuração privada e os arquivos de infraestrutura em local protegido. Restaure primeiro em uma pasta/servidor separado e valide registros e fotos antes de adotar a cópia.

O backup externo e seu agendamento não estão configurados automaticamente. Uma retomada de VM, falha no volume, exclusão da conta ou perda de credenciais pode interromper o acesso. Atualizações do Ubuntu, Node e Caddy, renovação de DNS e acompanhamento de cotas fazem parte da manutenção do servidor.
