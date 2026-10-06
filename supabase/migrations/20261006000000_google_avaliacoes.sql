-- Avaliações do Google (Google Business Profile APIs).
--
-- Política da API ("Content storage"): o conteúdo só pode ficar guardado como
-- cópia temporária de até 30 dias, de forma segura e sem ser agregado. Então:
--   - google_avaliacoes é uma CÓPIA: cada sincronização renova `buscada_em`, o
--     que sumiu do Google sai na hora, e o cron apaga o que ficar 30 dias sem
--     renovar;
--   - não existe tabela de médias: google_medias_mensais() calcula na consulta.
-- O token de renovação do Google fica criptografado no Vault.

-- ── Conexão (uma por restaurante) ──────────────────────────────────────────
create table if not exists public.google_conexoes (
  restaurante_id bigint primary key references public.restaurantes(id) on delete cascade,
  -- id do segredo no Vault (o token em si nunca fica nesta tabela)
  refresh_token_id uuid,
  status text not null default 'escolher_local'
    check (status in ('escolher_local', 'conectado', 'precisa_reconectar', 'sem_local', 'aguardando_google')),
  conta text,                 -- accounts/123
  local text,                 -- locations/456
  local_nome text,
  endereco text,
  place_id text,
  maps_uri text,
  locais_disponiveis jsonb,   -- quando o dono administra mais de um restaurante
  nota_media numeric(3, 2),   -- averageRating do Google (cópia, renovada a cada sincronização)
  total_avaliacoes integer,   -- totalReviewCount do Google
  ultima_sincronizacao timestamptz,
  ultima_tentativa timestamptz,
  erro text,
  conectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.google_conexoes enable row level security;
drop policy if exists google_conexoes_dono_le on public.google_conexoes;
create policy google_conexoes_dono_le on public.google_conexoes
  for select using (restaurante_id = public.get_user_restaurante_id());

-- ── State do OAuth (proteção contra volta forjada; vale 10 min) ────────────
create table if not exists public.google_oauth_estados (
  state text primary key,
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.google_oauth_estados enable row level security;
-- Sem política: só a função (chave de serviço) lê e grava.

-- ── Cópia temporária das avaliações ────────────────────────────────────────
create table if not exists public.google_avaliacoes (
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  id text not null,           -- reviewId do Google
  nota smallint not null check (nota between 1 and 5),
  comentario text,
  autor text,
  anonimo boolean not null default false,
  resposta text,
  resposta_em timestamptz,
  criada_em timestamptz not null,       -- createTime
  atualizada_em timestamptz,            -- updateTime
  buscada_em timestamptz not null default now(),
  primary key (restaurante_id, id)
);
create index if not exists idx_google_avaliacoes_data on public.google_avaliacoes (restaurante_id, criada_em desc);
create index if not exists idx_google_avaliacoes_buscada on public.google_avaliacoes (buscada_em);

alter table public.google_avaliacoes enable row level security;
drop policy if exists google_avaliacoes_dono_le on public.google_avaliacoes;
create policy google_avaliacoes_dono_le on public.google_avaliacoes
  for select using (restaurante_id = public.get_user_restaurante_id());

-- ── Token de renovação no Vault ────────────────────────────────────────────
-- Só a chave de serviço (as funções) executa estas três.
create or replace function public.google_guardar_token(p_restaurante_id bigint, p_token text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select refresh_token_id into v_id from public.google_conexoes where restaurante_id = p_restaurante_id;
  if v_id is not null and exists (select 1 from vault.secrets where id = v_id) then
    perform vault.update_secret(v_id, p_token);
  else
    v_id := vault.create_secret(p_token, null, 'Token de renovação do Google do restaurante ' || p_restaurante_id);
  end if;
  insert into public.google_conexoes (restaurante_id, refresh_token_id)
  values (p_restaurante_id, v_id)
  on conflict (restaurante_id) do update
    set refresh_token_id = excluded.refresh_token_id, atualizado_em = now();
end;
$$;

create or replace function public.google_ler_token(p_restaurante_id bigint)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select s.decrypted_secret
  from public.google_conexoes c
  join vault.decrypted_secrets s on s.id = c.refresh_token_id
  where c.restaurante_id = p_restaurante_id
$$;

create or replace function public.google_apagar_token(p_restaurante_id bigint)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets
  where id = (select refresh_token_id from public.google_conexoes where restaurante_id = p_restaurante_id);
  update public.google_conexoes set refresh_token_id = null where restaurante_id = p_restaurante_id;
end;
$$;

revoke all on function public.google_guardar_token(bigint, text) from public, anon, authenticated;
revoke all on function public.google_ler_token(bigint) from public, anon, authenticated;
revoke all on function public.google_apagar_token(bigint) from public, anon, authenticated;
grant execute on function public.google_guardar_token(bigint, text) to service_role;
grant execute on function public.google_ler_token(bigint) to service_role;
grant execute on function public.google_apagar_token(bigint) to service_role;

-- ── Médias calculadas na hora (nada guardado) ──────────────────────────────
-- Por mês (horário de Brasília): média do mês, quantidade e média acumulada até
-- aquele mês. Mês sem avaliação aparece com média nula e a acumulada de antes.
create or replace function public.google_medias_mensais(p_meses integer default 24)
returns table (mes date, media numeric, quantidade integer, media_acumulada numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with av as (
    select (date_trunc('month', criada_em at time zone 'America/Sao_Paulo'))::date as mes, nota
    from public.google_avaliacoes
    where restaurante_id = public.get_user_restaurante_id()
  ),
  limites as (
    select min(mes) as ini, (date_trunc('month', now() at time zone 'America/Sao_Paulo'))::date as fim from av
  ),
  meses as (
    select generate_series(l.ini, l.fim, interval '1 month')::date as mes
    from limites l
    where l.ini is not null
  ),
  por_mes as (
    select mes, sum(nota) as soma, count(*) as qtd from av group by mes
  ),
  serie as (
    select m.mes, p.soma, coalesce(p.qtd, 0) as qtd,
      sum(coalesce(p.soma, 0)) over (order by m.mes) as soma_acum,
      sum(coalesce(p.qtd, 0)) over (order by m.mes) as qtd_acum
    from meses m
    left join por_mes p using (mes)
  )
  select mes,
    round(soma::numeric / nullif(qtd, 0), 2),
    qtd::integer,
    round(soma_acum::numeric / nullif(qtd_acum, 0), 2)
  from serie
  where mes > ((date_trunc('month', now() at time zone 'America/Sao_Paulo'))::date - make_interval(months => greatest(p_meses, 1)))
  order by mes
$$;

-- Distribuição das estrelas e os últimos 30 dias, também calculados na hora.
create or replace function public.google_resumo()
returns table (
  estrelas_1 integer, estrelas_2 integer, estrelas_3 integer, estrelas_4 integer, estrelas_5 integer,
  media_30d numeric, quantidade_30d integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*) filter (where nota = 1)::integer,
    count(*) filter (where nota = 2)::integer,
    count(*) filter (where nota = 3)::integer,
    count(*) filter (where nota = 4)::integer,
    count(*) filter (where nota = 5)::integer,
    round(avg(nota) filter (where criada_em >= now() - interval '30 days'), 2),
    (count(*) filter (where criada_em >= now() - interval '30 days'))::integer
  from public.google_avaliacoes
  where restaurante_id = public.get_user_restaurante_id()
$$;

grant execute on function public.google_medias_mensais(integer) to authenticated;
grant execute on function public.google_resumo() to authenticated;

-- ── Tempo real ─────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['google_conexoes', 'google_avaliacoes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Cron ───────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Todo dia: apaga a cópia que ficou 30 dias sem renovar e os states velhos.
do $$ begin perform cron.unschedule('google-limpar-copia'); exception when others then null; end $$;
select cron.schedule(
  'google-limpar-copia',
  '30 3 * * *',
  $cron$
    delete from public.google_avaliacoes where buscada_em < now() - interval '30 days';
    delete from public.google_oauth_estados where criado_em < now() - interval '1 hour';
  $cron$
);

-- A cada 6 h: renova as avaliações de todos os restaurantes conectados.
do $$ begin perform cron.unschedule('google-sincronizar'); exception when others then null; end $$;
select cron.schedule(
  'google-sincronizar',
  '15 */6 * * *',
  $cron$
    select net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/google-perfil',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM',
        'x-cron-secret', (select valor from public.integracao_config where chave = 'PUSH_TRIGGER_SECRET')
      ),
      body := '{"acao": "sincronizar_todos"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);
