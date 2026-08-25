# Motor de Resposta — Classificação e Plano (Fase 2)

Cruza o SPEC com a auditoria ([`01-auditoria.md`](01-auditoria.md)) e as decisões já fechadas
([`00-decisoes.md`](00-decisoes.md)). O lado n8n está em [`03-n8n.md`](03-n8n.md).

Escopo inclui as três instruções extras dadas junto com a tarefa:
- tabela de contatos com id uuid gerado pelo Supabase (E1);
- coluna que marca feedback já usado em insight/ação, liberado quando o insight/ação é excluído (E2);
- expiração de feedback, default 14 dias, configurável pelo dono na interface (E3).

---

## 2.1 Tabela de classificação

| Elemento do SPEC | Classificação | Onde | O que fazer | Esforço |
|---|---|---|---|---|
| **Identidade de contato normalizada** | **CRIAR** | nova `contatos` | `id uuid default gen_random_uuid()`, `restaurante_id bigint`, `telefone text`, unique `(restaurante_id, telefone)`. Trigger `BEFORE INSERT` em `feedbacks_originais` resolve e preenche `contato_id` (D4). Dado real já vem em 13 dígitos limpos. | M |
| **Relação feedback ↔ ação nos dois sentidos** | **CRIAR** | nova `feedback_acao` | Hoje **não existe** — só `acao.insight_id → insights.feedback_ids[]`, que quebra ao apagar o insight. N:N materializado `(feedback_original_id, acao_id)`, populado na criação/aprovação da ação a partir do insight. | G |
| **Registro de transição de status** | **CRIAR** | nova `acao_status_historico` + trigger | `atualizarStatusAcao` sobrescreve (`acoes.ts:55-65`). Trigger `AFTER UPDATE OF status` grava `(acao_id, de, para, em)`. É o evento que ancora o aviso. | M |
| **Gancho que cria o aviso pendente** | **CRIAR** | mesmo trigger acima | Ao entrar em `EM_ANDAMENTO`/`CONCLUIDO`, insere um `aviso_pendente` por contato ligado à ação via `feedback_acao`. `SUGERIDA`/`PENDENTE` não geram aviso. | M |
| **Tabela de fila de avisos** | **CRIAR** | nova `aviso_pendente` | Conforme Parte D do SPEC. Índice **único** `(contato_id, acao_id, etapa)` → garante I4 e I6. | M |
| **Tabela de cooldown** | **CRIAR** | nova `janela_contato` | `(contato_id, restaurante_id, ultimo_envio_em)`. **Sem coluna de etapa** — cooldown único (I1). | P |
| **Tabela de config por restaurante** | **ADAPTAR** | `restaurantes.config_insights` (jsonb) | Não criar tabela nova: reusa o jsonb existente com read-merge-write, igual `Insights.tsx:90-120`. Chaves novas sob `motor_resposta`. | P |
| **Worker de disparo** | **CRIAR** | nova edge fn `motor-retorno-worker` | Modelado em `gerar-insights/index.ts:277-292` (varre restaurantes, `x-cron-secret`). | G |
| **Mecanismo de agendamento** | **MANTER (padrão) + CRIAR (job)** | `pg_cron` + `pg_net` | Extensões já instaladas, 4 jobs em produção. Adicionar 1 job de 5 min (D3). | P |
| **Lock / idempotência** | **CRIAR** | dentro do worker | `pg_advisory_xact_lock(hashtext(contato_id))`. Não precisa extensão. Idempotência real vem do índice único de `aviso_pendente` + `envio_id`. | M |
| **Agrupamento por ação** | **CRIAR** | worker (TS puro) | Passada 1. Ordem cronológica forçada: `em_andamento` antes de `concluida`. | M |
| **Agrupamento por feedback** | **CRIAR** | worker (TS puro) | Passada 2, via `feedback_acao`. | M |
| **Desempate de grupos sobrepostos** | **CRIAR** | worker (TS puro) | Cada ação aparece 1×, ancorada no feedback **mais antigo** do contato que a alimentou. | M |
| **Teto de itens** | **CRIAR** | worker | `max_itens_msg` (default 4) conta **blocos**, não avisos. Excedente → "e mais N pontos". | P |
| **Geração de texto por LLM** | **ADAPTAR** | `_shared/openrouter.ts` | Reusar `chamarIA` + `checarCota` + `paramsDoAgente` + `carregarPrompts`. Agente novo `redator_retorno`, prompt editável em `prompts_editaveis`. | M |
| **Envio via provedor** | **CRIAR** | n8n `easyfeed-enviar-retorno` | `POST {base_url}/send/text`, header `token`, body `{number, text}` — formato confirmado no export. | M |
| **Template Meta** | **REMOVER do escopo** | — | Provedor é **uazapi** (WhatsApp Web via QR), não Meta Cloud API. Sem janela de 24h, sem template. Parte F do SPEC **não se aplica**. | — |
| **Quiet hours** | **CRIAR** | config + worker | Default 22h–9h. Adia, não cancela. ⚠️ Timezone — ver Conflito C3. | M |
| **Expiração de aviso** | **CRIAR** | `aviso_pendente.expira_em` | Default 14 dias. Aviso vencido não é enviado. Distinto de E3 (expiração de *feedback*). | P |
| **Cancelamento em cascata (regressão)** | **CRIAR** | trigger de status | `EM_ANDAMENTO→PENDENTE`, `CONCLUIDO→*`, DELETE da ação → avisos `na_fila` daquela ação viram `cancelado`. Outras ações do mesmo bloco seguem. | M |
| **Opt-out** | **CRIAR** | `contatos.opt_out_em` | Cancela a fila inteira do contato. Sem UI nesta fase — ver Pergunta Q3. | P |
| **Registro de mensagem enviada** | **CRIAR** | nova `mensagem_enviada` | `envio_id uuid`, texto, status (`enviando`/`enviado`/`falhou`), erro, `provider_message_id`. É a prova de I1/I6. | M |
| **Ack** | **MANTER — intacto** | n8n `Feedback Restaurante Uazapi` | ✅ Verificado no export: não lê nem escreve fila/cooldown. Com D4 (contato por trigger), **nenhum nó muda**. I7 garantida por construção. | — |
| **Disparo atual por status** | **REMOVER (dois)** | `TaskBoard.tsx:363-376` **e** trigger `Status_feedback` | O trigger **não está em migration** — existe só no banco, `AFTER UPDATE` em qualquer coluna. Ver plano de corte. | M |
| **Telas do frontend** | **ADAPTAR** | `/admin`, `/configuracoes`, `/acoes` | Admin: config do motor (D7). Configurações: expiração de feedback (E3/D8). Ações: mostrar que há retorno na fila. | G |
| **Observabilidade e logs** | **CRIAR** | `mensagem_enviada` + `motor_erro` | Hoje falha some no `.catch(console.error)` (`TaskBoard.tsx:375`). | M |
| **E1 — tabela de clientes (uuid)** | **CRIAR** | `contatos` | Sua instrução extra. Atendida pela mesma tabela da 1ª linha: `id uuid` do Supabase + coluna de texto (`telefone`). Ver nota E1. | — |
| **E2 — feedback já usado** | **CRIAR** | `feedbacks_restaurante.usado_em` + `usado_por_*` | Impede insight/ação repetidos. Liberado ao excluir insight/ação. Ver §2.2-E2. | G |
| **E3 — expiração de feedback** | **CRIAR** | config + filtro em `gerar-insights` | Default 14 dias, editável pelo **dono** em `/configuracoes` (D8). | M |

