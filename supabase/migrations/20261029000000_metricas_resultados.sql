-- Resultados: a evolução de cada restaurante desde que entrou no EasyFeed,
-- para o admin da plataforma (aba "Resultados" do painel) e para o marketing.
--
-- Por que uma tabela e não só consulta na hora:
--   - os termos (legal/politicas-e-termos.md, PEND-5) preveem apagar feedbacks
--     depois de um prazo; quando isso existir, o histórico some junto se não
--     houver uma cópia agregada. Aqui só ficam CONTAGENS por dia — nenhum texto,
--     telefone ou nome de cliente;
--   - o painel lê todos os restaurantes de uma vez, e somar contagens diárias é
--     barato.
--
-- Regras:
--   - só feedback de CLIENTE (`publico = 'cliente'`); o da equipe fica de fora;
--   - `invalidado_em` NÃO tira o ponto da conta: ele só deixa de servir para
--     gerar insight (ver 20260902000000) e continua na Visão Geral, então aqui
--     também — os números das duas telas batem;
--   - o dia é o de Brasília;
--   - só guardamos contagens; índices (satisfação etc.) são calculados na
--     leitura, então mudar uma fórmula não exige recalcular nada;
--   - nada do Google entra aqui (a política da API não permite guardar
--     agregados, e a política de privacidade promete não usar para publicidade).
--
-- Pode rodar mais de uma vez.

-- ─────────────────────────────────────────────────────────────
-- 1. Contagens por restaurante e dia
-- ─────────────────────────────────────────────────────────────
create table if not exists public.metricas_diarias (
  restaurante_id   bigint not null references public.restaurantes(id) on delete cascade,
  dia              date not null,
  -- mensagens dos clientes (feedbacks_originais): uma por vez que alguém escreveu
  mensagens        integer not null default 0,
  -- pontos separados por assunto (feedbacks_restaurante)
  positivos        integer not null default 0,
  negativos        integer not null default 0,
  neutros          integer not null default 0,
  sugestoes        integer not null default 0,
  -- {"Atendimento": {"pos": 3, "neu": 1, "neg": 2, "sug": 0}, ...}
  por_categoria    jsonb not null default '{}'::jsonb,
  -- telefones cuja primeira mensagem de sempre foi neste dia
  clientes_novos   integer not null default 0,
  -- telefones que escreveram neste dia e já tinham escrito antes
  retornos         integer not null default 0,
  aberturas_qr     integer not null default 0,
  acoes_criadas    integer not null default 0,
  acoes_concluidas integer not null default 0,
  insights_gerados integer not null default 0,
  calculado_em     timestamptz not null default now(),
  primary key (restaurante_id, dia)
);

alter table public.metricas_diarias enable row level security;

drop policy if exists metricas_diarias_admin_le on public.metricas_diarias;
create policy metricas_diarias_admin_le on public.metricas_diarias
  for select using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
-- Sem política de escrita: só as funções abaixo (security definer) gravam.

