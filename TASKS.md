# Roadmap de Implementação — Feedback Inteligente

> **Como usar:** Abrir este arquivo no início de cada sessão. Marcar `[x]` nas tarefas concluídas antes de fechar o chat.
> Contexto completo do projeto: ver `CLAUDE.md`.

---

## Sessão 1 — Organização ✅

**Objetivo:** Criar estrutura de trabalho para múltiplas sessões sem perda de contexto.

- [x] Ler README.md e SRS completo
- [x] Mapear todo o código existente
- [x] Criar `CLAUDE.md` com contexto persistente
- [x] Criar `TASKS.md` com roadmap por sessão

---

## Sessão 2 — Ambiente: primeiro render funcional

**Objetivo:** App abre no Live Preview, login funciona, dashboard carrega.

**Antes de começar:** Ter em mãos a anon key do Supabase (painel Supabase → Project Settings → API).

- [x] Criar `.env` na raiz com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
- [x] Rodar `npm install`
- [x] Rodar `npm start` e verificar que abre em `localhost:8080`
- [x] Testar Live Preview no VS Code
- [x] Verificar que página de login renderiza sem erros no console
- [x] Criar conta de teste e logar
- [x] Verificar que `RotaProtegida` redireciona para `/onboarding`

**Concluído quando:** Live Preview mostra `/login` sem erros de console críticos.

---

## Sessão 3 — Auth + Onboarding completo

**Objetivo:** Fluxo cadastro → onboarding → dashboard funciona end-to-end.

- [x] Testar `/cadastro` — cria `auth.users` + `usuarios` no Supabase
- [x] Verificar que `usuarios.onboarding_completo = false` após cadastro
- [x] Testar `/onboarding` — preencher todos os campos (nome restaurante, WhatsApp, instância UZapi, token)
- [x] Verificar que `config_restaurantes` é criado no Supabase
- [x] Verificar que `usuarios.restaurante_id` é preenchido
- [x] Verificar que `usuarios.onboarding_completo = true` ao finalizar
- [x] Verificar redirect para `/` após onboarding
- [x] Testar `/recuperar-senha` — email de reset chega
- [x] Verificar `/minha-conta` — dados do usuário carregam e salvam

**Concluído quando:** Novo usuário passa por todo o fluxo sem erros e chega ao dashboard.

---

## Sessão 4 — Dashboard + Feedbacks: dados reais

**Objetivo:** Dashboard e página de feedbacks funcionam com dados reais do Supabase.

- [x] Dashboard (`/`): verificar KPIs carregam (aceitar mock se < 5 feedbacks)
- [x] Dashboard: verificar gráfico de tendência
- [x] Dashboard: verificar CategoryScores e RecentFeedbacks
- [x] Verificar `AiBanner` carrega `config_restaurantes.texto_banner`
- [x] Feedbacks (`/feedbacks`): lista carrega do Supabase
- [x] Feedbacks: filtros funcionam (sentimento, categoria, período, busca)
- [x] Feedbacks: paginação funciona
- [x] Feedbacks: estado vazio quando não há dados (sem quebrar)
- [x] Inserir 1-2 feedbacks manuais no Supabase e verificar que aparecem

**Concluído quando:** Dashboard e /feedbacks exibem dados reais sem erros de console.

---

## Sessão 5 — Insights + Ações: dados reais

**Objetivo:** Páginas de insights e ações funcionam com dados reais.

- [x] Insights (`/insights`): lista carrega do Supabase
- [x] Insights: filtros por prioridade e categoria funcionam
- [x] Insights: verificar valores de prioridade (`URGENTE` / `IMPORTANTE` / `OBSERVACAO`)
- [x] Insights: botão "Gerar Insights" chama Edge Function `gerar-insights`
- [x] Insights: TaskModal abre e fecha corretamente
- [x] Ações (`/acoes`): TaskBoard carrega colunas com status reais
- [x] Ações: verificar valores de status (`SUGERIDA` / `PENDENTE` / `EM_ANDAMENTO` / `CONCLUIDO`)
- [x] Ações: drag-and-drop ou botão muda status no Supabase
- [x] Ações: SugestoesSidebar carrega ações `SUGERIDA`
- [x] Verificar trigger `trg_acoes_operacionais_perguntas` ao mudar status para `PENDENTE`