### Nota sobre E1 — sua instrução literal vs. o que proponho

Você pediu: *"tabela onde a primeira coluna é um id aleatório do próprio Supabase, e a segunda coluna é de texto,
para salvar os clientes dos restaurantes que mandam mensagem pro Easyfeed."*

Proponho exatamente isso, com duas colunas a mais que o motor exige:

```sql
id           uuid  default gen_random_uuid()   -- "id aleatório do próprio Supabase"  ✅
telefone     text                              -- "coluna de texto"                    ✅
restaurante_id bigint                          -- necessário: o mesmo telefone aparece em 2 restaurantes
opt_out_em   timestamptz                       -- necessário: Parte E do SPEC
```

`restaurante_id` não é enfeite: medi no banco que `5511987650003` existe nos restaurantes 11 **e** 12. Sem ele,
a fila de um restaurante vazaria para o outro e o RLS não teria em que se apoiar.

---

## 2.2 Além da tabela

### Migrations, em ordem

**M1 — `contatos` + resolução automática**

```sql
create table public.contatos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  telefone       text   not null,
  nome           text,
  opt_out_em     timestamptz,
  created_at     timestamptz not null default now(),
  constraint contatos_telefone_digitos check (telefone ~ '^[0-9]{10,15}$')
);
create unique index contatos_restaurante_telefone on public.contatos (restaurante_id, telefone);

alter table public.feedbacks_originais add column contato_id uuid references public.contatos(id) on delete set null;
create index idx_feedbacks_originais_contato on public.feedbacks_originais (contato_id);

-- Normaliza como o n8n já faz (chatid.split('@')[0]) e um pouco mais.
create or replace function public.normalizar_telefone(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(split_part(coalesce(p,''), '@', 1), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.resolver_contato_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tel text; v_id uuid;
begin
  if new.contato_id is not null then return new; end if;
  v_tel := public.normalizar_telefone(new.telefone_cliente);
  if v_tel is null or new.restaurante_id is null then return new; end if;

  insert into public.contatos (restaurante_id, telefone)
  values (new.restaurante_id, v_tel)
  on conflict (restaurante_id, telefone) do update set telefone = excluded.telefone
  returning id into v_id;

  new.contato_id := v_id;
  new.telefone_cliente := v_tel;   -- normaliza também na origem
  return new;
end; $$;

create trigger trg_feedbacks_originais_contato
  before insert on public.feedbacks_originais
  for each row execute function public.resolver_contato_feedback();
```

