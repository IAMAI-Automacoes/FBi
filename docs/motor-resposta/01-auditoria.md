# Motor de Resposta a Feedbacks — Auditoria (Fase 1)

Data: 2026-08-24. Projeto Supabase: `lixrcruilisncfhfhndo`.
Toda afirmação abaixo tem evidência: arquivo:linha, nome de migration, ou consulta SQL rodada no banco remoto via MCP.
Onde não foi possível verificar, está marcado **NÃO VERIFICADO** com o que preciso de você.

---

## 1.1 Mapa geral

### Estrutura de pastas

O repositório está aninhado: a raiz do workspace é `Feedback Inteligente/`, e o projeto real vive em
`Feedback Inteligente/Feedback Inteligente/`. Só existe um `package.json` de app (`package.json:1-3`, name `easy-feed`, version `0.0.197`).

| Parte | Stack | Onde |
|---|---|---|
| Frontend | React 19 + Vite 8 + TypeScript + React Router 7 | `src/` |
| UI | Shadcn/Radix + Tailwind 3 | `src/components/ui/` |
| Backend | **Só Supabase.** Não existe servidor próprio. | `supabase/functions/` |
| Banco | Postgres (Supabase) | `supabase/migrations/` (53 arquivos) |
| IA | OpenRouter | `supabase/functions/_shared/openrouter.ts` |
| WhatsApp | uazapi (gateway), orquestrado por n8n | fora do repo |
| Deploy | Vercel (front) + Supabase (back). Existe também `Dockerfile` + `nginx.conf` (build estático). | raiz |

### Frontend → backend
SPA pura. Fala com o banco via `@supabase/supabase-js` direto (RLS é a autorização) e com Edge Functions via
`supabase.functions.invoke(...)`. Client único em `src/lib/supabase/client.ts`, importado como `@/lib/supabase/client`.

### Backend
**Não há servidor próprio.** 18 Edge Functions Deno em `supabase/functions/`:
`admin-excluir-conta`, `atualizar-banner`, `cancelar-assinatura`, `chamar-ia`, `classificar-feedback`,
`destacar-feedback`, `enviar-push`, `excluir-minha-conta`, `expirar-assinaturas`, `gerar-insights`,
`gerar-plano-acao`, `gerenciar-qr-code`, `qr-landing`, `qr-redirect`, `sugerir-acoes`, `webhook-n8n`,
`whatsapp-instancia` (+ `_shared/`).

### Supabase — extensões habilitadas (consulta `list_extensions`)
Instaladas: **`pg_cron` 1.6.4**, **`pg_net` 0.19.5**, `pgcrypto`, `uuid-ossp`, `vector`, `pg_stat_statements`, `supabase_vault`, `plpgsql`.
Disponíveis mas **NÃO instaladas**: `pgmq` (1.5.1), `http`, `dblink`, `pg_tle`, `pgtap`.
→ **Não existe fila (pgmq/Supabase Queues) no projeto hoje.** Existe `pg_cron` + `pg_net`, e eles já são o padrão de agendamento usado.

### Migrations
53 arquivos, de `20260328135023_add_new_tables_and_columns.sql` a `20260823000000_insights_fixado.sql`.
⚠️ **As tabelas centrais não estão nas migrations.** `feedbacks_restaurante`, `acoes_operacionais` e a antiga
`config_restaurantes` (hoje `restaurantes`) foram criadas fora do repo, antes da primeira migration. As migrations
só as alteram (ex.: `20260418134333_schema_update.sql:88-91` adiciona o CHECK de status). A fonte de verdade do
schema é o banco remoto — foi o que consultei.

### n8n
**Não versionado no repo.** Zero arquivos JSON de workflow no repositório.

Workflows conhecidos até agora:

| Workflow | Id | Estado | O que faz |
|---|---|---|---|
| **`Feedback Restaurante Uazapi`** | `l5wVrOVCkmjbQfJn` | `active: true` | Entrada: recebe mensagem da uazapi em `POST /webhook/easyfeed`, transcreve áudio, faz debounce, classifica, grava em `feedbacks_originais` + `feedbacks_restaurante` e manda o **ack**. Detalhado em §1.3. Export recebido em 2026-08-24. |
| consumidor de `status_açoes` | — | — | **NÃO VERIFICADO.** Recebe o disparo do trigger `Status_feedback`. Export ainda não recebido. |
| consumidor de `mensagem_follow_up_feedback` | — | — | **NÃO VERIFICADO.** Recebe o proxy da edge fn `webhook-n8n`. Pode ser o mesmo workflow acima. |

Endpoints n8n conhecidos:
- `https://n8n-n8n-main.tikvpg.easypanel.host/webhook/easyfeed` — entrada de mensagens (produção)
- `https://n8n-n8n-main.tikvpg.easypanel.host/webhook-test/status_açoes` — disparo de status (**URL de teste**)

⚠️ O n8n **já escreve direto no Supabase** hoje, com a credencial `Feedback Restaurante`
(id `J3N40FgVQE4DIL2U`), em 5 nós do tipo `n8n-nodes-base.supabase`: `Verifica Restaurante` (SELECT),
`Gravar Buffer`/`Ler Buffer`/`Limpar Buffer` (message_buffer), `Informações Feedback1` e `Informações Feedback`
(INSERT). Isso é relevante para a decisão do motor: a regra "n8n não fala com o banco" que proponho para o
fluxo novo é uma mudança de padrão, não a continuação de um padrão existente.

### Segredos e env
- Front (`.env`): só `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Confirmado — nada privado no bundle.
- Edge Functions: `Deno.env.get(...)` — `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
  `UAZAPI_BASE_URL`, `UAZAPI_ADMIN_TOKEN`, e o secret **`mensagem_follow_up_feedback`** (`supabase/functions/webhook-n8n/index.ts:16`).
