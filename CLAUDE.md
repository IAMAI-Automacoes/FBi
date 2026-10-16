# Feedback Inteligente — Contexto para Claude Code

SaaS B2B para donos de restaurantes. Coleta feedback via WhatsApp, processa com IA, entrega insights em dashboard web.

**Roadmap de trabalho:** ver `TASKS.md` — sempre atualizar checkboxes ao concluir tarefas.

---

## Stack Real

| Camada | Tecnologia |
|---|---|
| Frontend | **React 19 + Vite + TypeScript + React Router** (NÃO Next.js) |
| UI | Shadcn UI + Tailwind CSS + Radix UI |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Supabase client | `@supabase/supabase-js` (NÃO @supabase/ssr — inaplicável em SPA) |
| IA | OpenRouter (`google/gemini-2.0-flash-exp:free` dev / `google/gemini-2.5-flash-lite` prod) |
| Automação | n8n + UZapi (WhatsApp gateway) |
| Deploy | Vercel (frontend) + Supabase (backend) |

---

## Como rodar

```bash
npm install
# criar .env (ver seção abaixo)
npm start   # → http://localhost:8080
```

Live Preview da Microsoft (extensão VS Code): aponta para porta 8080.

---

## Variáveis de Ambiente

Criar arquivo `.env` na raiz:

```env
# Públicas (Vite expõe ao browser com prefixo VITE_)
VITE_SUPABASE_URL=https://lixrcruilisncfhfhndo.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key do Supabase>

# Privadas — NUNCA no bundle do frontend, só Edge Functions
# OPENROUTER_API_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
# TRANSCRIPTION_API_KEY=
```

Supabase project ID: `lixrcruilisncfhfhndo`

---

## Regras Obrigatórias

- **Typecheck:** use `npm run typecheck` (aponta para `tsconfig.app.json`).
  `npx tsc --noEmit` na raiz **não checa nada** — o `tsconfig.json` tem
  `"files": []` e só declara `references`, então o comando passa limpo mesmo
  com erro no código. Há ~34 erros preexistentes (tipos gerados do Supabase
  desatualizados quanto a `acoes_operacionais.fixado`); o que importa é não
  aumentar esse número.
- **Commits em português:** `feat:`, `fix:`, `refactor:`, `chore:`
- **Sem `any` sem justificativa** em comentário
- **RLS sempre ativo** — nunca desabilitar
- **`n8n_chat_histories`** — NÃO tocar (gerenciado pelo n8n)
- **`mensagens_chat`** — NÃO tocar (chat interno, escopo separado)
- **`OPENROUTER_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY`** — nunca no client bundle
- **`config_restaurantes.id`** é **bigint** (não uuid) — todas FKs de restaurante usam bigint
- **Supabase client:** importar de `@/lib/supabase/client`

---

## Valores Reais do Banco (CUIDADO — diferem do SRS)

### `acoes_operacionais.status` (CHECK constraint)
```
'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO'
```

### `insights.prioridade` (CHECK constraint)
```
'URGENTE' | 'IMPORTANTE' | 'OBSERVACAO'
```

### `usuarios.cargo` (CHECK constraint)
```
'admin' | 'gerente' | 'visualizador'
```

### `qr_codes.papel_fundo` (CHECK constraint)
```
'padrao' | 'rustico' | 'moderno'
```

---

## Estrutura de Páginas

| Rota | Arquivo | Estado |
|---|---|---|
| `/` | `src/pages/Index.tsx` | Supabase + mock fallback |
| `/feedbacks` | `src/pages/Feedbacks.tsx` | Supabase |
| `/insights` | `src/pages/Insights.tsx` | Supabase |
| `/acoes` | `src/pages/Actions.tsx` | Supabase |
| `/acoes/arquivadas` | `src/pages/AcoesArquivadas.tsx` | Supabase |
| `/relatorios` | `src/pages/Reports.tsx` | Supabase |
| `/qrcode` | `src/pages/QRCodes.tsx` | Supabase |
| `/configuracoes` | `src/pages/Settings.tsx` | Supabase |
| `/minha-conta` | `src/pages/MyAccount.tsx` | Supabase |
| `/notificacoes` | `src/pages/Notifications.tsx` | Supabase |
| `/login` | `src/pages/auth/Login.tsx` | Supabase Auth |
| `/cadastro` | `src/pages/auth/Cadastro.tsx` | Supabase Auth |
| `/onboarding` | `src/pages/auth/Onboarding.tsx` | Supabase |
| `/recuperar-senha` | `src/pages/auth/RecuperarSenha.tsx` | Supabase Auth |