RLS: 4 policies `restaurante_id = get_user_restaurante_id()`, idênticas ao padrão das outras tabelas.
Backfill: `insert ... select distinct` sobre as 63 linhas existentes, depois `update` do `contato_id`.

**M2 — vínculo N:N feedback ↔ ação**

```sql
create table public.feedback_acao (
  feedback_original_id uuid   not null references public.feedbacks_originais(id) on delete cascade,
  acao_id              bigint not null references public.acoes_operacionais(id) on delete cascade,
  restaurante_id       bigint not null references public.restaurantes(id) on delete cascade,
  created_at           timestamptz not null default now(),
  primary key (feedback_original_id, acao_id)
);
create index idx_feedback_acao_acao on public.feedback_acao (acao_id);
```

Note o `on delete cascade` nos dois lados — ao contrário do `set null` de `insight_id`, que é o que hoje
destrói o vínculo. Populado: (a) `sugerir-acoes` ao inserir a ação, copiando `insights.feedback_ids`;
(b) trigger de fallback ao aprovar sugestão; (c) backfill das 17 ações existentes.

**M3 — histórico de status + gancho do aviso**

```sql
create table public.acao_status_historico (
  id             bigint generated always as identity primary key,
  acao_id        bigint not null references public.acoes_operacionais(id) on delete cascade,
  restaurante_id bigint not null,
  status_de      text,
  status_para    text not null,
  criado_em      timestamptz not null default now()
);
```
Trigger `AFTER UPDATE OF status ON acoes_operacionais`, `WHEN (old.status is distinct from new.status)`:
grava o histórico; se `new.status in ('EM_ANDAMENTO','CONCLUIDO')` insere os avisos; se for regressão
(`PENDENTE`, ou saída de `CONCLUIDO`) cancela os `na_fila` daquela ação.

**M4 — fila, cooldown, log**