-- ─────────────────────────────────────────────────────────────
-- 2. O cálculo
-- ─────────────────────────────────────────────────────────────
-- Recalcula os dias [p_desde, p_ate] de um restaurante a partir dos dados
-- brutos. Só grava os dias que TÊM dado bruto: um dia antigo cujo feedback já
-- foi apagado nunca é zerado, e o histórico sobrevive ao expurgo.
create or replace function public.metricas_calcular(p_restaurante_id bigint, p_desde date, p_ate date)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ini timestamptz := (p_desde::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := ((p_ate + 1)::timestamp) at time zone 'America/Sao_Paulo';
  v_linhas integer;
begin
  with
  msgs as (
    select (o.created_at at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as mensagens
      from public.feedbacks_originais o
     where o.restaurante_id = p_restaurante_id
       and o.publico = 'cliente'
       and o.created_at >= v_ini and o.created_at < v_fim
     group by 1
  ),
  pts as (
    select (f.created_at at time zone 'America/Sao_Paulo')::date as dia,
           coalesce(nullif(btrim(f.categoria), ''), 'Outros') as categoria,
           public.influencers_tipo(f.sentimento) as tipo
      from public.feedbacks_restaurante f
     where f.restaurante_id = p_restaurante_id
       and f.publico = 'cliente'
       and f.created_at >= v_ini and f.created_at < v_fim
  ),
  pts_dia as (
    select dia,
           count(*) filter (where tipo = 'elogio')::int     as positivos,
           count(*) filter (where tipo = 'reclamacao')::int as negativos,
           count(*) filter (where tipo = 'neutro')::int     as neutros,
           count(*) filter (where tipo = 'sugestao')::int   as sugestoes
      from pts
     group by dia
  ),
  pts_cat as (
    select dia, jsonb_object_agg(categoria, jsonb_build_object('pos', pos, 'neu', neu, 'neg', neg, 'sug', sug)) as por_categoria
      from (select dia, categoria,
                   count(*) filter (where tipo = 'elogio')::int     as pos,
                   count(*) filter (where tipo = 'neutro')::int     as neu,
                   count(*) filter (where tipo = 'reclamacao')::int as neg,
                   count(*) filter (where tipo = 'sugestao')::int   as sug
              from pts
             group by dia, categoria) c
     group by dia
  ),
  -- Primeira mensagem de cada telefone em TODO o histórico do restaurante
  -- (não só na janela): é o que separa cliente novo de quem voltou.
  primeiras as (
    select o.telefone_cliente as tel,
           min((o.created_at at time zone 'America/Sao_Paulo')::date) as primeiro_dia
      from public.feedbacks_originais o
     where o.restaurante_id = p_restaurante_id
       and o.publico = 'cliente'
       and nullif(btrim(o.telefone_cliente), '') is not null
       and o.created_at < v_fim
     group by 1
  ),
  cli as (
    select d.dia,
           count(distinct d.tel) filter (where p.primeiro_dia = d.dia)::int as clientes_novos,
           count(distinct d.tel) filter (where p.primeiro_dia < d.dia)::int as retornos
      from (select distinct (o.created_at at time zone 'America/Sao_Paulo')::date as dia, o.telefone_cliente as tel
              from public.feedbacks_originais o
             where o.restaurante_id = p_restaurante_id
               and o.publico = 'cliente'
               and nullif(btrim(o.telefone_cliente), '') is not null
               and o.created_at >= v_ini and o.created_at < v_fim) d
      join primeiras p on p.tel = d.tel
     group by d.dia
  ),
  qr as (
    select (s.scanned_at at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as aberturas_qr
      from public.qr_scans s
      join public.qr_codes q on q.id = s.qr_code_id
     where q.restaurante_id = p_restaurante_id
       and s.scanned_at >= v_ini and s.scanned_at < v_fim
     group by 1
  ),
  acoes_c as (
    select (a.created_at at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as acoes_criadas
      from public.acoes_operacionais a
     where a.restaurante_id = p_restaurante_id
       and a.publico = 'cliente'
       and a.created_at >= v_ini and a.created_at < v_fim
     group by 1
  ),
  acoes_f as (
    select (a.concluida_em at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as acoes_concluidas
      from public.acoes_operacionais a
     where a.restaurante_id = p_restaurante_id
       and a.publico = 'cliente'
       and a.status = 'CONCLUIDO'
       and a.concluida_em >= v_ini and a.concluida_em < v_fim
     group by 1
  ),
  ins as (
    select (i.created_at at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as insights_gerados
      from public.insights i
     where i.restaurante_id = p_restaurante_id
       and i.publico = 'cliente'
       and i.created_at >= v_ini and i.created_at < v_fim
     group by 1
  ),
  dias as (
    select dia from msgs union select dia from pts_dia union select dia from cli
    union select dia from qr union select dia from acoes_c union select dia from acoes_f
    union select dia from ins
  ),
  gravados as (
    insert into public.metricas_diarias as m (
      restaurante_id, dia, mensagens, positivos, negativos, neutros, sugestoes, por_categoria,
      clientes_novos, retornos, aberturas_qr, acoes_criadas, acoes_concluidas, insights_gerados, calculado_em)
    select p_restaurante_id, d.dia,
           coalesce(msgs.mensagens, 0),
           coalesce(pts_dia.positivos, 0), coalesce(pts_dia.negativos, 0),
           coalesce(pts_dia.neutros, 0), coalesce(pts_dia.sugestoes, 0),
           coalesce(pts_cat.por_categoria, '{}'::jsonb),
           coalesce(cli.clientes_novos, 0), coalesce(cli.retornos, 0),
           coalesce(qr.aberturas_qr, 0),
           coalesce(acoes_c.acoes_criadas, 0), coalesce(acoes_f.acoes_concluidas, 0),
           coalesce(ins.insights_gerados, 0),
           now()
      from dias d
      left join msgs    using (dia)
      left join pts_dia using (dia)
      left join pts_cat using (dia)
      left join cli     using (dia)
      left join qr      using (dia)
      left join acoes_c using (dia)
      left join acoes_f using (dia)
      left join ins     using (dia)
     where d.dia between p_desde and p_ate
    on conflict (restaurante_id, dia) do update set
      mensagens        = excluded.mensagens,
      positivos        = excluded.positivos,
      negativos        = excluded.negativos,
      neutros          = excluded.neutros,
      sugestoes        = excluded.sugestoes,
      por_categoria    = excluded.por_categoria,
      clientes_novos   = excluded.clientes_novos,
      retornos         = excluded.retornos,
      aberturas_qr     = excluded.aberturas_qr,
      acoes_criadas    = excluded.acoes_criadas,
      acoes_concluidas = excluded.acoes_concluidas,
      insights_gerados = excluded.insights_gerados,
      calculado_em     = excluded.calculado_em
    returning 1
  )
  select count(*) into v_linhas from gravados;
  return v_linhas;
end;
$$;

-- Os últimos `p_dias` de todos os restaurantes (ou de um). Feedback pode ser
-- reclassificado e ação pode ser reaberta depois; dias mais antigos que isso
-- ficam congelados.
create or replace function public.metricas_atualizar(p_dias integer default 35, p_restaurante_id bigint default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total integer := 0;
  r record;
begin
  for r in
    select id from public.restaurantes
     where excluida_em is null
       and (p_restaurante_id is null or id = p_restaurante_id)
  loop
    v_total := v_total + public.metricas_calcular(r.id, v_hoje - greatest(coalesce(p_dias, 35), 1), v_hoje);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.metricas_calcular(bigint, date, date) from public, anon, authenticated;
revoke all on function public.metricas_atualizar(integer, bigint) from public, anon, authenticated;
grant execute on function public.metricas_calcular(bigint, date, date) to service_role;
grant execute on function public.metricas_atualizar(integer, bigint) to service_role;

-- Botão "Atualizar agora" do painel: os últimos 35 dias, só para o admin.
create or replace function public.admin_metricas_atualizar(p_restaurante_id bigint default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())) then
    raise exception 'só o admin da plataforma' using errcode = '42501';
  end if;
  return public.metricas_atualizar(35, p_restaurante_id);
end;
$$;

revoke all on function public.admin_metricas_atualizar(bigint) from public, anon;
grant execute on function public.admin_metricas_atualizar(bigint) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. Os restaurantes da aba
-- ─────────────────────────────────────────────────────────────
-- `eh_teste`: conta de admin da plataforma ou de vendedor (demonstração) — o
-- mesmo critério de `influencers_restaurantes_base`. Fica de fora dos números
-- da base, mas aparece na lista se o admin pedir.
create or replace function public.admin_resultados_restaurantes()
returns table (
  id bigint,
  nome text,
  logo_url text,
  tipo_culinaria text,
  area text,
  created_at timestamptz,
  assinatura_status text,
  excluida_em timestamptz,
  eh_teste boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())) then
    raise exception 'só o admin da plataforma' using errcode = '42501';
  end if;
  return query
    select r.id::bigint, r.nome_restaurante::text, nullif(r.logo_url, '')::text, nullif(btrim(r.tipo_culinaria), '')::text,
           r.area::text, r.created_at::timestamptz, r.assinatura_status::text, r.excluida_em::timestamptz,
           exists (
             select 1 from auth.users u
              where u.id = r.auth_user_id
                and (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(u.email))
                  or exists (select 1 from public.vendedores v where v.email = lower(u.email))))
      from public.restaurantes r
     order by r.nome_restaurante;
end;
$$;

revoke all on function public.admin_resultados_restaurantes() from public, anon;
grant execute on function public.admin_resultados_restaurantes() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Autorização para divulgar o restaurante pelo nome
-- ─────────────────────────────────────────────────────────────
-- Número agregado e anônimo da base é livre (TU-8.4). Case com o nome do
-- restaurante só sai com autorização registrada aqui: quem autorizou, quando,
-- por qual canal, onde está a prova e o que pode ser divulgado. Nesta fase o
-- admin registra a autorização obtida por fora; o dono não vê esta tabela.
create table if not exists public.autorizacoes_marketing (
  restaurante_id  bigint primary key references public.restaurantes(id) on delete cascade,
  status          text not null default 'autorizado' check (status in ('autorizado', 'revogado')),
  pode_nome       boolean not null default false,
  pode_logo       boolean not null default false,
  pode_numeros    boolean not null default false,
  pode_depoimento boolean not null default false,
  autorizado_por  text not null,          -- nome de quem autorizou, do lado do restaurante
  canal           text not null check (canal in ('whatsapp', 'email', 'contrato', 'outro')),
  observacao      text,                   -- onde está a prova (print, e-mail, cláusula)
  autorizado_em   timestamptz not null default now(),
  revogado_em     timestamptz,
  registrado_por  text not null default auth.email(),
  atualizado_em   timestamptz not null default now()
);

alter table public.autorizacoes_marketing enable row level security;

drop policy if exists autorizacoes_marketing_admin on public.autorizacoes_marketing;
create policy autorizacoes_marketing_admin on public.autorizacoes_marketing
  for all
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));

-- ─────────────────────────────────────────────────────────────
-- 5. Todo dia de madrugada
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

select cron.unschedule('metricas-diarias-atualizar')
 where exists (select 1 from cron.job where jobname = 'metricas-diarias-atualizar');

select cron.schedule(
  'metricas-diarias-atualizar',
  '10 4 * * *',
  $cron$ select public.metricas_atualizar(35); $cron$
);

-- ─────────────────────────────────────────────────────────────
-- 6. Carga do histórico que já existe
-- ─────────────────────────────────────────────────────────────
-- Inclui contas excluídas (o cron não mexe mais nelas, então isto é a única
-- chance de guardar o histórico delas).
do $$
declare
  r record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for r in select id from public.restaurantes loop
    perform public.metricas_calcular(r.id, date '2024-01-01', v_hoje);
  end loop;
end $$;