**Concluído quando:** Insights e ações exibem dados reais e atualizam status no banco.

---

## Sessão 6 — Settings + QR Code

**Objetivo:** Configurações salvam no Supabase, QR Code funciona.

- [x] Settings → Restaurante: editar e salvar `config_restaurantes`
- [x] Settings → Garçons: cadastrar, ativar e desativar em `garcons`
- [x] Settings → Categorias: cadastrar e ativar/desativar em `categorias`
- [x] Settings → Mascote: editar `mascote_config` jsonb
- [x] Settings → Equipe: listar usuários do restaurante
- [x] QR Code (`/qrcode`): verificar se existe QR code no banco para o restaurante
- [x] QR Code: gerar novo QR code (`gerenciar-qr-code` Edge Function)
- [x] QR Code: download PDF do QR code
- [x] QR Code: verificar redirect (`qr-redirect` Edge Function) → abre WhatsApp correto
- [x] QR Code: verificar contagem de scans em `qr_scans`

**Concluído quando:** Configurações persistem no banco e QR code redireciona para WhatsApp correto.

---

## Sessão 7 — Pipeline de Mensagens (n8n + chamar-ia)

**Objetivo:** Mensagem WhatsApp → buffer → análise IA → feedback salvo.

**Pré-requisito:** n8n configurado e rodando, UZapi com instância ativa.

> ⚠️ **Arquitetura mudou (pull 2026-07-29):** a tabela `buffer_mensagens` **não existe mais**. `webhook-n8n` hoje apenas encaminha o payload para uma URL de webhook n8n externa (`Deno.env('mensagem_follow_up_feedback')`) e não grava nada no Supabase nem chama `chamar-ia` diretamente. A ingestão mensagem→feedback aparentemente foi movida para dentro do próprio n8n (fora deste repo). Itens abaixo marcados como obsoletos refletem a arquitetura antiga.

- [x] Revisar Edge Function `webhook-n8n` (`supabase/functions/webhook-n8n/index.ts`) — hoje só encaminha payload pro n8n externo
- ~~[ ] Verificar que `webhook-n8n` insere em `buffer_mensagens` com `processado = false`~~ *(obsoleto — tabela removida)*
- ~~[ ] Verificar que `webhook-n8n` chama `chamar-ia` após inserir no buffer~~ *(obsoleto — não é mais assim)*
- [x] Revisar Edge Function `chamar-ia` — hoje é um proxy genérico OpenRouter usado por chat/insights/relatórios/banner
- [x] Verificar que `chamar-ia` usa `OPENROUTER_API_KEY` (env var Supabase via `Deno.env`, não bundle)
- ~~[ ] Testar com mensagem manual: inserir row em `buffer_mensagens`, chamar `chamar-ia`~~ *(obsoleto — tabela removida)*
- [ ] Verificar onde `feedbacks_restaurante` é preenchido agora (provavelmente dentro do fluxo n8n — investigar lá)
- ~~[ ] Verificar que `buffer_mensagens.processado = true` após análise~~ *(obsoleto — tabela removida)*
- [ ] Configurar variáveis de ambiente nas Edge Functions do Supabase (painel)
- [ ] Teste end-to-end: mensagem WhatsApp → aparece em `/feedbacks`

**Concluído quando:** Mensagem de texto no WhatsApp aparece como feedback analisado no dashboard.

---

## Sessão 8 — Insights automáticos + Ações sugeridas

**Objetivo:** Pipeline automático de insights e sugestões de ação funciona.

> Nota: `config_restaurantes` não existe mais — os campos (`ultima_analise_insights`, `texto_banner`, etc.) agora moram direto na tabela `restaurantes` (merge com `usuarios`).