- Fallback em banco: tabela `integracao_config` (6 linhas, deny-all no RLS, lida por funções SECURITY DEFINER).
- ⚠️ **JWT anon em texto puro dentro de corpos de trigger**: `20260424222153_trigger_sugerir_acoes.sql:18,29`,
  `20260812030000_trigger_sugerir_acoes_por_restaurante.sql:57`, `20260812040000_feedback_temas.sql:56`,
  `20260820000000_destaque_feedback_original.sql:54`. E o `CRON_SECRET` aparece em claro no comando do cron job 2
  (consulta `cron.job`).

### Ambientes
**Só produção.** Um único projeto Supabase, sem branches (`list_branches` não foi consultado, mas não há
`config.toml`, nem `supabase/.branches`, nem referência a projeto de staging em lugar nenhum). O endpoint n8n
descoberto é `/webhook-test/` — que no n8n é a URL de **teste**, não a de produção. Isso é uma dívida por si só (§1.6).

---

## 1.2 Inventário do domínio

Colunas confirmadas por `information_schema.columns` no banco remoto.

### `feedbacks_originais` — a MENSAGEM do cliente (uuid)
Criada em `supabase/migrations/20260812030000_feedbacks_originais.sql:10-17`. 63 linhas.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `restaurante_id` | `bigint` → `restaurantes(id) ON DELETE CASCADE` | |
| `telefone_cliente` | `text` | **é aqui que o cliente "existe"** |
| `texto_original` | `text` | |
| `created_at` | `timestamptz NOT NULL default now()` | |
| `sentimento` | `text` | `20260812110000:5` |
| `texto_destacado` | `text` | `20260820000000:13` |

Índices: `feedbacks_originais_pkey`, `idx_feedbacks_originais_restaurante (restaurante_id, created_at DESC)`.
**Não há índice em `telefone_cliente`.**

### `feedbacks_restaurante` — os PONTOS extraídos (bigint)
Pré-existe ao repo. 146 linhas.

| Coluna | Tipo |
|---|---|
| `id` | `bigint` PK identity |
| `created_at` | `timestamptz NOT NULL` |
| `texto_original`, `categoria`, `sentimento`, `resumo` | `text` |
| `telefone_cliente` | `text` (duplicado de `feedbacks_originais`) |
| `restaurante_id` | `bigint` |
| `origem_id` | `uuid` → `feedbacks_originais(id) ON DELETE CASCADE` (`20260812020000:11-12`, FK em `20260812030000:38-40`) |
| `tema_id` | `uuid` → `feedback_temas(id) ON DELETE SET NULL` |

O n8n quebra uma mensagem em N pontos; todos compartilham `origem_id` (`20260812020000_feedbacks_origem_id.sql:1-9`).
**Não existe hoje nenhuma coluna que marque "este feedback já foi usado"** — é exatamente a lacuna da sua instrução extra.

### `insights` (uuid) — 59 linhas
`id`, `restaurante_id bigint`, `prioridade text NOT NULL` (CHECK `URGENTE|IMPORTANTE|OBSERVACAO`), `categoria`,
`titulo NOT NULL`, `descricao`, `sugestao`, `feedbacks_relacionados int default 0`, `gerado_por text default 'ia'`,
`ativo boolean default true`, `created_at`, **`feedback_ids uuid[] NOT NULL default '{}'`** (índice GIN
`idx_insights_feedback_ids`), `fixado boolean NOT NULL default false`.
`feedback_ids` guarda IDs de **`feedbacks_originais`**, não de `feedbacks_restaurante` (`20260813010000:9-11`,
e a montagem em `supabase/functions/gerar-insights/index.ts:145-152,198-206`).

### `acoes_operacionais` (bigint) — 17 linhas
`id`, `created_at`, `prioridade`, `titulo_acao`, `plano_detalhado`, **`status text`** (CHECK
`SUGERIDA|PENDENTE|EM_ANDAMENTO|CONCLUIDO`, `20260418134333_schema_update.sql:88-91`, criado NOT VALID),
`feedback_id bigint` (**morto** — sem FK, nunca escrito: `sugerir-acoes/index.ts:186-195` e `criarAcao` em
`src/lib/queries/acoes.ts:83` não o preenchem), `categoria`, `texto` (marcador "veio da IA"), `restaurante_id bigint`,
`ordem int`, `insight_id uuid` → `insights(id) ON DELETE SET NULL`, `arquivada_em timestamptz`, `responsavel text`,
`prazo date`, `fixado boolean`.
Índices: pkey, `idx_acoes_insight (insight_id)`, `idx_acoes_arquivada (restaurante_id, arquivada_em)`.

### `insight_feedbacks` — **tabela órfã**
Existe no banco (0 linhas): `insight_id uuid`, `feedback_id bigint`, PK composta, índice
`insight_feedbacks_feedback`, e uma policy SELECT. **Nenhuma migration a cria** e **nenhum código a referencia**
(grep em `src/` e `supabase/` só acha a definição de tipo). Aponta para `feedbacks_restaurante` (os pontos), não
para `feedbacks_originais` (a mensagem) — grão errado para mensageria.

### `restaurantes` (bigint) — 4 linhas, é o tenant + o perfil do dono
Config relevante: `config_insights jsonb` (default `{"feedbacks_por_analise":10,"horas_entre_analises":24,
"max_importantes":5,"max_observacoes":3,"max_sugestoes_acoes_por_ciclo":3}`), `mascote_config jsonb`,
`ia_modo_acao`, `numero_whatsapp` (unique parcial, `20260810000000:4-6`), `whatsapp_token`,
`whatsapp_admin_token`, `whatsapp_base_url`, `perfil_restaurante jsonb`, `assinatura_status`, `excluida_em`,
`auth_user_id uuid NOT NULL`, `credito_ia_limite_usd`, `frequencia_relatorios`.
→ **Já existe o padrão "config em jsonb por restaurante"** (`config_insights`). É onde os parâmetros do motor devem morar.