```sql
create type public.aviso_etapa  as enum ('em_andamento','concluida');
create type public.aviso_status as enum ('na_fila','enviado','cancelado','expirado');

create table public.aviso_pendente (
  id             uuid primary key default gen_random_uuid(),
  contato_id     uuid   not null references public.contatos(id) on delete cascade,
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  acao_id        bigint not null references public.acoes_operacionais(id) on delete cascade,
  etapa          public.aviso_etapa  not null,
  status         public.aviso_status not null default 'na_fila',
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null,
  mensagem_id    uuid
);
-- I4 + I6: N feedbacks na mesma ação = 1 linha; reprocessar não duplica.
create unique index aviso_pendente_unico on public.aviso_pendente (contato_id, acao_id, etapa);
create index aviso_pendente_fila on public.aviso_pendente (restaurante_id, contato_id)
  where status = 'na_fila';

create table public.janela_contato (
  contato_id      uuid primary key references public.contatos(id) on delete cascade,
  restaurante_id  bigint not null references public.restaurantes(id) on delete cascade,
  ultimo_envio_em timestamptz
);  -- SEM coluna de etapa. Cooldown único (I1).

create table public.mensagem_enviada (
  id                  uuid primary key default gen_random_uuid(),
  contato_id          uuid   not null references public.contatos(id) on delete cascade,
  restaurante_id      bigint not null references public.restaurantes(id) on delete cascade,
  texto               text   not null,
  status              text   not null default 'enviando',
  provider_message_id text,
  erro_codigo         text,
  erro_mensagem       text,
  criado_em           timestamptz not null default now(),
  enviado_em          timestamptz
);
```

**M5 — config do motor + expiração de feedback (E3)**

Sem tabela nova. Merge no jsonb existente:

```sql
update public.restaurantes
set config_insights = coalesce(config_insights,'{}'::jsonb) || jsonb_build_object(
  'motor_resposta', jsonb_build_object(
    'ativo', false,               -- nasce desligado; liga por restaurante
    'cooldown_dias', 3,           -- as 72h do SPEC, em dias (D7)
    'agregacao_min', 30,
    'max_itens_msg', 4,
    'quiet_inicio', 22,
    'quiet_fim', 9,
    'expira_aviso_dias', 14
  ),
  'expiracao_feedback_dias', 14   -- E3: editável pelo dono
);
```
CHECK aplicado no worker e na UI: `cooldown_dias >= 0` no banco, `min=1` no input (D7).

**M6 — E2: feedback disponível / usado**

```sql
alter table public.feedbacks_restaurante
  add column usado_em             timestamptz,
  add column usado_por_insight_id uuid   references public.insights(id)            on delete set null,
  add column usado_por_acao_id    bigint references public.acoes_operacionais(id)  on delete set null;

create index idx_feedbacks_disponiveis on public.feedbacks_restaurante (restaurante_id, created_at)
  where usado_em is null;
```

Marcado quando entra num insight ou ação. **Liberado automaticamente** por triggers
`AFTER DELETE ON insights` e `AFTER DELETE ON acoes_operacionais`, que fazem
`update ... set usado_em = null, usado_por_* = null`. Como as FKs são `on delete set null`, uma linha com
`usado_em not null` mas ambos os `usado_por_*` nulos seria inconsistente — a trigger evita isso.

**M7 — corte dos disparos antigos** (ver plano de corte). `drop trigger "Status_feedback"`.

### Divisão de responsabilidade

| Onde | O quê | Por quê |
|---|---|---|
| **Postgres (triggers)** | resolver contato, gravar histórico, criar/cancelar aviso, liberar feedback | São reações a mudança de linha. No banco são atômicas com a própria transação — o aviso não pode existir sem a transição. |
| **Postgres (`pg_cron`)** | tick de 5 min | Único mecanismo com histórico de funcionar aqui (4 jobs). |
| **Edge Function worker** | fórmula de disparo, lock, agrupamento, LLM, POST ao n8n | Lógica que precisa ser lida, revisada e testada. TS versionado. |
| **Edge Function callback** | confirmar envio, avançar cooldown | Ponto único que move `ultimo_envio_em` — auditável. |
| **n8n** | só chamar a uazapi | D1. |
| **Frontend** | config admin, expiração do dono, visibilidade da fila | — |

### Plano de corte

Ordem obrigatória. Inverter 3↔4 duplica mensagem; inverter 2↔3 abre silêncio.

1. **M1–M6 aplicadas**, `motor_resposta.ativo = false` em todos. Nada muda no comportamento.
2. **Worker em dry-run**: calcula, agrupa, grava `mensagem_enviada` com status `simulado`, **não** chama o n8n.
   Rodar alguns dias no restaurante 11 e conferir fila e agrupamentos contra a realidade.