- [x] Revisar `gerar-insights` Edge Function
- [x] Verificar modelo IA e prompt em `gerar-insights`
- [ ] Testar `gerar-insights` manualmente via botão no dashboard *(requer teste manual em runtime)*
- [x] Verificar que `insights` são criados com campos obrigatórios
- [x] Verificar que `restaurantes.ultima_analise_insights` é atualizado (era `config_restaurantes`)
- [x] Revisar `sugerir-acoes` Edge Function
- [ ] Verificar trigger `trg_check_sugestoes_acoes` dispara `sugerir-acoes` *(não confirmado nesta análise)*
- [ ] Verificar que `acoes_operacionais` com status `SUGERIDA` aparecem na sidebar *(insert confirmado; exibição no frontend não confirmada)*
- [x] Revisar `gerar-plano-acao` Edge Function
- [ ] Testar geração de plano de ação para um insight *(requer teste manual em runtime)*
- [x] Revisar `gerar-perguntas-direcionadas` Edge Function
- [x] Verificar que perguntas são criadas ao mover ação para `PENDENTE` (trigger `trg_acoes_operacionais_perguntas`)
- [x] Verificar que perguntas são desativadas ao mover ação para `CONCLUIDO` (trigger seta `ativa = false`)

**Concluído quando:** Ciclo completo funciona: feedbacks → insights → ações sugeridas → perguntas direcionadas.

---

## Sessão 9 — Relatórios + Banner IA

**Objetivo:** Relatórios gerados por IA e banner do dashboard funcionam.

> ⚠️ **Notificações foram removidas** (commit `ed01840`): não há mais rota `/notificacoes` em `src/App.tsx`. `src/pages/Notifications.tsx` e a tabela `notificacoes` ainda existem mas estão órfãos (código morto) — considerar deletar ou readicionar a rota.

- [x] Relatórios (`/relatorios`): lista de relatórios existentes carrega
- [x] Existe geração de resumo executivo via IA — não é uma Edge Function dedicada `gerar-relatorio`, e sim `src/lib/queries/relatorios.ts` chamando `chamar-ia` do client (com fallback não-IA)
- [ ] Testar geração de relatório para período selecionado *(requer teste manual em runtime)*
- [x] Verificar que `relatorios.resumo_executivo` é preenchido
- [x] PDF: verificar download funciona (`src/lib/pdf/gerar-pdf-relatorio.ts` + handler `baixar()` em `Reports.tsx`)
- [ ] Verificar `relatorios.url_pdf` é salvo (PDF parece ser gerado localmente no client via jsPDF — não confirmado se salva `url_pdf`)
- [x] Banner IA (`AiBanner`): verificar que carrega `restaurantes.texto_banner` (era `config_restaurantes`)
- [x] Revisar `atualizar-banner` Edge Function
- [ ] Testar atualização do banner via IA *(botão manual existe em `AiBanner`; teste em runtime não confirmado)*
- ~~[ ] Notificações (`/notificacoes`): lista carrega da tabela `notificacoes`~~ *(obsoleto — rota removida do app)*
- ~~[ ] Verificar marcação de notificação como lida~~ *(obsoleto — rota removida do app)*

**Concluído quando:** Relatórios geram e fazem download, banner atualiza via IA.

---

## Sessão 10 — Polish + Launch

**Objetivo:** Revisão final, testes de RLS, preparação para deploy.

- [ ] Testar RLS: criar 2 contas de restaurantes diferentes, verificar isolamento de dados
- [ ] Verificar todos os estados de loading e erro nas páginas
- [ ] Verificar estados vazios (sem feedbacks, sem insights, etc.)
- [ ] Testar fluxo completo em modo mobile (responsividade)
- [ ] Revisar `preferencias_notificacao` em configurações de conta
- [ ] Verificar que `SUPABASE_SERVICE_ROLE_KEY` não aparece no bundle (`npm run build`)
- [ ] Verificar que `OPENROUTER_API_KEY` não aparece no bundle
- [ ] `npm run build` sem erros de TypeScript
- [ ] `npm run lint` sem erros críticos
- [ ] Configurar variáveis de ambiente no Vercel
- [ ] Deploy no Vercel
- [ ] Smoke test no ambiente de produção