### Sem tabela de contato / cliente
Consulta `list_tables` (39 tabelas): não há `clientes`, `contatos`, `remetentes`. O cliente é uma string de telefone
solta em duas tabelas.

### Sem registro de mensagem enviada
Não há `mensagens_enviadas`, `envios`, `outbox`. `mensagens_chat`/`conversas_chat` são o chat interno do dono
(escopo separado, proibido tocar). `message_buffer` (0 linhas) é legado do n8n.

---

### (a) A relação feedback ↔ ação é N:N nos dois sentidos? **NÃO. Não existe relação direta.**

A única cadeia viva é indireta e de mão única:

```
acoes_operacionais.insight_id → insights.id → insights.feedback_ids uuid[] → feedbacks_originais.id
```

- **N feedbacks → 1 ação:** funciona por acidente (o array do insight tem N ids).
- **1 feedback → N ações:** funciona só se as N ações vierem de insights diferentes que citem o mesmo feedback.
  Nada garante nem materializa isso.
- **Pior:** `insight_id` é `ON DELETE SET NULL` (`20260813010000:19`). Apagar um insight (botão em
  `src/pages/Insights.tsx:224-233`) **rompe permanentemente** o vínculo ação↔feedback. A ação fica órfã e o motor
  nunca saberia para quem avisar.

**Lacuna confirmada, e é a mais grave da feature.** Sem uma ligação materializada `acao ↔ feedback_original`, o
aviso pendente não tem como nascer com os `feedback_ids` corretos.

### (b) Existe identidade estável de contato? **NÃO, mas o dado real está limpo.**

Não há tabela, nem normalização, nem unique, nem índice. Mas rodei no banco:

```
total=63, com_tel=63, distintos=11, minlen=13, maxlen=13,
só_dígitos=63, com_'@'=0, com_'+'=0
```

Ou seja: **100% dos telefones já estão em `55DDNNNNNNNNN` (13 dígitos, só dígitos)** — E.164 sem o `+`.
O mesmo telefone aparece em restaurantes diferentes (`5511987650003` em 11 e 12), o que confirma que a chave
precisa ser `(restaurante_id, telefone)`.
Ressalva: a amostra tem 43 de 63 linhas concentradas em um único número de teste (`5511932903005`), então isso
prova o formato do n8n atual, não resiste a mudança de gateway. A normalização deve existir mesmo assim.

### (c) Como `restaurante_id` se propaga? Bem, com um buraco.

`restaurante_id bigint` existe em `feedbacks_originais`, `feedbacks_restaurante`, `insights`, `acoes_operacionais`
(e em qr_codes, notificacoes, etc.). **RLS está ativo em todas as 39 tabelas** (`list_tables`).

Padrão das policies (consulta `pg_policies`) — 4 policies por tabela, todas idênticas:
```sql
USING (restaurante_id = get_user_restaurante_id())
WITH CHECK (restaurante_id = get_user_restaurante_id())
```
`get_user_restaurante_id()` é SECURITY DEFINER: `SELECT id FROM restaurantes WHERE auth_user_id = auth.uid() LIMIT 1`.
`restaurantes` usa `auth_user_id = auth.uid()` direto, mais duas policies de platform admin.

**Buraco:** `restaurante_id` é **nullable** em `feedbacks_originais`, `feedbacks_restaurante`, `insights` e
`acoes_operacionais`. Linha com `restaurante_id NULL` é invisível para todo mundo via RLS (NULL = NULL é NULL) —
não vaza, mas some. Já é assim hoje; não é regressão da feature.

### (d) Transições de status — update direto, sem histórico, e com DOIS disparos

- **Update direto**, o status anterior é perdido: `src/lib/queries/acoes.ts:55-65`
  ```ts
  .from('acoes_operacionais').update({ status: novoStatus }).eq('id', acaoId)
  ```
- **Não existe histórico nem audit log de status.** O único log é `ia_log_alteracoes` (0 linhas), e ele só
  registra alterações feitas pelo agente de IA (`src/lib/queries/agente-ia.ts:137,284,313`), não moves humanos.
- **Existem 2 triggers em `acoes_operacionais`** (consulta `pg_trigger`):
  1. `trg_acoes_operacionais_sugestoes` — `AFTER DELETE OR UPDATE`, chama `trg_check_sugestoes_acoes()`, que dispara
     `sugerir-acoes` quando a fila de SUGERIDA zera (`20260812030000_trigger_sugerir_acoes_por_restaurante.sql:11-71`).
     Nada a ver com mensagem.
  2. **`Status_feedback`** — ver §1.3. É o disparo que estamos substituindo. **Não está em nenhuma migration.**
- **Regressão é permitida:** `EM_ANDAMENTO → PENDENTE` por drag (`src/components/actions/TaskBoard.tsx:341-348`) e
  `CONCLUIDO → *` pelo botão "Desfazer" (`TaskBoard.tsx:422-425`).
- **Status além dos três:** sim, **`SUGERIDA`** (ação proposta pela IA, ainda não aprovada). Ela nunca deve gerar
  aviso ao cliente. Além disso `arquivada_em` (arquivar não muda status) e exclusão hard (`excluirAcao`,
  `acoes.ts:105`; `rejeitarSugestao`, `acoes.ts:98`).

---

## 1.3 Fluxo de mensagens ponta a ponta

### Ack (resposta imediata ao feedback) — **existe, vive 100% no n8n** ✅ VERIFICADO

Atualizado em 2026-08-24 com o export do workflow **`Feedback Restaurante Uazapi`** (id `l5wVrOVCkmjbQfJn`,
`active: true`). Nada deste repositório responde ao cliente — confirmado. Todo o ack é n8n.

**Caminho completo da entrada:**

