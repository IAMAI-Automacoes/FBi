-- Influenciadores com link próprio, comissão por pessoa e acompanhamento
-- (pedido do Raver, 21/10/2026).
--
-- A troca com o influenciador: ele usa os dados da área /influencers e, em
-- troca, posta vídeos vendendo o EasyFeed com o link dele. Quem assina pelo
-- link rende a ele uma % de cada mensalidade por N meses — a % muda de um
-- influenciador para outro (depende do tamanho dele).
--
-- 1. O código do link é uma linha de `afiliados` (o mesmo caminho do
--    `/cadastro?ref=`, da indicação e do checkout), marcada `eh_influenciador`
--    para não aparecer em Vendedores. A % fica em `comissao_valor` e os meses
--    em `comissao_meses`.
-- 2. Para saber se ele divulga ou só usa os dados:
--    · `link_visitas`: quem abriu o link (um por navegador por dia);
--    · `influenciador_acessos`: os dias em que ele entrou no painel;
--    · `influenciador_videos`: os vídeos que ele diz ter postado, que o admin confere.
-- Tudo passa pelas funções abaixo; as tabelas novas não têm política (RLS
-- ligada, ninguém lê direto).

-- ── 1. O link e a comissão ───────────────────────────────────────────────────

alter table public.afiliados
  add column if not exists eh_influenciador boolean not null default false,
  add column if not exists comissao_meses integer;
alter table public.afiliados drop constraint if exists afiliados_comissao_meses_check;
alter table public.afiliados add constraint afiliados_comissao_meses_check
  check (comissao_meses is null or comissao_meses between 1 and 120);

alter table public.influenciadores
  add column if not exists afiliado_id uuid references public.afiliados(id) on delete set null,
  add column if not exists seguidores integer,
  add column if not exists videos_por_mes integer not null default 2;
alter table public.influenciadores drop constraint if exists influenciadores_seguidores_check;
alter table public.influenciadores add constraint influenciadores_seguidores_check check (seguidores is null or seguidores >= 0);
alter table public.influenciadores drop constraint if exists influenciadores_videos_por_mes_check;
alter table public.influenciadores add constraint influenciadores_videos_por_mes_check check (videos_por_mes between 0 and 60);
create unique index if not exists influenciadores_afiliado_unico on public.influenciadores (afiliado_id) where afiliado_id is not null;

-- ── 2. O acompanhamento ──────────────────────────────────────────────────────

create table if not exists public.link_visitas (
  afiliado_id uuid not null references public.afiliados(id) on delete cascade,
  visitante   text not null,
  dia         date not null default (now() at time zone 'America/Sao_Paulo')::date,
  criado_em   timestamptz not null default now(),
  primary key (afiliado_id, visitante, dia)
);
alter table public.link_visitas enable row level security;

create table if not exists public.influenciador_acessos (
  influenciador_id uuid not null references public.influenciadores(id) on delete cascade,
  dia              date not null,
  primary key (influenciador_id, dia)
);
alter table public.influenciador_acessos enable row level security;

create table if not exists public.influenciador_videos (
  id               uuid primary key default gen_random_uuid(),
  influenciador_id uuid not null references public.influenciadores(id) on delete cascade,
  url              text not null check (url ~ '^https?://\S+$' and char_length(url) <= 500),
  situacao         text not null default 'pendente' check (situacao in ('pendente', 'aprovado', 'recusado')),
  recado           text check (recado is null or char_length(recado) <= 300),
  criado_em        timestamptz not null default now(),
  conferido_em     timestamptz,
  conferido_por    text,
  unique (influenciador_id, url)
);
alter table public.influenciador_videos enable row level security;

-- Os números de um link (o mesmo cálculo para o admin e para o influenciador).
create or replace function public.influenciador_numeros_do_link(p_afiliado uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'visitas_30d', (select count(*) from public.link_visitas v
                     where v.afiliado_id = p_afiliado
                       and v.dia > (now() at time zone 'America/Sao_Paulo')::date - 30),
    'contas',      (select count(*) from public.indicacoes i where i.afiliado_id = p_afiliado),
    'assinando',   (select count(*) from public.indicacoes i
                      join public.restaurantes r on r.id = i.indicado_restaurante_id
                     where i.afiliado_id = p_afiliado and r.assinatura_status = 'ativa'
                       and public.indicacao_meses_pagos(i.indicado_restaurante_id) >= 1))