**Concluído quando:** App em produção no Vercel, fluxo completo funciona, RLS isolando dados corretamente.

---

## Sessão 11 — Landing Page de Vendas + Checkout Stripe

**Objetivo:** Visitante converte em assinante pagante. Fluxo **auth-first**: landing → login/cadastro → Stripe Checkout → webhook ativa assinatura → onboarding.

### Fluxo definitivo (auth ANTES do pagamento)

```
/vendas → clica "Assinar" (ciclo X)
  → navega pra /checkout?ciclo=X   [ROTA PROTEGIDA]
      ├─ sem sessão → RotaProtegida joga pra /login (guarda state.from)
      │     ├─ tem conta → login → volta pra /checkout?ciclo=X
      │     └─ não tem  → "Criar conta" → /cadastro → volta pra /checkout?ciclo=X
      └─ com sessão → chama criar-checkout-session → redirect Stripe
  → Stripe Checkout (hosted) → pagamento aprovado
  → webhook stripe-webhook → atualiza `restaurantes` (ativo=true, assinatura_status='ativa', expira_em)
  → redirect /checkout/sucesso
      ├─ onboarding_completo=false → /onboarding (campos já pré-preenchidos)
      └─ onboarding_completo=true  → / (reativação de conta antiga)
```

**Renovação/inadimplência:** webhook `invoice.payment_failed` / `customer.subscription.deleted` → `ativo=false`. Conta **continua existindo e continua conseguindo logar** — só não acessa o app. Ao logar, cai em `/assinatura` (tela de reativação) → clica pagar → mesmo `/checkout` → Stripe reusa o `stripe_customer_id` → volta ativo, com todos os dados preservados.

> ⚠️ **Ponto crítico de segurança/UX:** o bloqueio do inadimplente é **por rota, nunca no login**. Se bloquear no `signInWithPassword`, o cliente fica impedido de pagar de novo — perde a venda de reativação.

### O que mudou vs. o PRD original (fluxo era pay-first)

**Removido — deixou de ser necessário:**
- ~~Tabela `assinaturas_pendentes`~~ — existia só pra segurar uma assinatura paga sem dono. Como agora o usuário já está autenticado antes de pagar, o webhook já sabe o `restaurante_id` (via `client_reference_id` do Stripe) e escreve direto em `restaurantes`.
- ~~Página `/criar-conta`~~ — **`/cadastro` já existe** (`src/pages/auth/Cadastro.tsx`) e faz exatamente isso. Reaproveitar, não duplicar.
- ~~RPC `validar_sessao_pagamento`~~ — não há mais sessão anônima pra validar.
- ~~`/checkout/sucesso` com `session_id`~~ — vira tela simples de confirmação + redirect.

**Adicionado — necessário pelo novo fluxo:**
- Rota `/checkout` protegida (é o portão de auth, ganho de graça via `RotaProtegida`).
- Gate de conta inativa em `RotaProtegida` — hoje `restaurantes.ativo` **existe no schema mas não é verificado em lugar nenhum do app** (só aparece em `src/lib/queries/admin.ts` pra listagem). Precisa passar a valer.
- Tela `/assinatura` (reativação) para conta inativa.
- Eventos de ciclo de vida no webhook (renovação, falha de pagamento, cancelamento) — não só `checkout.session.completed`.

**Mantido:** `/vendas` como rota da landing (`/` continua sendo o dashboard), `integracao_config` pros price IDs, nomes `stripe-webhook` / `criar-checkout-session`.