```
Webhook POST /webhook/easyfeed
  → TIPO DE EVENTO        (body.EventType == 'messages')
  → Mensagem de grupo?    (descarta isGroup)
  → Foi enviada pelo proprio numero? (descarta fromMe)
  → Verifica Restaurante  (Supabase: restaurantes WHERE numero_whatsapp = body.chat.owner)
  → Onboarding completo?  → É pagante? (assinatura_status == 'ativa')
  → Verificar tipo de mensagem  ─┬─ audio → baixa_audio → Extract → Convert → OpenAI (transcribe) → Variaveis Audio
                                 └─ texto → Variaveis Texto
  → Merge → Gravar Buffer → Ler Buffer → Ordenar Mensagens → Switch (debounce)
  → Limpar Buffer → Formatar Texto
  → AI Agent1 (sentimento geral) → If (Sem_Avaliacao? descarta)
  → Informações Feedback1  (INSERT feedbacks_originais)
  → Basic LLM Chain        (fatia em pontos)
  → Trata as mensagens     (Code: normaliza JSON + SORTEIA a resposta ao cliente)
      ├─ If1 → Informações Feedback (INSERT feedbacks_restaurante, com origem_id)
      └─ If2 → HTTP Request (POST {Url Instancia}/send/text)   ← O ACK
```

**O texto do ack é FIXO, não é LLM.** Nó `Trata as mensagens` (Code) tem um dicionário de 12 frases prontas em
4 cenários (`positivo`, `negativo`, `misto`, `neutro`), escolhido pelos sentimentos dos pontos, e sorteado com
`Math.floor(Math.random() * opcoes.length)`. O LLM do fluxo é usado para *classificar*, nunca para redigir o ack.
(O nó `AI Agent` que redigia resposta por LLM existe mas está `disabled`, junto com `HTTP Request2`.)

**Ele normaliza o telefone:** `body.message.chatid.split('@')[0]` (nós `Variaveis Texto` e `Variaveis Audio`,
campo `Telefone Cliente`). É a origem dos 13 dígitos limpos que medi no banco. Sem `+`, sem sufixo `@s.whatsapp.net`.

**Ele NÃO resolve contato** — não existe entidade de contato; o telefone é gravado como texto em
`feedbacks_originais.telefone_cliente` e `feedbacks_restaurante.telefone_cliente`.

**Ordem de gravação (importa para o plano):** `feedbacks_originais` é inserido **antes** do fatiamento
(`Informações Feedback1`), e só depois os pontos entram em `feedbacks_restaurante` com
`origem_id = $('Informações Feedback1').item.json.id`. Logo, qualquer resolução de contato precisa acontecer
**antes** do insert de `feedbacks_originais`.

**Confirmação de I7:** o ack não lê nem escreve nada de fila/cooldown. Canal genuinamente separado. A feature
não o afeta.

### ⚠️ Correção à auditoria: `message_buffer` está VIVO e é infra ativa

Eu havia reportado `message_buffer` como legado com 0 linhas e nenhum leitor. **Errado.** Ele é o **debounce de
rajada** do n8n:

`Gravar Buffer` (INSERT) → `Ler Buffer` (SELECT por `remote_id`) → `Ordenar Mensagens` → `Switch`:
- saída 1 "Nada a fazer - Duplicidade" — outra execução assumiu o lote;
- saída 2 "Continua - Buffer Venceu" — `created_at < now - 20s` → segue;
- fallback "Aguardar" → `Wait 5s` → volta a ler.

Depois `Limpar Buffer` (DELETE por `remote_id`) e `Formatar Texto` junta tudo com `\n`.
Tem 0 linhas **porque se apaga ao final de cada rajada**, não por estar morto.

Duas consequências:
1. `CLAUDE.md` e `AGENTS.md` dizem "`message_buffer` — NÃO tocar (legado)". A instrução de não tocar está certa;
   a justificativa está errada e é perigosa — alguém poderia dropar a tabela achando que é lixo. Corrigir.
2. **Já existe um T_AGG neste projeto**, de 20s, na entrada. O T_AGG de 30 min do SPEC é a mesma ideia aplicada
   na saída. Há precedente.

### Bugs encontrados no workflow (fora do escopo da feature, mas são de produção)

1. **Token da uazapi hardcoded em 2 nós.** `baixa_audio` e `HTTP Request` (o ack) usam
   `token: 469bb609-3ad1-4b77-b94d-c3e1b45025f1` fixo, embora `Variaveis Texto`/`Variaveis Audio` já exponham
   `Token` = `body.token` e o `Merge` o carregue. Corrigir para `{{ $('Merge').item.json.Token }}`.

   > **Verificado em 2026-08-24.** Levantou-se a hipótese de que esse token seria universal da conta uazapi.
   > **Não é.** Consulta em `public.restaurantes`:
   >
   > | id | restaurante | `whatsapp_token` | assinatura | é o hardcoded? |
   > |---|---|---|---|---|
   > | 11 | Camelo | `469bb609…` | ativa | **sim** |
   > | 12 | Ao Ponto | `null` | sem_assinatura | — |
   > | 13 | Meu Restaurante | `138e7e7e…` | ativa | **não** |
   > | 14 | Meu Restaurante | `null` | ativa | — |
   >
   > Dois restaurantes ativos com token conectado, **dois tokens distintos**. O `469bb609…` é a instância do
   > restaurante 11 (Camelo), onde estão 43 dos 63 feedbacks — é o ambiente de teste.
   >
   > O que é universal é `whatsapp_admin_token` = `YO3H6W6P…`, idêntico nos 4 — e ele usa header
   > **`admintoken:`**, não `token:` (ver `whatsapp-instancia/index.ts:119` vs `:138`). São credenciais de
   > escopos diferentes: admin cria/destrói instâncias; o token de instância envia mensagem por um número.
   >
   > `whatsapp-instancia/index.ts:119-127` confirma o desenho: `POST /instance/create` por restaurante, com
   > `adminField01 = String(rest.id)`. Uma instância por restaurante, um token por instância.
   >
   > **Impacto atual em produção:** feedback recebido pelo restaurante 13 gera ack enviado pela instância do
   > restaurante 11. O cliente recebe agradecimento partindo do número errado.
   >
   > **Não afeta o motor:** o fluxo novo lê `restaurantes.whatsapp_token` por restaurante e nasce correto.
