-- Afiliados e indicações por software (Restaurante e RH).
--
-- Decisões do Raver (15/10/2026):
--   - os afiliados são separados por software, com a opção de trazer afiliados
--     do outro (a tela copia com código novo: o código é único no geral, porque
--     o checkout do Caio busca o afiliado por ele);
--   - cada software tem uma PORCENTAGEM PADRÃO, que já vem em todo afiliado
--     novo (dá para mudar por afiliado);
--   - saem o liga/desliga das indicações e o texto do benefício: quem indica
--     (restaurante ou empresa) ganha a % dele como DESCONTO na própria
--     mensalidade, aplicado à mão até o pagamento novo (Asaas);
--   - o benefício só nasce depois que o indicado paga o 2º mês.
--   - a página Indicações mostra quantos entraram, usam até hoje, usaram e
--     pararam, e quantos estão esperando o 2º mês.
--
-- Também: o código de um afiliado do RH vale como convite para escolher a
-- versão RH no cadastro (o link de indicação de uma empresa leva para o RH).
--
-- Pode rodar mais de uma vez.

-- ── Afiliados por software ───────────────────────────────────────────────
alter table public.afiliados add column if not exists area text not null default 'restaurante';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'afiliados_area_check') then
    alter table public.afiliados add constraint afiliados_area_check check (area in ('restaurante', 'rh'));
  end if;
end $$;
-- Quem é conta EasyFeed fica no software da conta.
update public.afiliados a set area = public.area_da_conta(a.restaurante_id)
 where a.restaurante_id is not null and a.area is distinct from public.area_da_conta(a.restaurante_id);
comment on column public.afiliados.area is 'De qual software é o afiliado. Conta EasyFeed que indica fica no software da conta.';

-- A porcentagem padrão de cada software.
create table if not exists public.afiliado_config (
  area            text primary key check (area in ('restaurante', 'rh')),
  comissao_padrao numeric not null default 10 check (comissao_padrao between 0 and 100),
  atualizado_por  text,
  atualizado_em   timestamptz not null default now()
);
comment on table public.afiliado_config is
  'A porcentagem que já vem em todo afiliado novo de cada software. Para quem é conta EasyFeed, é o desconto na própria mensalidade por indicado.';
insert into public.afiliado_config (area) values ('restaurante'), ('rh') on conflict do nothing;
alter table public.afiliado_config enable row level security;
drop policy if exists admins_afiliado_config on public.afiliado_config;
create policy admins_afiliado_config on public.afiliado_config
  for all to authenticated
  using      (exists (select 1 from public.platform_admins where email = auth.email()))
  with check (exists (select 1 from public.platform_admins where email = auth.email()));

-- ── O benefício: % de desconto, no 2º mês pago ──────────────────────────
alter table public.indicacao_premios add column if not exists porcentagem numeric;
comment on column public.indicacao_premios.porcentagem is 'O desconto (em %) na mensalidade de quem indicou, que valia quando o benefício nasceu.';

-- Quantas mensalidades a conta já pagou (Stripe hoje; com o Asaas, some as
-- cobranças dele aqui).
create or replace function public.indicacao_meses_pagos(p_restaurante_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct f.id)::int
    from public.stripe_faturas f
   where f.status = 'paid'
     and f.pago_centavos > 0
     and (f.restaurante_id = p_restaurante_id
          or f.stripe_subscription_id in (
            select s.stripe_subscription_id from public.stripe_assinaturas s where s.restaurante_id = p_restaurante_id))
$$;