---

## Edge Functions (`supabase/functions/`)

| Função | Responsabilidade |
|---|---|
| `webhook-n8n` | Recebe webhook do n8n/UZapi, alimenta `message_buffer` (tabela legada — NÃO tocar) |
| `chamar-ia` | Analisa feedback via OpenRouter → salva em `feedbacks_restaurante` |
| `gerar-insights` | Agrega feedbacks → gera insights + ações (cron) |
| `sugerir-acoes` | Sugere ações a partir de insights (trigger automático) |
| `gerar-plano-acao` | Gera plano detalhado para uma ação |
| `atualizar-banner` | Atualiza `restaurantes.texto_banner` via IA |
| `gerenciar-qr-code` | CRUD de QR codes |
| `qr-redirect` | Redireciona scan do QR → WhatsApp |
| `criar-cobranca` | Cria cliente + assinatura recorrente ou parcelamento no Asaas e devolve a fatura (`invoiceUrl`) |
| `asaas-webhook` | Eventos do Asaas (`?conta=mei`, token no header) → `cobranca_*` → acesso por `cobranca_aplicar` (idempotente) |
| `cancelar-assinatura` | Recorrente: remove no Asaas antes, acesso até o fim do período. Cupom/manual: por data |

**Cobrança (Asaas, fase 1 — 15/10/2026):** o Stripe saiu. O sistema cria a
cobrança pela API do Asaas com o nosso id (`externalReference`) e manda a
pessoa para a fatura do Asaas; o cartão nunca passa por nós. Quem libera o
acesso é o `asaas-webhook`. Detalhes em `supabase/migrations/20261029100000_cobranca_asaas.sql`.
- Modalidades: recorrente no cartão (mensal, semestral, anual) ou parcelado
  (semestral 6x, anual 12x; `planos_precos.parcelas_max`), que não renova e tem
  7 dias de carência. O parcelado custa mais: a taxa a mais do cartão
  parcelado vai para o cliente (`planos_precos.total_parcelado_centavos`).
- `restaurantes.assinatura_origem`: `asaas_recorrente` (o webhook rege, o cron
  não toca), `asaas_parcelado`, `cupom`, `manual`.
- Contas do Asaas em `contas_cobranca` (hoje só `mei`). Secrets por conta:
  `ASAAS_CONTA_MEI_API_KEY`, `ASAAS_CONTA_MEI_AMBIENTE` (`sandbox`|`producao`),
  `ASAAS_CONTA_MEI_WEBHOOK_TOKEN`. Sandbox → produção = trocar os secrets e
  rodar a limpeza comentada no fim da migration (o banco é o mesmo).
- Descontos (padrão provisório, a confirmar com o Raver; `_shared/asaas/regras.ts`):
  cupom na 1ª cobrança; bônus de indicação em uma mensalidade da próxima renovação.
- Inadimplente paga a fatura vencida, nunca assina de novo. Excluir conta
  remove a assinatura no Asaas antes; se falhar, não exclui.
- Depois de várias falhas seguidas o Asaas PAUSA a fila do webhook: conferir
  os logs do `asaas-webhook` e reativar no painel do Asaas.
- Preços na tabela `planos_precos` (por software e ciclo, editável pelo admin)
  — NUNCA valor fixo no código. `SITE_URL` (config não secreta) fica em
  `integracao_config`, lida por `_shared/config.ts`.

**NOTA:** Não existe `analyze-message` — está implementado como `chamar-ia`.

---