2. **`sentimento` gravado duas vezes** em `Informações Feedback1`: `{{ $json.Sentimento }}` (campo inexistente,
   maiúsculo) e `{{ $json.output }}`. O segundo prevalece — funciona por acidente. Remover o primeiro.
3. **`text` do ack concatena duas coisas**: `{{resposta_cliente}}{{feedback_original}}` no `HTTP Request`. Como
   o item que carrega `resposta_cliente` é o último do array (e não tem `feedback_original`), na prática
   resolve para vazio. Frágil.
4. **Restaurante não-pagante morre em silêncio:** `É pagante?` (falso) → `AI Agent` → `HTTP Request2`, ambos
   `disabled`. O cliente manda feedback e não recebe nada, sem log.
5. **`remote_id` é `"remote_id" + telefone`**, sem `restaurante_id`. Se a mesma pessoa mandar feedback para dois
   restaurantes na mesma janela de 20s, os buffers colidem e as mensagens se misturam. Cenário raro, mas é a
   mesma classe de erro que a chave `(restaurante_id, telefone)` do motor previne.

**Ainda NÃO VERIFICADO:** o workflow que consome `status_açoes` / `mensagem_follow_up_feedback`. Este export é
só o fluxo de **entrada**; nada nele referencia esses endpoints. Preciso do export do outro workflow.

### Retorno por mudança de status — **existem DOIS disparos, e o segundo você provavelmente não sabe que existe**

**Disparo 1 — frontend, fire-and-forget** — `src/components/actions/TaskBoard.tsx:363-376`:
```ts
if (taskDetails) {
  supabase.functions.invoke('webhook-n8n', {
    body: { task_id: taskId, title: taskDetails.titulo_acao, status: newStatus,
            priority: taskDetails.prioridade, source: taskDetails.categoria,
            restaurante_id: usuario?.restaurante_id },
  }).catch(console.error)
}
```
Roda em toda transição bem-sucedida (drag, botão "Iniciar/Concluir", e botão "Desfazer"). O `.catch(console.error)`
engole falha em silêncio. O payload **não tem telefone nem feedback_id**.
`webhook-n8n` (`supabase/functions/webhook-n8n/index.ts:15-32`) é um proxy cego: lê o secret
`mensagem_follow_up_feedback` e repassa o body literal. Não valida JWT, CORS `*`, não checa `response.ok`,
devolve `success: true` mesmo em HTTP 500 do n8n.

**Disparo 2 — trigger no banco, NÃO versionado** (descoberto em `pg_get_triggerdef`):
```sql
CREATE TRIGGER "Status_feedback" AFTER UPDATE ON public.acoes_operacionais
FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
  'https://n8n-n8n-main.tikvpg.easypanel.host/webhook-test/status_açoes',
  'POST', '{"Content-type":"application/json"}', '{}', '5000')
```
Consequências concretas:
- Dispara em **todo UPDATE**, não só de status. Reordenar o board (`atualizarOrdemAcoes`, `acoes.ts:42` — N UPDATEs
  em paralelo), fixar, arquivar, editar responsável/prazo: **tudo** manda POST para o n8n.
- Manda o row inteiro (`old_record`/`record` do webhook do Supabase), então **aí sim** o n8n tem `restaurante_id`
  e `insight_id` para resolver telefone.
- URL é `/webhook-test/` — endpoint de teste do n8n, que no n8n só fica ativo enquanto alguém clica "Listen".
- **Portanto o mesmo evento de status dispara o n8n por dois caminhos diferentes.** Um par drag+desfazer manda 4+ POSTs.

**Como decide para quem enviar:** o repo não decide. Quem resolve destinatário é o n8n. **NÃO VERIFICADO** como.

**Proteção contra duplicata / rate limit / registro do que foi enviado hoje:** **nenhuma, em nenhum dos dois caminhos.**
Busquei `idempot|dedup|rate.?limit|debounce|advisory_lock|pg_try_advisory|retry|lock` — só há `ON CONFLICT DO NOTHING`
em migrations (idempotência de migration, não de runtime).

### Outros envios
- **Push web (`enviar-push`)**: VAPID via `npm:web-push`, **só para admins da plataforma**
  (`admin_push_subscriptions`, `20260808000000_push_notifications.sql:36-39`), sobre threads de suporte. Nunca
  para o cliente final. Autorizado por `x-trigger-secret` (`enviar-push/index.ts:72-75`).
- **`notificacoes`** (0 linhas): notificação in-app para o dono, sem produtor ativo.
- **`preferencias_notificacao`** (`20260328135023:65-75`, com `canal_whatsapp`): **tabela morta**, sem UI e sem
  código. Nem está no `types.ts`.
- Digest / relatório por WhatsApp para o dono: **não existe**.

### Provedor de WhatsApp
**uazapi** (não é Meta Cloud API direto, não é Twilio). O repo só usa a API de **ciclo de vida de instância** —
`supabase/functions/whatsapp-instancia/index.ts`: `POST /instance/create` (:119), `GET /instance/status` (:149),
`POST /instance/connect` (:174), `POST /instance/reset` (:214), `DELETE /instance` (:200).
No create manda `adminField01 = String(rest.id)` (`:122-127`) — é como o n8n roteia a mensagem recebida para o
restaurante certo.

