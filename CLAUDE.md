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
'SUGERIDA' | 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDO'
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