## Queries Existentes (`src/lib/queries/`)

- `feedbacks.ts` — `buscarFeedbacks()`, `buscarCategoriasAtivas()`
- `visao-geral.ts` — `buscarKpis()`, `buscarTendencia()`, `buscarCategorias()`, `buscarUltimosFeedbacks()`
- `acoes.ts` — ações operacionais
- `relatorios.ts` — relatórios

---

## Auth Flow

1. Cadastro → cria `auth.users` + insere uma linha em `restaurantes` (com `auth_user_id`)
2. Login → `RotaProtegida` verifica `session`, assinatura e `excluida_em`
3. Sem plano ativo → `/assinatura`; se `onboarding_completo = false` → `/onboarding`
4. Onboarding → preenche os dados do restaurante e marca `onboarding_completo = true`
5. RLS usa `get_user_restaurante_id()` (função SQL) para isolar dados por restaurante

> **NOTA:** não existem mais as tabelas `usuarios` nem `config_restaurantes` — os
> dados de pessoa e as configurações foram fundidos na própria `restaurantes`
> (a linha é achada por `auth_user_id`).

---

## Supabase RLS

Todas as tabelas principais usam `get_user_restaurante_id()`:
```sql
-- Função (SECURITY DEFINER)
SELECT id FROM public.restaurantes WHERE auth_user_id = auth.uid() LIMIT 1;
```
Garante que gestor A nunca vê dados do restaurante B.

### Conversas do chat (`conversas_chat` / `pastas_chat`)

Nome, fixação e pasta de cada conversa. Antes viviam no `localStorage` (sumiam
ao limpar o cache, não passavam para outro aparelho). As MENSAGENS continuam em
`mensagens_chat`, que segue intocada — uma "conversa" é o agrupamento por
`sessao_id`, e estas tabelas guardam só os metadados dela.

- Dono por `restaurante_id` (bigint), com policies via `get_user_restaurante_id()`.
  **Não** copiar o `USING (true)` de `mensagens_chat`.
- Apagar uma pasta não apaga as conversas: o FK usa `on delete set null` e elas
  voltam para a raiz da lista.
- Query layer: `src/lib/queries/conversas-chat.ts`.

### Ligação insight → feedbacks

`insights.feedback_ids` (`uuid[]`) guarda os IDs de `feedbacks_originais` que
originaram o insight, e `acoes_operacionais.insight_id` propaga o vínculo para a
ação. É o que faz o botão "Feedbacks Relacionados" levar a
`/feedbacks?insight_id=...`. A ponte de id-space é
`feedbacks_restaurante.origem_id → feedbacks_originais.id` (ambos uuid).
`feedbacks_relacionados` deixou de ser um número inventado pela IA: agora é o
tamanho de `feedback_ids`.

### Acompanhamento (aba do admin, para o marketing)

`metricas_diarias` guarda CONTAGENS por restaurante e dia (Brasília): mensagens,
pontos por sentimento, por categoria, clientes novos/retornos, aberturas do QR,
ações e insights. Só público `cliente`; `invalidado_em` não tira o ponto da
conta (bate com a Visão Geral). Cron `metricas-diarias-atualizar` (04:10)
recalcula os últimos 35 dias; dia mais antigo fica congelado e nunca é zerado,
para o histórico sobreviver ao expurgo de feedbacks. Índices são calculados na
leitura (`src/lib/resultados.ts`, com testes). Leitura só para admin.
`autorizacoes_marketing`: case com o nome do restaurante só com autorização
registrada (quem, canal, prova, escopo). Nada do Google entra aqui.
O dono autoriza sozinho em Configurações → Divulgação
(`definir_minha_autorizacao_marketing`, `origem = 'dono'`, canal `painel`): só a
conta dona (`restaurantes.auth_user_id`) e nunca o admin dentro da conta
(`acesso_admin_atual`). O texto aceito é versionado em
`textos_autorizacao_marketing` — mudou o texto, insira versão NOVA, não edite.
Toda mudança vai para `autorizacoes_marketing_historico` (gatilho).