Consequência direta e importante para o SPEC (Parte F): **uazapi é WhatsApp não-oficial (sessão de WhatsApp Web
via QR code), não é a Cloud API da Meta.** Logo:
- **Não existe janela de 24h nem template aprovado pela Meta neste projeto.** A restrição da Parte F do SPEC
  **não se aplica** ao provedor atual. O texto pode ser 100% gerado por LLM, estrutura livre.
- Em troca, o risco vira **banimento do número** por spam — que é exatamente a dor que motivou a feature. O
  cooldown deixa de ser burocracia de compliance e passa a ser a própria proteção do ativo.
- **Não há templates aprovados existentes** para inventariar.

**Endpoint de envio — ✅ VERIFICADO** (nó `HTTP Request` do workflow de entrada):
```
POST {BaseUrl}/send/text
headers: { "token": "<token da instância>" }
body:    { "number": "<13 dígitos, sem + e sem @>", "text": "<texto>" }
timeout: 5000 ms
```
`BaseUrl` vem do próprio webhook da uazapi (`body.BaseUrl`); no nó desativado `HTTP Request2` aparece o valor
literal `https://iamai-ia.uazapi.com`, coerente com o `systemName: 'iamai-ia'` usado em
`whatsapp-instancia/index.ts:124`.

Para o motor, `BaseUrl` e token virão de `restaurantes.whatsapp_base_url` / `restaurantes.whatsapp_token`, já que
o disparo não nasce de um webhook da uazapi e não há `body.BaseUrl` disponível.

**Rate limit do gateway:** **NÃO VERIFICADO** — não há nada sobre isso no workflow. Vale perguntar à uazapi.

**Logs de envio e de erro:** não existem no Supabase; ficam nas execuções do n8n. O ack não checa o resultado do
`POST /send/text` — não há nó de erro depois dele, então falha de envio some.

---

## 1.4 Infraestrutura

| Item | Situação | Evidência |
|---|---|---|
| `pg_cron` | **habilitado, 1.6.4**, 4 jobs ativos | `list_extensions`, `cron.job` |
| `pg_net` | **habilitado, 0.19.5** (schema `public`) | `list_extensions` |
| `pgmq` / Supabase Queues | **disponível mas NÃO instalado** | `list_extensions` |
| `http` (síncrono) | não instalado | `list_extensions` |
| `supabase_functions.http_request` | em uso (webhook nativo) | trigger `Status_feedback` |

### Jobs recorrentes hoje (consulta `cron.job`)
| jobid | nome | schedule | o que faz |
|---|---|---|---|
| 1 | `atualizar_banner_diario` | `0 7 * * *` | `net.http_post` → `/functions/v1/atualizar-banner` |
| 2 | `gerar-insights-horario` | `0 * * * *` | `net.http_post` → `/functions/v1/gerar-insights`, header `x-cron-secret` |
| 4 | `limpar-contas-abandonadas` | `20 4 * * *` | `select public.limpar_contas_abandonadas()` |
| 5 | `expirar-assinaturas` | `10 0 * * *` | `net.http_post` → `/functions/v1/expirar-assinaturas` |

**O padrão do projeto já está estabelecido e funciona:** `pg_cron` chama Edge Function via `pg_net`, com
`x-cron-secret` no header. Há um exemplo direto de "worker recorrente que varre todos os restaurantes":
`gerar-insights/index.ts:277-292`.

### Edge Functions — como são deployadas
**NÃO VERIFICADO.** Não há `supabase/config.toml`, não há workflow de CI (`.github/` ausente), não há script de
deploy no `package.json` (só `deploy` = `gh-pages`, que é o front). Deploy provavelmente manual por
`supabase functions deploy`. **Preciso de você:** confirmar como você publica as functions hoje.

### n8n — nós de Schedule/Wait, confiabilidade
**NÃO VERIFICADO** (repo não tem os workflows). O que dá para afirmar do lado de cá: a URL usada é
`/webhook-test/`, que é o endpoint efêmero de teste do n8n. Se for isso mesmo em produção, o disparo atual é
**não confiável por construção**.

### Lock / idempotência / retry
**Nenhum padrão existe no projeto.** O mais próximo:
- `20260810000000_unique_numero_whatsapp.sql` — unique parcial em `restaurantes.numero_whatsapp`.
- `origem_id` (`20260812020000`) — uuid por mensagem, agrupa os pontos fatiados. Serve de chave natural.
- A trava lógica em `sugerir-acoes/index.ts:58-68` ("não gera se já há SUGERIDA pendente") — trava de negócio, não lock.

### Observabilidade
Logs de Edge Function no dashboard Supabase. **Sem alertas, sem DLQ, sem tabela de erro.** Falha do
`webhook-n8n` some no `.catch(console.error)` do browser (`TaskBoard.tsx:375`).

### 🔑 Pergunta de decisão: qual o mecanismo mais confiável NESTE projeto para "acordar daqui a X horas"?

**Recomendação: `pg_cron` a cada 5 minutos → `pg_net` → Edge Function worker, com o estado do relógio no banco.**

Por quê, com base no que vi:
1. **É o único mecanismo com histórico de funcionar aqui.** 4 jobs em produção, todos no mesmo formato
   (`cron.job` 1, 2, 4, 5), incluindo um que varre todos os restaurantes por hora (`gerar-insights`).
2. **Descarto `pgmq`**: não está instalado, ninguém no projeto conhece, e a fila que precisamos é uma tabela com
   estado consultável (`aviso_pendente`) — não um message broker. Instalar extensão nova para isso é custo sem retorno.
3. **Descarto o Wait node do n8n**: segurar uma execução por até 72h em n8n auto-hospedado (easypanel) é frágil
   (restart do container perde o wait), e o n8n aqui nem está versionado — não conseguiríamos revisar nem testar.
