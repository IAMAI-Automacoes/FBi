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
- [x] ~~Verificar trigger `trg_check_sugestoes_acoes` dispara `sugerir-acoes`~~ — removido em 16/09/2026 junto com o status `SUGERIDA`
- [x] ~~Verificar que `acoes_operacionais` com status `SUGERIDA` aparecem na sidebar~~ — status removido em 16/09/2026
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

## Sessão 11 — Landing Page de Vendas + Checkout Stripe ✅ (código) / ⏳ (configuração)

**Objetivo:** Visitante converte em assinante pagante. Fluxo **pay-first**: landing → Stripe Checkout → cria a conta na volta → vínculo seguro no servidor → onboarding. Documentação completa (modelo de dados, Dashboard, descritor, e-mails, testes): **`docs/stripe/README.md`**.

### Fluxo definitivo (pagamento ANTES da conta)

```
/vendas → "Assinar" (ciclo X) → create-checkout-session (anon) → Stripe Checkout
  → success_url = /cadastro?sessao={CHECKOUT_SESSION_ID}
      → consultar-compra pré-preenche/trava o e-mail do pagador
      → cria a conta → /checkout/sucesso?sessao=... → vincular-compra (JWT)
          confere no Stripe: paga + e-mail igual + sessão nunca usada → liga
      → assinatura_status='ativa' → /onboarding
Conta sem plano (/assinatura) → mesma função com JWT → webhook vincula sozinho.
```

### Feito nesta sessão

- [x] Migration `20260929000000_stripe_assinaturas.sql`: `stripe_clientes`, `stripe_assinaturas`, `stripe_checkout_sessions`, `stripe_eventos_webhook`, RLS, `aplicar_assinatura_stripe()`, cron de expiração ignora assinante Stripe
- [x] `get-prices` (Stripe por lookup_key, cache 5 min) — nenhum valor fixo em código/banco
- [x] `create-checkout-session` (Zod, lookup_key → price, `allow_promotion_codes`, metadata `product_code=easyfeed`)
- [x] `stripe-webhook` (`constructEventAsync`, idempotência por `event.id`, relê a assinatura no Stripe)
- [x] `consultar-compra` + `vincular-compra` (vínculo pagamento → conta, anti-reuso do session_id)
- [x] `create-portal-session` (Customer Portal com configuração própria)
- [x] `cancelar-assinatura` passa a cancelar no Stripe (`cancel_at_period_end`)
- [x] Frontend: `Planos`, `Assinatura`, `Checkout`, `Autenticacao` (`?sessao=`), `CheckoutSucesso` (polling), `MyAccount` (portal), `usePrecos`
- [x] Scripts locais (Deno): `scripts/stripe/bootstrap.ts`, `trocar-preco.ts` (dry-run), `migrar-assinantes.ts`, `configurar-portal.ts`
- [x] Migration `20260930030000`: `stripe_faturas` (histórico), `stripe_repasses` (livro-razão), `afiliado_id` na assinatura, payload dos eventos (90 dias), `gerar_repasses_da_fatura()`
- [x] Divisão de receita: sócios/empresa por Pix (marcar pago no painel); afiliados por Stripe Connect (`conectar-afiliado`, transferência em `invoice.paid`)
- [x] Código de indicação (`?ref=` ou digitado) na landing e em /assinatura; painel admin com Repasses e Connect do afiliado; "Cobranças" em /minha-conta

### Falta (configuração, fora do código)

- [ ] `supabase db push` (migration) e `supabase functions deploy` das 7 funções (ver README: quais vão com `--no-verify-jwt`)
- [ ] Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`; em `integracao_config`: `SITE_URL`, `STRIPE_PORTAL_CONFIGURATION_ID`
- [ ] Stripe Connect: ativar na conta (Dashboard → Connect), conferir se Express/BR está liberado (VERIFICAR)
- [ ] `bootstrap.ts` (Product + 3 Prices) e `configurar-portal.ts --criar` em test mode; depois em live
- [ ] Endpoint de webhook no Dashboard apontando para `stripe-webhook`, com os eventos listados no README
- [ ] Dashboard: descritor e prefixo curto, marca, termos/privacidade, desligar e-mails automáticos (ver README)
- [ ] Roteiro de testes do README com Stripe CLI (falha de pagamento, troca de ciclo, troca de preço, cupom)
- [ ] Confirmar no `npm run build` que nenhuma chave `sk_` / `whsec_` aparece no bundle


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