-- "O restaurante X pagou." Marca a primeira mensalidade (como antes) e, quando
-- o indicado chega ao 2º mês pago, cria o benefício de quem indicou (se for
-- uma conta EasyFeed). Pode chamar a cada fatura: nada se repete.
create or replace function public.indicacao_registrar_pagamento(p_restaurante_id bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ind    public.indicacoes%rowtype;
  v_af     public.afiliados%rowtype;
  v_afid   uuid;
  v_premio uuid;
  v_pct    numeric;
begin
  if p_restaurante_id is null then return null; end if;

  select * into v_ind from public.indicacoes i where i.indicado_restaurante_id = p_restaurante_id for update;

  if v_ind.indicado_restaurante_id is null then
    -- Sem registro: comprou pela página de vendas, pagando antes de ter conta.
    -- Quem indicou está na assinatura. Só vale a PRIMEIRA assinatura do
    -- restaurante: quem volta depois de cancelar não é cliente novo.
    select s.afiliado_id into v_afid
      from public.stripe_assinaturas s
     where s.restaurante_id = p_restaurante_id
     order by s.created_at
     limit 1;
    if v_afid is null then return null; end if;

    select * into v_af from public.afiliados a where a.id = v_afid;
    if v_af.id is null or v_af.restaurante_id = p_restaurante_id then return null; end if;

    insert into public.indicacoes (indicado_restaurante_id, afiliado_id, codigo, origem)
    values (p_restaurante_id, v_af.id, v_af.codigo, 'pagamento')
    on conflict (indicado_restaurante_id) do nothing;

    select * into v_ind from public.indicacoes i where i.indicado_restaurante_id = p_restaurante_id for update;
  end if;

  if v_ind.pagou_em is null then
    update public.indicacoes set pagou_em = now() where indicado_restaurante_id = p_restaurante_id;
  end if;

  -- O benefício só conta depois do 2º mês pago.
  if public.indicacao_meses_pagos(p_restaurante_id) < 2 then return null; end if;

  select * into v_af from public.afiliados a where a.id = v_ind.afiliado_id;
  -- Benefício só para conta EasyFeed que indica (afiliado de fora ganha
  -- comissão em dinheiro), ativa, e nunca para si mesma.
  if v_af.restaurante_id is null or not v_af.ativo or v_af.restaurante_id = p_restaurante_id then
    return null;
  end if;

  v_pct := greatest(coalesce(v_af.comissao_valor, 0), 0);
  insert into public.indicacao_premios (restaurante_id, indicado_restaurante_id, beneficio, porcentagem)
  values (v_af.restaurante_id, p_restaurante_id,
          replace(trim(to_char(v_pct, 'FM990D##'), ',.'), '.', ',') || '% de desconto na mensalidade', v_pct)
  on conflict (indicado_restaurante_id) do nothing
  returning id into v_premio;

  return v_premio;
end;
$$;

-- ── A página Indicações (dos dois softwares) ─────────────────────────────
-- Cria o código da conta na primeira visita, com a % padrão do software dela.
-- NÃO devolve o nome de quem foi indicado: só as contagens e os benefícios.
create or replace function public.indicacao_minha()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rid  bigint;
  v_area text;
  v_af   public.afiliados%rowtype;
  v_nome text;
  v_pct  numeric;
begin
  if not public.indicacao_liberada() then
    return jsonb_build_object('liberado', false);
  end if;
  v_rid := public.get_user_restaurante_id();
  if v_rid is null then
    return jsonb_build_object('liberado', true, 'sem_restaurante', true);
  end if;
  v_area := public.area_da_conta(v_rid);

  select * into v_af from public.afiliados a where a.restaurante_id = v_rid;
  if v_af.id is null then
    select r.nome_restaurante into v_nome from public.restaurantes r where r.id = v_rid;
    select c.comissao_padrao into v_pct from public.afiliado_config c where c.area = v_area;
    begin
      insert into public.afiliados (nome, codigo, comissao_tipo, comissao_valor, ativo, restaurante_id, area, observacoes)
      values (coalesce(nullif(btrim(v_nome), ''), 'Conta ' || v_rid), public.indicacao_codigo_novo(v_nome),
              'porcentagem', coalesce(v_pct, 10), true, v_rid, v_area, 'Criado pela página Descontos → Indicações.')
      returning * into v_af;
    exception when unique_violation then
      -- Duas abas ao mesmo tempo: a outra já criou.
      select * into v_af from public.afiliados a where a.restaurante_id = v_rid;
    end;
  end if;

  return jsonb_build_object(
    'liberado',    true,
    'area',        v_area,
    'codigo',      v_af.codigo,
    'ativo',       v_af.ativo,
    'porcentagem', coalesce(v_af.comissao_valor, 0),
    'numeros', (
      select jsonb_build_object(
        'entraram',    count(*),
        'nao_pagaram', count(*) filter (where i.pagou_em is null),
        'usam',        count(*) filter (where i.pagou_em is not null and r.assinatura_status = 'ativa'),
        'pararam',     count(*) filter (where i.pagou_em is not null and r.assinatura_status is distinct from 'ativa'),
        'aguardando',  count(*) filter (where i.pagou_em is not null and r.assinatura_status = 'ativa'
                                          and public.indicacao_meses_pagos(i.indicado_restaurante_id) < 2),
        'liberados',   (select count(*) from public.indicacao_premios p where p.restaurante_id = v_rid and p.status <> 'cancelado'))
        from public.indicacoes i
        left join public.restaurantes r on r.id = i.indicado_restaurante_id
       where i.afiliado_id = v_af.id),
    'premios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'beneficio', p.beneficio, 'porcentagem', p.porcentagem, 'status', p.status,
               'criado_em', p.criado_em, 'aplicado_em', p.aplicado_em) order by p.criado_em desc)
        from public.indicacao_premios p
       where p.restaurante_id = v_rid), '[]'::jsonb)
  );