4. **Descarto "wake-up agendado individual"** (um cron por contato, como a Parte C do SPEC sugere): `pg_cron`
   agenda por expressão cron, não por timestamp único; emular isso vira lixo de jobs. **Um tick fixo de 5 min é
   equivalente em comportamento e muito mais simples** — a fórmula de disparo do SPEC (`max(criado_em+T_AGG,
   ultimo_envio_em+T_COOLDOWN)`) é uma consulta, não um agendamento. O tick só pergunta "quem já venceu?".
   Custo: no máximo 5 min de atraso, irrelevante numa janela de 30 min / 72 h.
5. **Lock (I6)**: `pg_advisory_xact_lock(hashtext(...))` por contato, ou `SELECT ... FOR UPDATE SKIP LOCKED` na
   linha de cooldown. Não precisa de extensão nova. Escolha final fica para a Fase 2.

---

## 1.5 Frontend

- **Tela de status das ações:** `/acoes` → `src/pages/Actions.tsx` (shell de 16 linhas) →
  `src/components/actions/TaskBoard.tsx` (kanban dnd-kit) + `TaskCard.tsx` + `DetalhesAcaoPanel.tsx`.
  **Não exibe absolutamente nada sobre mensagens ao cliente** — nem destinatário, nem envio, nem histórico.
  `telefone_cliente` é lido pela view mas **nunca renderizado** (grep em `src/pages` e `src/components`: 0 hits).
- **Mudança de status pela UI:** sim, três caminhos, todos funilando em `doMoveStatusApi`
  (`TaskBoard.tsx:350-381` → `atualizarStatusAcao`, `src/lib/queries/acoes.ts:55`): drag (`:632-634`),
  botão Iniciar/Concluir (`TaskCard.tsx:260-263`), botão Desfazer (`TaskBoard.tsx:422-425`).
- **Controle do dono sobre comunicação:** **nenhum.** `src/pages/Settings.tsx` tem 5 seções (`:213-219`):
  Restaurante, Sobre o restaurante, Base de conhecimento, WhatsApp, Assistente de IA. A aba WhatsApp
  (`src/pages/settings/WhatsAppTab.tsx`) é só plumbing de instância — o próprio texto diz *"Conecte um número
  para começar a receber feedbacks"* (`:208-209`). Zero configuração de notificação/mensagem.
  A config de IA que existe é editada **fora** de Settings: `config_insights.feedbacks_por_analise` fica no
  dialog de engrenagem da página de Insights (`src/pages/Insights.tsx:98-111`, read-merge-write do jsonb).
- **Alguma tela quebraria com envio não-imediato?** **Não.** Como nada na UI menciona mensagem, deixar de enviar
  na hora não torna nenhuma tela mentirosa. O risco é o oposto: hoje o dono **não sabe** que arrastar um card
  manda WhatsApp para o cliente. Vale expor isso na UI junto com a feature.

---

## 1.6 Dívidas e riscos encontrados

Ordenados por impacto nesta feature.

1. **Trigger `Status_feedback` fora do versionamento.** Existe no banco, não existe em migration nenhuma.
   Qualquer plano de corte que só mexa no repo **não desliga o disparo atual**. Além disso ele dispara em todo
   UPDATE (reordenar o board = rajada de POSTs) e aponta para `/webhook-test/`.
2. **Não há vínculo materializado feedback ↔ ação.** A cadeia passa por `insights.feedback_ids`, e apagar o
   insight faz `insight_id = NULL` na ação (`20260813010000:19`), destruindo o vínculo para sempre.
3. **Não há entidade de contato.** Telefone é `text` solto, duplicado em duas tabelas, sem índice, sem unique,
   sem opt-out. (Mitigação: os 63 valores reais já estão em formato uniforme de 13 dígitos.)
4. **Não há histórico de status.** `atualizarStatusAcao` sobrescreve. Sem isso não existe evento confiável de
   transição para ancorar o aviso — e nenhuma forma de auditar o que foi enviado e por quê.
5. **Não há registro de mensagem enviada.** Impossível provar I1/I6 depois do fato.
6. **`webhook-n8n` é um proxy aberto.** Sem JWT, CORS `*` (`webhook-n8n/index.ts:4`), qualquer um com a URL da
   function injeta payload arbitrário no seu n8n. E devolve `success: true` mesmo quando o n8n falha (`:34-37`).
7. **Segredos em texto puro no banco:** JWT anon no corpo de 4 triggers, `CRON_SECRET` no comando do cron job 2.
8. **`whatsapp_admin_token` global replicado em cada linha de `restaurantes`** (`20260812010000_uazapi_tokens_restaurante.sql:19-26`),
   e o dono lê a própria linha via `select('*')` + RLS. Um cliente com esse token manipula instâncias de todos os
   outros restaurantes. Fora do escopo desta feature, mas é o risco mais sério que encontrei no projeto.
9. **`config_restaurantes.id`** — o `CLAUDE.md` ainda cita a tabela em uma linha (seção Regras) embora o próprio
   arquivo diga depois que ela não existe mais. `AGENTS.md` está mais desatualizado ainda (descreve `usuarios` +
   `config_restaurantes` no auth flow). Ruído para quem lê.
10. **`src/lib/supabase/types.ts` está velho:** faltam `acoes_operacionais.fixado`, `insights.fixado`,
    `feedbacks_originais.texto_destacado`. O app já consulta essas colunas (`src/lib/queries/acoes.ts:4`).
11. **Código morto:** `insight_feedbacks` (tabela órfã, 0 refs), `acoes_operacionais.feedback_id` (coluna morta),
    `preferencias_notificacao` (tabela morta com `canal_whatsapp`), `message_buffer` (0 linhas).
12. **Só produção, sem staging, sem testes.** `package.json:22` — `"test": "echo \"there are no tests\""`.
    Testar um motor de 72h sem ambiente separado exige que T_AGG/T_COOLDOWN sejam configuráveis (o SPEC já pede) e
    que exista um modo de "avançar o relógio" — vou propor isso na Fase 2.