3. **Corte, na mesma janela**: `drop trigger "Status_feedback"` (M7) + remover `TaskBoard.tsx:363-376`
   + você desativa o workflow que escutava. Aqui existe um vão de minutos em que ninguém recebe nada — aceitável,
   e preferível ao inverso.
4. **Liga o motor**: `ativo = true`, começando pelo restaurante 11.

Rollback: `ativo = false` desliga o motor sem migration. O trigger antigo, uma vez removido, volta por SQL se
necessário — guardo o `CREATE TRIGGER` original no doc.

### Backfill

**Contexto que simplifica tudo (D10): a base atual é só de teste.** 63 feedbacks, 11 contatos, nenhum cliente
real. Não há ninguém para incomodar nem para proteger.

- **`contatos`**: sim, mas como **dado histórico** — só para o `contato_id` de feedbacks antigos não ficar nulo.
  Não é base de envio.
- **`feedback_acao`**: sim, para as 17 ações existentes (`insight_id → feedback_ids`). Mantém consistência e
  serve para validar o passo 2 com dado real.
- **`janela_contato`**: **sem backfill.** A linha nasce no primeiro envio de cada contato. Sem cliente real, não
  há o que represar.
- **Avisos retroativos para ações já em `EM_ANDAMENTO`/`CONCLUIDO`: NÃO.** Agora por dois motivos: (a) sua
  posição original, com a qual concordo — "começamos a agir" semanas depois é pior que silêncio; (b) D10 — não
  há cliente real para receber. O motor só olha transições posteriores ao go-live.

### Conflitos entre o SPEC e a realidade

**C1 — Parte F (template Meta) não se aplica.** Provedor é uazapi, não Meta Cloud API. Sem janela de 24h, sem
template, texto livre. **Proposta:** ignorar a Parte F; o LLM monta a mensagem inteira. Mas o risco que a Parte F
tentava cobrir vira **banimento do número** — o cooldown deixa de ser compliance e passa a ser proteção do ativo.

**C2 — O SPEC prevê 3 status; existem 4.** `SUGERIDA` é ação da IA não aprovada. **Proposta:** só
`EM_ANDAMENTO` e `CONCLUIDO` geram aviso. `SUGERIDA→PENDENTE` (aprovação) não avisa ninguém — o cliente não
deve saber que existiu uma sugestão.

**C3 — Quiet hours sem timezone.** Não há coluna de fuso em `restaurantes`; o banco é UTC. Aplicar 22h–9h em UTC
silencia 19h–6h em Brasília — justamente o horário de pico de um restaurante. **Proposta:** assumir
`America/Sao_Paulo` fixo agora (todos os 4 restaurantes são BR), e deixar `timezone` como coluna futura. Alternativa
em Q2.

**C4 — "wake-up agendado" da Parte C.** `pg_cron` agenda por expressão cron, não por timestamp. **Proposta:**
tick fixo de 5 min (D3). Comportamento equivalente, até 5 min de atraso.

**C5 — O SPEC assume que o feedback chega junto do aviso.** Na prática o texto do feedback vem de
`feedbacks_originais.texto_original` via `feedback_acao`. Se o feedback for apagado, o bloco fica sem citação.
**Proposta:** `on delete cascade` em `feedback_acao` e o worker ignora bloco sem feedback vivo.

**C6 — E2 vs. o comportamento atual de `gerar-insights`.** Hoje a função busca feedbacks por janela de tempo
(`created_at >= ultima_analise`, `gerar-insights/index.ts:89-91`) e **reprocessa livremente**. Com E2, o filtro
passa a ser `usado_em is null`. Isso muda o comportamento: um feedback que já virou insight nunca mais entra em
outro. **É o que você pediu**, mas vale saber que insights de tendência ("isso continua acontecendo") ficam mais
difíceis. **Proposta:** aplicar E2 como pedido e observar; se a qualidade cair, reavaliar.

### Riscos, por gravidade

1. **Duplicação no corte.** Se o trigger antigo sobreviver ao go-live, o cliente recebe 2 mensagens. Mitigação:
   ordem do plano de corte + verificar `pg_trigger` depois de aplicar.