> ✅ **Conflitos já auditados:** `processar-pagamento`/`convidar-membro` não existem no repo (nada a remover). Colunas `stripe_*`/`plano_ciclo`/`assinatura_status` não existem em `restaurantes` (auditado `Row`/`Insert`/`Update`). `ativo` e `é_pagante` já existem. Rotas `/vendas`, `/checkout`, `/checkout/sucesso`, `/assinatura` livres em `src/App.tsx`.

### Fase 1 — Schema Supabase (migration)

- [ ] Adicionar colunas em `restaurantes`: `stripe_customer_id text`, `stripe_subscription_id text`, `plano_ciclo text` (`mensal`/`semestral`/`anual`), `assinatura_status text` (`ativa`/`inadimplente`/`cancelada`), `assinatura_expira_em timestamptz`
- [ ] **Não criar tabela nova** — o estado da assinatura mora em `restaurantes`. `ativo` (já existe) = chave mestra de acesso; `é_pagante` (já existe) mantido em sinc com `assinatura_status`
- [ ] Índice em `stripe_customer_id` e `stripe_subscription_id` (webhook busca por eles)
- [ ] RLS: o usuário pode **ler** suas colunas de assinatura, mas **não escrever** — update só via `service_role` (webhook). Senão dá pra se auto-ativar pelo client
- [ ] Migration versionada em `supabase/migrations/`

### Fase 2 — Stripe (conta + produtos)

- [ ] Criar produto no Stripe com 3 prices recorrentes (mensal, semestral, anual) — valores placeholder, desconto nos ciclos maiores
- [ ] `supabase secrets set STRIPE_SECRET_KEY=...`
- [ ] Configurar endpoint de webhook no painel Stripe → Edge Function `stripe-webhook`, copiar `STRIPE_WEBHOOK_SIGNING_SECRET`
- [ ] Guardar os 3 `price_id` em `integracao_config` (`chave`/`valor`) — sem tabela/coluna nova

### Fase 3 — Edge Functions novas

- [ ] `criar-checkout-session`: lê o JWT do usuário logado (nunca confia em `restaurante_id` vindo do body), resolve `price_id` do ciclo via `integracao_config`, cria Checkout Session `mode: 'subscription'` com `client_reference_id = restaurante_id` e `customer = stripe_customer_id` (se já existir, pro caso de reativação), retorna `session.url`
- [ ] `stripe-webhook`: valida assinatura com `STRIPE_WEBHOOK_SIGNING_SECRET` (usar `constructEventAsync` — Deno é async)
- [ ] `stripe-webhook` → `checkout.session.completed`: grava `stripe_customer_id`, `stripe_subscription_id`, `plano_ciclo`, `assinatura_status='ativa'`, `ativo=true`, `é_pagante=true`, `assinatura_expira_em`
- [ ] `stripe-webhook` → `invoice.paid`: renovação, empurra `assinatura_expira_em`
- [ ] `stripe-webhook` → `invoice.payment_failed`: `assinatura_status='inadimplente'` (ainda não desativa — Stripe ainda vai tentar de novo)
- [ ] `stripe-webhook` → `customer.subscription.deleted`: `ativo=false`, `é_pagante=false`, `assinatura_status='cancelada'` — **nunca apagar dados do restaurante**
- [ ] `stripe-webhook`: idempotência por `event.id` (Stripe reentrega evento; não pode aplicar duas vezes)

### Fase 4 — Ajustes no fluxo de auth existente