13. **`restaurante_id` nullable** nas 4 tabelas centrais. Linha órfã fica invisível no RLS.

---

## Tabela final — entidade por entidade

| Entidade | Onde está | Suporta o que o SPEC pede? | Observação |
|---|---|---|---|
| Feedback (mensagem) | `feedbacks_originais` (uuid), 63 linhas — `20260812030000:10-17` | **Parcial** | Tem texto, telefone, restaurante e data. Falta marcar "já usado" (sua instrução extra) e expiração. |
| Feedback (ponto extraído) | `feedbacks_restaurante` (bigint), 146 linhas | **Parcial** | Ligado por `origem_id`. É aqui que sua coluna de "disponibilidade" deve nascer. |
| Contato / cliente | **não existe** — telefone `text` solto em 2 tabelas | **Não** | Dado real já uniforme (`55DDNNNNNNNNN`, 13 dígitos, 100% dos 63). Precisa de tabela — é a sua instrução extra nº 1. |
| Restaurante / tenant | `restaurantes` (bigint), 4 linhas | **Sim** | `config_insights jsonb` é o padrão pronto para hospedar a config do motor. |
| Insight | `insights` (uuid), 59 linhas, `feedback_ids uuid[]` + GIN | **Parcial** | Vínculo com feedback é array, não FK. Apagar insight não libera feedback (sua instrução extra nº 2). |
| Ação | `acoes_operacionais` (bigint), 17 linhas | **Parcial** | Status tem **4** valores (`SUGERIDA` incluso), não 3. Regressão e undo são permitidos. |
| Status da ação | coluna `status text` + CHECK (`20260418134333:88-91`) | **Sim, para ler** | Sem histórico, sem audit. Transição não é observável a posteriori. |
| Vínculo feedback ↔ ação | **não existe direto** — `acao.insight_id → insights.feedback_ids[]` | **Não** | Não é N:N. `ON DELETE SET NULL` destrói o vínculo. Lacuna crítica. |
| `insight_feedbacks` | tabela órfã no banco, 0 linhas, 0 refs | **Não** | Grão errado (aponta para os pontos, não a mensagem). Candidata a REMOVER. |
| Mensagens enviadas | **não existe** | **Não** | Sem log, sem `mensagem_id`, sem prova de I1/I6. |
| Ack | workflow n8n `Feedback Restaurante Uazapi`, nós `Trata as mensagens` → `If2` → `HTTP Request` | **Sim, intacto** | Texto **fixo**: sorteio entre 12 frases em 4 cenários. Não é LLM. Não toca fila nem cooldown → I7 preservada. |
| Debounce de rajada | `message_buffer` + `Wait 5s` + `Switch` (20s) no n8n | **Sim (precedente do T_AGG)** | **Correção:** não é legado. Tem 0 linhas porque se auto-apaga. `CLAUDE.md` descreve errado. |
| Disparo por status (frontend) | `TaskBoard.tsx:363-376` → `webhook-n8n/index.ts:15-32` | **É o que sai (REMOVER)** | Fire-and-forget, sem telefone no payload, falha silenciosa. |
| Disparo por status (banco) | trigger `Status_feedback` — **só no banco, sem migration** | **É o que sai (REMOVER)** | `AFTER UPDATE` em qualquer coluna → n8n `/webhook-test/status_açoes`. |
| Provedor WhatsApp | uazapi, via `whatsapp-instancia/index.ts:119-214` | **Sim, e melhor que o previsto** | Não é Meta Cloud API → **sem janela de 24h e sem template obrigatório**. Parte F do SPEC não se aplica. |
| Agendamento | `pg_cron` 1.6.4 + `pg_net` 0.19.5, 4 jobs em produção | **Sim** | Mecanismo recomendado. `pgmq` disponível mas não instalado. |
| Lock / idempotência | **não existe** | **Não** | `pg_advisory_xact_lock` disponível sem instalar nada. |
| Config por restaurante | `restaurantes.config_insights jsonb` | **Sim (padrão a reusar)** | Já tem defaults e é editado pela UI (`Insights.tsx:98-111`). |
| Quiet hours / opt-out | **não existem** | **Não** | Zero configuração de comunicação no Settings. |
| Observabilidade | logs de Edge Function apenas | **Não** | Sem alerta, sem DLQ, sem tabela de erro. |
| Telas afetadas | `/acoes` (TaskBoard), `/configuracoes` (Settings), `/feedbacks` | **Nenhuma quebra** | Nada na UI menciona mensagem hoje; o dono não sabe que arrastar um card dispara WhatsApp. |

---

## O que preciso de você para fechar as lacunas

~~1. Export JSON dos workflows n8n~~ — ✅ recebido em 2026-08-24 (workflow de **entrada**). Fechou: ack,
   texto do ack, normalização de telefone, endpoint da uazapi, papel do `message_buffer`.

Ainda em aberto:

1. **Export do OUTRO workflow** — o que consome `status_açoes` e/ou `mensagem_follow_up_feedback`. É o que vamos
   desligar; preciso ver o que mais depende dele antes do corte.
2. **Confirmar:** o trigger `Status_feedback` foi criado por você (Studio/n8n) e pode ser removido?
3. **Confirmar:** a URL `/webhook-test/status_açoes` é a de produção mesmo, ou o fluxo real usa `/webhook/`?
4. **Como você faz deploy das Edge Functions** hoje (CLI manual? outro caminho?).
5. **Existe algum outro projeto/ambiente Supabase** além de `lixrcruilisncfhfhndo`?
6. **Quer que eu corrija os 5 bugs do workflow de entrada** (§1.3) junto com a feature, ou em separado? O do
   token hardcoded quebra multi-tenant hoje.