$$;
revoke all on function public.influenciador_numeros_do_link(uuid) from public, anon, authenticated;

-- Os vídeos de um influenciador, do mais novo para o mais velho.
create or replace function public.influenciador_lista_videos(p_influenciador uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'url', v.url, 'situacao', v.situacao, 'recado', v.recado,
           'criado_em', v.criado_em, 'conferido_em', v.conferido_em)
         order by v.criado_em desc), '[]'::jsonb)
    from public.influenciador_videos v
   where v.influenciador_id = p_influenciador
$$;
revoke all on function public.influenciador_lista_videos(uuid) from public, anon, authenticated;

-- ── 3. Quem abre o link (chamada pelo site, sem login) ──────────────────────

create or replace function public.link_registrar_visita(p_codigo text, p_visitante text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_af  uuid;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if coalesce(p_visitante, '') !~ '^[A-Za-z0-9-]{8,64}$' then return; end if;
  select a.id into v_af from public.afiliados a
   where a.codigo = upper(btrim(coalesce(p_codigo, ''))) and a.ativo;
  if v_af is null then return; end if;
  -- Teto por link e por dia: ninguém enche a tabela chamando a função em loop.
  if (select count(*) from public.link_visitas v where v.afiliado_id = v_af and v.dia = v_dia) >= 5000 then return; end if;
  insert into public.link_visitas (afiliado_id, visitante, dia) values (v_af, p_visitante, v_dia)
  on conflict do nothing;
end;
$$;
revoke all on function public.link_registrar_visita(text, text) from public;
grant execute on function public.link_registrar_visita(text, text) to anon, authenticated;

-- ── 4. A área /influencers ───────────────────────────────────────────────────

-- O painel chama ao abrir: guarda o último acesso e o dia (para o admin ver
-- quantos dias a pessoa usou os dados).
create or replace function public.influencer_marcar_acesso()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.influenciadores
     set ultimo_acesso_em = now(),
         auth_user_id = coalesce(auth_user_id, auth.uid())
   where email = lower(auth.email())
  returning id into v_id;
  if v_id is not null then
    insert into public.influenciador_acessos (influenciador_id, dia)
    values (v_id, (now() at time zone 'America/Sao_Paulo')::date)
    on conflict do nothing;
  end if;
end;
$$;

-- O link do influenciador logado, a comissão, os números e os vídeos dele.
create or replace function public.influencer_meu_link()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inf public.influenciadores%rowtype;
  v_af  public.afiliados%rowtype;
begin
  select * into v_inf from public.influenciadores i where i.email = lower(auth.email());
  if v_inf.id is null then
    raise exception 'Sem acesso ao EasyFeed Influencers.' using errcode = '42501';
  end if;
  if v_inf.afiliado_id is not null then
    select * into v_af from public.afiliados a where a.id = v_inf.afiliado_id;
  end if;
  return jsonb_build_object(
           'codigo',         case when v_af.ativo then v_af.codigo end,
           'comissao_pct',   v_af.comissao_valor,
           'comissao_meses', v_af.comissao_meses,
           'videos_por_mes', v_inf.videos_por_mes,
           'videos',         public.influenciador_lista_videos(v_inf.id))
         || case when v_af.id is null then '{"visitas_30d":0,"contas":0,"assinando":0}'::jsonb
                 else public.influenciador_numeros_do_link(v_af.id) end;
end;
$$;
revoke all on function public.influencer_meu_link() from public, anon;
grant execute on function public.influencer_meu_link() to authenticated;

-- O influenciador avisa que postou um vídeo (cola o link). O admin confere.
create or replace function public.influencer_registrar_video(p_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inf uuid;
  v_url text := btrim(coalesce(p_url, ''));
  v_id  uuid;
begin
  select i.id into v_inf from public.influenciadores i where i.email = lower(auth.email());
  if v_inf is null then
    raise exception 'Sem acesso ao EasyFeed Influencers.' using errcode = '42501';
  end if;
  if v_url !~ '^https?://\S+$' or char_length(v_url) > 500 then
    return jsonb_build_object('ok', false, 'motivo', 'link_invalido');
  end if;
  if (select count(*) from public.influenciador_videos v
       where v.influenciador_id = v_inf and v.criado_em > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'motivo', 'muitos_hoje');
  end if;
  insert into public.influenciador_videos (influenciador_id, url) values (v_inf, v_url)
  on conflict (influenciador_id, url) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'repetido');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.influencer_registrar_video(text) from public, anon;
grant execute on function public.influencer_registrar_video(text) to authenticated;

-- Tirar um vídeo que ainda não foi conferido (colou o link errado).
create or replace function public.influencer_remover_video(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.influenciador_videos v
   where v.id = p_id and v.situacao = 'pendente'
     and v.influenciador_id = (select i.id from public.influenciadores i where i.email = lower(auth.email()))
$$;
revoke all on function public.influencer_remover_video(uuid) from public, anon;
grant execute on function public.influencer_remover_video(uuid) to authenticated;

-- ── 5. O admin ───────────────────────────────────────────────────────────────

-- A lista com tudo o que a tela do admin mostra.
create or replace function public.admin_influenciadores()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'email', i.email, 'nome', i.nome, 'arroba', i.arroba, 'cidade', i.cidade,
             'seguidores', i.seguidores, 'videos_por_mes', i.videos_por_mes,
             'onboarding_em', i.onboarding_em, 'ultimo_acesso_em', i.ultimo_acesso_em, 'criado_em', i.criado_em,
             'codigo', a.codigo, 'link_ativo', coalesce(a.ativo, false),
             'comissao_pct', a.comissao_valor, 'comissao_meses', a.comissao_meses,
             'acessos_30d', (select count(*) from public.influenciador_acessos ac
                              where ac.influenciador_id = i.id and ac.dia > v_hoje - 30),
             'videos', public.influenciador_lista_videos(i.id))
           || case when a.id is null then '{"visitas_30d":0,"contas":0,"assinando":0}'::jsonb
                   else public.influenciador_numeros_do_link(a.id) end
           order by i.criado_em desc)
      from public.influenciadores i
      left join public.afiliados a on a.id = i.afiliado_id), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_influenciadores() from public, anon;