- [ ] `src/App.tsx`: adicionar `/vendas` (pública) e `/checkout`, `/checkout/sucesso`, `/assinatura` (dentro de `RotaProtegida`)
- [ ] `RotaProtegida`: liberar `/checkout` mesmo com `onboarding_completo=false` (hoje ele força redirect pra `/onboarding` — travaria quem acabou de criar conta e ainda vai pagar). Mesmo padrão da exceção que já existe pra `/onboarding-membro`
- [ ] `RotaProtegida`: novo gate — se `ativo=false`, redirecionar pra `/assinatura`, **exceto** nas rotas `/assinatura`, `/checkout`, `/checkout/sucesso` e `/minha-conta`
- [ ] `Cadastro.tsx`: hoje faz `navigate('/onboarding')` fixo (linha ~65) — passar a respeitar o retorno pra `/checkout?ciclo=X` quando veio da landing
- [ ] `Cadastro.tsx` + `use-auth.tsx` (`cadastro`, linhas 120-151): hoje grava `nome_restaurante: 'Meu Restaurante'` hardcoded. Gravar o nome real informado → o pré-preenchimento do onboarding **já funciona sozinho** (`Onboarding.tsx:74-87` só ignora o valor quando ele é literalmente `'Meu Restaurante'`)
- [ ] `Login.tsx`: **nenhuma mudança necessária** — já lê `location.state.from` (linha 28) e volta pra origem após login. Só conferir que o link "criar conta" propaga o destino

### Fase 5 — Landing page (`/vendas`)

- [ ] Header — logo FBi, CTA "Assinar" (scroll até Planos)
- [ ] Hero — proposta de valor + CTA primário
- [ ] Como funciona — 4 passos (QR na mesa → cliente responde → IA gera insight → restaurante age)
- [ ] Benefícios/features
- [ ] Planos — card único, toggle mensal/semestral/anual, desconto nos ciclos maiores (placeholder), botão → `/checkout?ciclo=X`
- [ ] FAQ
- [ ] CTA final + footer
- [ ] Responsivo mobile (landing recebe tráfego frio, maioria mobile)
- [ ] Link discreto "Já sou cliente / Entrar" no header → `/login`

### Fase 6 — Telas de checkout e reativação

- [ ] `/checkout`: spinner + chama `criar-checkout-session` com o ciclo da query string, redireciona pro Stripe. Se der erro, mensagem + botão voltar pra `/vendas`
- [ ] `/checkout/sucesso`: confirma pagamento, aguarda o webhook processar (pequeno polling em `restaurantes.assinatura_status`, com timeout e fallback amigável), depois manda pra `/onboarding` ou `/`
- [ ] `/assinatura`: tela de conta inativa — explica situação, mostra ciclo anterior, botão "Reativar" → `/checkout?ciclo=X`, botão sair

### Fase 7 — Testes

- [ ] Cartão de teste (`4242 4242 4242 4242`) nos 3 ciclos, em Stripe test mode
- [ ] Webhook local: `stripe listen --forward-to <url da function>`
- [ ] Fluxo visitante novo: `/vendas` → cadastro → pagamento → onboarding pré-preenchido
- [ ] Fluxo cliente existente deslogado: `/vendas` → login → pagamento (sem passar por onboarding de novo)
- [ ] Fluxo reativação: forçar `ativo=false` no banco → logar → deve cair em `/assinatura`, conseguir pagar e voltar com **todos os dados antigos intactos**
- [ ] Abandono no meio: fechar aba no Stripe → conta fica criada e inativa, sem lixo no banco, e dá pra retomar
- [ ] Tentar burlar: com sessão de usuário comum, tentar `update` direto em `restaurantes.ativo`/`assinatura_status` pelo client → RLS deve barrar
- [ ] Confirmar que `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SIGNING_SECRET` não aparecem no bundle (`npm run build`)

**Concluído quando:** visitante em `/vendas` cria conta, paga, cai no onboarding pré-preenchido; e um cliente com conta desativada consegue logar, reativar pagando e recuperar todos os dados.

---

## Notas Importantes

### Discrepâncias SRS vs Código Real
O SRS é o documento de referência para lógica de negócio, mas o README.md tem prioridade sobre escolhas técnicas. Principais diferenças já mapeadas no `CLAUDE.md`.

### Edge Functions — Deploy
Para fazer deploy das Edge Functions:
```bash
supabase functions deploy <nome-da-funcao>
```
Configurar variáveis secretas:
```bash
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

### Testar Edge Functions localmente
```bash
supabase functions serve <nome-da-funcao> --env-file .env.local
```
