# Workflow do n8n "EasyFeed - Recuperação de senha"

Arquivo: `recuperar-senha.json` (importar no n8n). Teste: `testar-recuperar-senha.cjs` (roda no `npm test`).

Manda o e-mail de "Esqueci a senha" pela caixa **nao-responda@easyfeed.com.br** (e-mail da Hostinger), em vez do remetente padrão do Supabase.

## Como funciona

1. Na tela `/recuperar-senha`, a pessoa digita o e-mail.
2. A função **recuperar-senha** do Supabase:
   - aplica a trava contra abuso (1 e-mail por minuto por endereço, 5 pedidos por hora por IP — tabela `recuperacoes_senha`);
   - gera o link oficial de recuperação do Supabase;
   - chama este webhook com `{ email, nome, link, validadeMinutos }` e o cabeçalho `x-easyfeed-segredo`.
3. O n8n confere o segredo e o link, monta o e-mail e envia por SMTP.
4. Se o n8n falhar ou estiver desligado, a função manda pelo e-mail padrão do Supabase. A recuperação de senha nunca para.

E-mail sem conta no EasyFeed recebe a mesma resposta "enviado" na tela, mas nada é enviado (para a tela não revelar quem tem conta).

## Como colocar no ar

1. **Caixa de e-mail:** na Hostinger, crie (se ainda não existir) a caixa `nao-responda@easyfeed.com.br` e anote a senha.
2. **Importar:** no n8n, menu ⋯ → Import from File → `recuperar-senha.json`.
3. **Credencial do webhook** (nó "Recebe pedido"): crie uma credencial **Header Auth**:
   - Name: `x-easyfeed-segredo`
   - Value: o valor do segredo `N8N_RECUPERAR_SENHA_SEGREDO` (o mesmo que está nos segredos do Supabase).
4. **Credencial SMTP** (nó "Envia o e-mail"): crie uma credencial **SMTP**:
   - User: `nao-responda@easyfeed.com.br`
   - Password: a senha da caixa
   - Host: `smtp.hostinger.com`
   - Port: `465`
   - SSL/TLS: ligado
5. **Ativar** o workflow. A URL de produção é `https://n8n-n8n-main.tikvpg.easypanel.host/webhook/easyfeed-recuperar-senha`, a mesma do segredo `N8N_RECUPERAR_SENHA` no Supabase.

## Teste

Na tela de login, "Esqueci a senha", com o seu e-mail. Deve chegar "Crie sua nova senha do EasyFeed" de nao-responda@easyfeed.com.br; o botão abre a tela de criar nova senha. Para ver se saiu pelo n8n, olhe as execuções do workflow.

Se o e-mail cair no spam: na Hostinger, confira se o domínio easyfeed.com.br tem SPF, DKIM e DMARC configurados (Hostinger → E-mails → Configurações de DNS).

## Quando não chega

O log da função **recuperar-senha** (Supabase → Edge Functions → recuperar-senha → Logs) mostra o que o n8n respondeu:

- `n8n respondeu 403` + "Authorization data is wrong!": a credencial Header Auth do nó "Recebe pedido" não bate com o segredo. Confira Name `x-easyfeed-segredo` e o Value **sem espaço, aspas ou crase** antes ou depois. Depois de salvar a credencial, desative e ative o workflow.
- `n8n respondeu 404`: o workflow está desativado, ou o caminho do webhook mudou.
- `n8n respondeu 502`: o n8n recebeu, mas o SMTP falhou. Veja o erro na execução do workflow (Executions) e confira usuário, senha, porta 465 e SSL da credencial SMTP.

Em qualquer desses casos, o e-mail sai pelo Supabase como reserva. Se o Supabase acabou de gerar o link para o n8n, ele só deixa mandar outro depois de ~1 minuto, e a função espera esse minuto sozinha. Então o e-mail de reserva chega cerca de 1 minuto depois.