end;
$$;

-- ── Admin → Afiliados: o que cada afiliado de um software trouxe ─────────
create or replace function public.afiliados_numeros(p_area text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(a.id, jsonb_build_object(
             'entraram',   (select count(*) from public.indicacoes i where i.afiliado_id = a.id),
             'assinaram',  (select count(*) from public.indicacoes i where i.afiliado_id = a.id and i.pagou_em is not null),
             'usam',       (select count(*) from public.indicacoes i join public.restaurantes r on r.id = i.indicado_restaurante_id
                             where i.afiliado_id = a.id and i.pagou_em is not null and r.assinatura_status = 'ativa'),
             'premios',    coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', p.id, 'beneficio', p.beneficio, 'status', p.status, 'criado_em', p.criado_em, 'aplicado_em', p.aplicado_em,
                        'indicado', coalesce(nullif(btrim(ri.nome_restaurante), ''), 'Conta ' || p.indicado_restaurante_id))
                      order by (p.status = 'pendente') desc, p.criado_em desc)
                 from public.indicacao_premios p
                 left join public.restaurantes ri on ri.id = p.indicado_restaurante_id
                where a.restaurante_id is not null and p.restaurante_id = a.restaurante_id), '[]'::jsonb)))
      from public.afiliados a
     where a.area = case when p_area = 'rh' then 'rh' else 'restaurante' end), '{}'::jsonb);
end;
$$;

-- ── O código de um afiliado do RH vale como convite para o RH ────────────
create or replace function public.area_rh_permitida(p_convite text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.area_eh_admin()
      or exists (select 1 from public.area_config c
                  where c.id and (c.rh_modo = 'aberto' or (btrim(coalesce(p_convite, '')) <> '' and c.rh_convite = btrim(p_convite))))
      -- Link de indicação de quem é do RH: quem chega por ele pode escolher o RH.
      or exists (select 1 from public.afiliados a
                  where a.ativo and a.area = 'rh' and btrim(coalesce(p_convite, '')) <> '' and a.codigo = upper(btrim(p_convite)))
$$;

do $$
declare f text;
begin
  foreach f in array array['indicacao_meses_pagos(bigint)', 'indicacao_registrar_pagamento(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['indicacao_minha()', 'afiliados_numeros(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
