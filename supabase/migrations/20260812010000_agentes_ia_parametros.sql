-- Parâmetros de inferência por agente, editáveis pelo painel de admin.
--
-- Mesma semântica de prompts_editaveis: coluna NULL = usa o padrão do código.
-- Só o que o admin preencher vira sobrescrita, então quem nunca abrir o painel
-- continua com o comportamento de hoje.
--
-- Não há insert/delete pelo painel: as linhas só existem para os ids que estão
-- em CATALOGO_AGENTES (src/lib/ia/catalogo-agentes.ts). Criar e remover agente
-- continua sendo mudança de código, porque agente é prompt + ponto de chamada.

create table if not exists public.agentes_ia (
  id text primary key,
  modelo text,
  temperature numeric(3,2),
  max_tokens int,
  top_p numeric(3,2),
  -- top_k, min_p, frequency_penalty, presence_penalty, seed… só as chaves
  -- preenchidas são repassadas ao OpenRouter (dependem do provider do modelo).
  avancado jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint agentes_ia_temperature_faixa check (temperature is null or (temperature >= 0 and temperature <= 2)),
  constraint agentes_ia_top_p_faixa check (top_p is null or (top_p > 0 and top_p <= 1)),
  constraint agentes_ia_max_tokens_faixa check (max_tokens is null or (max_tokens between 1 and 32000))
);

comment on table public.agentes_ia is
  'Sobrescritas dos parâmetros de inferência por agente. NULL = usa o padrão do código.';

alter table public.agentes_ia enable row level security;

-- Leitura por autenticados: os agentes do navegador precisam resolver os
-- próprios parâmetros. Escrita só admin da plataforma.
drop policy if exists "agentes leitura autenticada" on public.agentes_ia;
create policy "agentes leitura autenticada" on public.agentes_ia
  for select to authenticated using (true);

drop policy if exists "agentes escrita admin" on public.agentes_ia;
create policy "agentes escrita admin" on public.agentes_ia
  for all to authenticated
  using (exists (select 1 from public.platform_admins where email = auth.email()))
  with check (exists (select 1 from public.platform_admins where email = auth.email()));