grant execute on function public.admin_influenciadores() to authenticated;

-- Adicionar (p_id nulo) ou editar um influenciador. Quem é novo ganha o
-- código do link na hora. O e-mail não muda depois (é o login dele).
create or replace function public.admin_salvar_influenciador(
  p_id uuid, p_email text, p_nome text, p_arroba text, p_seguidores integer,
  p_comissao_pct numeric, p_comissao_meses integer, p_videos_por_mes integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_nome   text := nullif(btrim(coalesce(p_nome, '')), '');
  v_arroba text := nullif(regexp_replace(btrim(coalesce(p_arroba, '')), '^@+', ''), '');
  v_inf    public.influenciadores%rowtype;
  v_af     uuid;
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  if p_comissao_pct is null or p_comissao_pct < 0 or p_comissao_pct > 100 then
    raise exception 'COMISSAO_INVALIDA' using errcode = '22023';
  end if;
  if p_comissao_meses is null or p_comissao_meses < 1 or p_comissao_meses > 120 then
    raise exception 'MESES_INVALIDOS' using errcode = '22023';
  end if;
  if p_videos_por_mes is null or p_videos_por_mes < 0 or p_videos_por_mes > 60 then
    raise exception 'VIDEOS_INVALIDOS' using errcode = '22023';
  end if;
  if p_seguidores is not null and p_seguidores < 0 then
    raise exception 'SEGUIDORES_INVALIDOS' using errcode = '22023';
  end if;

  if p_id is null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'EMAIL_INVALIDO' using errcode = '22023';
    end if;
    if exists (select 1 from public.influenciadores i where i.email = v_email) then
      raise exception 'JA_NA_LISTA' using errcode = '23505';
    end if;
    -- O gatilho recusa e-mail de conta de restaurante (EMAIL_DE_RESTAURANTE).
    insert into public.influenciadores (email, nome, arroba, seguidores, videos_por_mes)
    values (v_email, v_nome, v_arroba, p_seguidores, p_videos_por_mes)
    returning * into v_inf;
  else
    update public.influenciadores
       set nome = v_nome, arroba = v_arroba, seguidores = p_seguidores, videos_por_mes = p_videos_por_mes
     where id = p_id
    returning * into v_inf;
    if v_inf.id is null then
      raise exception 'NAO_ENCONTRADO' using errcode = 'P0002';
    end if;
  end if;

  if v_inf.afiliado_id is null then
    insert into public.afiliados (nome, email, codigo, area, eh_influenciador, comissao_tipo, comissao_valor, comissao_meses, ativo)
    values (coalesce(v_nome, v_arroba, split_part(v_inf.email, '@', 1)), v_inf.email,
            public.indicacao_codigo_novo(coalesce(v_arroba, v_nome, split_part(v_inf.email, '@', 1))),
            'restaurante', true, 'porcentagem', p_comissao_pct, p_comissao_meses, true)
    returning id into v_af;
    update public.influenciadores set afiliado_id = v_af where id = v_inf.id;
  else
    update public.afiliados
       set nome = coalesce(v_nome, v_arroba, nome), comissao_tipo = 'porcentagem',
           comissao_valor = p_comissao_pct, comissao_meses = p_comissao_meses, ativo = true
     where id = v_inf.afiliado_id;
  end if;
  return v_inf.id;
end;
$$;
revoke all on function public.admin_salvar_influenciador(uuid, text, text, text, integer, numeric, integer, integer) from public, anon;
grant execute on function public.admin_salvar_influenciador(uuid, text, text, text, integer, numeric, integer, integer) to authenticated;

-- Tirar o acesso: o link para de valer (quem já entrou por ele continua contado).
create or replace function public.admin_remover_influenciador(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  update public.afiliados set ativo = false
   where id = (select i.afiliado_id from public.influenciadores i where i.id = p_id);
  delete from public.influenciadores where id = p_id;
end;
$$;
revoke all on function public.admin_remover_influenciador(uuid) from public, anon;
grant execute on function public.admin_remover_influenciador(uuid) to authenticated;

-- Conferir um vídeo: conta (aprovado), não conta (recusado, com recado) ou volta a "para conferir".
create or replace function public.admin_conferir_video(p_id uuid, p_situacao text, p_recado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  if p_situacao not in ('pendente', 'aprovado', 'recusado') then
    raise exception 'SITUACAO_INVALIDA' using errcode = '22023';
  end if;
  update public.influenciador_videos
     set situacao      = p_situacao,
         recado        = case when p_situacao = 'recusado' then nullif(left(btrim(coalesce(p_recado, '')), 300), '') end,
         conferido_em  = case when p_situacao = 'pendente' then null else now() end,
         conferido_por = case when p_situacao = 'pendente' then null else lower(auth.email()) end
   where id = p_id;
end;
$$;
revoke all on function public.admin_conferir_video(uuid, text, text) from public, anon;
grant execute on function public.admin_conferir_video(uuid, text, text) to authenticated;

-- ── 6. Quem já está na lista ganha o link (15% por 12 meses, dá para mudar) ──

do $$
declare
  r    record;
  v_af uuid;
begin
  for r in select * from public.influenciadores where afiliado_id is null loop
    insert into public.afiliados (nome, email, codigo, area, eh_influenciador, comissao_tipo, comissao_valor, comissao_meses, ativo)
    values (coalesce(r.nome, r.arroba, split_part(r.email, '@', 1)), r.email,
            public.indicacao_codigo_novo(coalesce(r.arroba, r.nome, split_part(r.email, '@', 1))),
            'restaurante', true, 'porcentagem', 15, 12, true)
    returning id into v_af;
    update public.influenciadores set afiliado_id = v_af where id = r.id;
  end loop;
end;
$$;

-- ── 7. O primeiro acesso não apaga o @ que o admin cadastrou ────────────────
-- (a tela do influenciador não pergunta o @ e manda vazio).
create or replace function public.influencer_salvar_perfil(p_nome text, p_arroba text, p_cidade text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nome   text := left(nullif(btrim(coalesce(p_nome, '')), ''), 60);
  v_arroba text := left(nullif(ltrim(btrim(coalesce(p_arroba, '')), '@'), ''), 40);
  v_cidade text := left(nullif(btrim(coalesce(p_cidade, '')), ''), 60);
begin
  if auth.uid() is null or v_nome is null then
    return false;
  end if;
  update public.influenciadores
     set nome = v_nome,
         arroba = coalesce(v_arroba, arroba),
         cidade = v_cidade,
         auth_user_id = auth.uid(),
         onboarding_em = coalesce(onboarding_em, now())
   where email = lower(auth.email());
  return found;
end;
$$;