2. **Mensagem errada para a pessoa errada.** `contatos` é a chave de tudo. Telefone mal normalizado = mensagem
   para outra pessoa. Mitigação: CHECK de formato, unique `(restaurante_id, telefone)`, normalização também na
   trigger.
3. **Sem staging.** Tudo em produção. Mitigação: `ativo` por restaurante, dry-run, restaurante 11 como cobaia.
4. **LLM inventando fato.** O texto vai ao cliente sem revisão humana. Mitigação: prompt restritivo, citação
   copiada literal do feedback (não parafraseada pelo modelo), `max_tokens` baixo.
5. **Cota de IA estourada** (`ErroCota`, `openrouter.ts`) deixa a fila parada. Mitigação: worker trata como
   adiamento, não como falha; avisos ficam `na_fila`.
6. **Timezone** (C3): quiet hours no horário errado.
7. **E2 empobrecer insights** (C6).
8. **Volume**: 5 min × N restaurantes. Hoje 4, irrelevante. Vira problema em escala — o índice parcial
   `aviso_pendente_fila` já prepara.

### Perguntas — todas respondidas em 2026-08-24 ✅

**Q1 — clientes antigos.** Resposta: a base atual é **só de teste**, não há cliente real. Nenhum envio
retroativo. O backfill de `contatos` vira dado histórico; `janela_contato` não precisa de backfill defensivo.
Registrado em D10. *(Isso reforça a decisão de não fazer avisos retroativos — agora por dois motivos.)*

**Q2 — timezone.** `America/Sao_Paulo` fixo (D11). Conversão de UTC é obrigatória — sem ela o silêncio cairia no
horário de pico.

**Q3 — opt-out.** Coluna agora, marcação manual por SQL (D12). Não mexe no n8n de entrada.

**Q4 — selo na UI.** Sim, mostrar (D13). Entra no passo 4.

**Q5 — trigger `Status_feedback`.** Autorizado a remover, no passo 8 (D14). `CREATE TRIGGER` original guardado
em `00-decisoes.md` para rollback.

### Ordem de implementação

Cada passo é testável isoladamente e não quebra nada sozinho.

| # | Passo | Entrega | Teste de aceitação |
|---|---|---|---|
| **1** | M1 `contatos` + trigger + backfill | Todo feedback novo nasce com `contato_id` | Inserir feedback de teste; conferir contato criado e reusado no 2º |
| **2** | M2 `feedback_acao` + popular em `sugerir-acoes` + backfill | Ação sabe quais feedbacks a alimentaram | Criar ação por insight; conferir N linhas. Apagar o insight: vínculo **sobrevive** |
| **3** | M6 (E2) + filtro em `gerar-insights` + triggers de liberação | Sem insight/ação repetidos | Gerar insight; feedback fica `usado_em`. Apagar insight; volta a `null` |
| **4** | M5 (config) + UI admin (D7) + UI dono E3/D8 + **selo no card (D13)** | Parâmetros editáveis; dono vê quantos clientes serão avisados | Mudar cooldown em `/admin`; conferir jsonb. Mudar expiração em `/configuracoes`. Card com 2 feedbacks ligados mostra "2 clientes serão avisados" |
| **5** | M3+M4 (histórico, fila, cooldown, log) + trigger do aviso | Transição cria aviso; regressão cancela | **T-D** (dedup), **T-E** (1 feedback → N ações), cancelamento |
| **6** | Worker em dry-run + job `pg_cron` | Fila calculada, nada enviado | **T-A** (rajada), **T-B** (represamento), **T-C** (esvaziamento), **T-F** (anti-spam), **T-G** (ordenação) — com `cooldown_dias = 0` via SQL |
| **7** | n8n `easyfeed-enviar-retorno` + callback + tira dry-run | Mensagem real, restaurante 11 | Ponta a ponta com número seu |
| **8** | **Corte** (M7 + `TaskBoard.tsx`) + ligar `ativo` | Disparo antigo morto | **T-H** (ack intacto). Conferir `pg_trigger`: `Status_feedback` sumiu |

Os 8 testes do SPEC entram nos passos 5–8. **T-H (ack)** é verificado no fim: por D4, nenhum nó do n8n de
entrada mudou, então a expectativa é que passe trivialmente — mas confirmo mesmo assim.
