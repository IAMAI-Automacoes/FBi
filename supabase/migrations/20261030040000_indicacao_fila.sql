-- Indicações: a fila de meses grátis com validação espelhada ("proteção de
-- caixa", regra do Raver em 17/10/2026). Substitui a escada de níveis
-- (20261030030000), que sai.
--
--  1. Gatilho: o indicado paga o 1º mês → nada; paga o 2º → nasce 1 bônus
--     (1 mensalidade grátis) para o padrinho, que entra na fila.
--  2. Fila: no plano mensal, o padrinho usa no máximo 1 bônus por mês, na
--     ordem em que eles nasceram.
--  3. Validação espelhada: quando o Asaas cria a renovação do padrinho, o
--     webhook pede um bônus (`indicacao_reservar_bonus`), que confere o
--     indicado de cada bônus, do mais antigo para o mais novo:
--       - assinatura ativa  → vale: a mensalidade sai (mês grátis) e o bônus
--         fica "usado";
--       - cancelou (churn)  → descartado, e passa para o próximo;
--       - cartão recusado (assinatura atrasada) → não vale neste mês, mas
--         fica na fila (decisão do Raver: o cartão segue tentando até cancelar).
--  Plano semestral/anual do padrinho ("bônus consolidado", também do Raver):
--  na renovação, abate de uma vez 1 mensalidade por bônus cujo indicado está
--  ativo E já pagou pelo menos N meses (ou comprou semestral/anual) — até os
--  meses do plano. Os outros ficam retidos para a próxima renovação.
--  N = `indicacao_config.meses_para_renovacao` (começa em 4; ele falou "3 ou
--  4", fica o lado seguro, e muda no Admin → Afiliados).
--
-- O webhook `asaas-webhook` reserva (na criação da cobrança), confirma (no
-- pagamento, ou na hora, quando a cobrança inteira sai) e solta (cobrança
-- removida ou estornada sem pagar) — sempre por estas funções.

-- ── Sai a escada ─────────────────────────────────────────────────────────────
drop function if exists public.indicacao_liberar_niveis(bigint);
drop table if exists public.indicacao_niveis;
drop index if exists public.indicacao_premios_nivel;
alter table public.indicacao_premios drop column if exists nivel;

-- ── O bônus na fila ──────────────────────────────────────────────────────────
alter table public.indicacao_premios
  add column if not exists reservado_pagamento text,
  add column if not exists aplicado_pagamento text,
  add column if not exists descartado_em timestamptz,
  add column if not exists motivo text;
comment on column public.indicacao_premios.reservado_pagamento is
  'Cobrança do Asaas em que o bônus entrou e que ainda não foi paga.';
comment on column public.indicacao_premios.aplicado_pagamento is
  'Cobrança do Asaas em que o bônus foi usado.';
create index if not exists indicacao_premios_reservado on public.indicacao_premios (reservado_pagamento) where reservado_pagamento is not null;
create index if not exists indicacao_premios_fila on public.indicacao_premios (restaurante_id, criado_em) where status = 'pendente';

alter table public.indicacao_config
  add column if not exists meses_para_renovacao integer not null default 4
  check (meses_para_renovacao between 1 and 24);

-- ── A checagem do indicado ───────────────────────────────────────────────────
-- 'ativo': tem assinatura ativa (recorrente, ou parcelado dentro do período);
-- 'atrasado': a recorrente está com a cobrança atrasada (cartão recusado);
-- 'saiu': cancelou, encerrou, foi estornado ou nunca teve.
create or replace function public.indicacao_situacao_do_indicado(p_restaurante_id bigint)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when p_restaurante_id is null then 'saiu'
    when exists (select 1 from public.cobranca_assinaturas c
                  where c.restaurante_id = p_restaurante_id and c.status = 'ativa'
                    and (c.modalidade = 'recorrente' or c.periodo_fim > now())) then 'ativo'
    when exists (select 1 from public.cobranca_assinaturas c
                  where c.restaurante_id = p_restaurante_id and c.status = 'atrasada') then 'atrasado'
    else 'saiu'
  end
$$;

-- Para a renovação semestral/anual: o indicado já se pagou?
create or replace function public.indicacao_indicado_firme(p_restaurante_id bigint, p_meses integer)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.indicacao_meses_pagos(p_restaurante_id) >= p_meses
      or exists (select 1 from public.cobranca_assinaturas c
                  where c.restaurante_id = p_restaurante_id and c.status = 'ativa' and c.ciclo in ('semestral', 'anual'))
$$;

-- ── Reservar, confirmar e soltar (o webhook do Asaas chama) ──────────────────
-- Os bônus que entram nesta cobrança do padrinho. Evento repetido devolve os
-- mesmos, com `repetido` (o webhook não abate de novo).
create or replace function public.indicacao_reservar_bonus(p_restaurante_id bigint, p_ciclo text, p_pagamento text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_max  integer := case p_ciclo when 'semestral' then 6 when 'anual' then 12 else 1 end;
  v_min  integer;
  v_p    record;
  v_sit  text;
  v_ids  uuid[] := '{}';
begin
  if p_restaurante_id is null or coalesce(p_pagamento, '') = '' then
    return jsonb_build_object('meses', 0, 'premios', '[]'::jsonb);
  end if;

  select coalesce(array_agg(p.id), '{}') into v_ids
    from public.indicacao_premios p
   where p.restaurante_id = p_restaurante_id
     and (p.reservado_pagamento = p_pagamento or p.aplicado_pagamento = p_pagamento);
  if cardinality(v_ids) > 0 then
    return jsonb_build_object('meses', cardinality(v_ids), 'premios', to_jsonb(v_ids), 'repetido', true);
  end if;

  select c.meses_para_renovacao into v_min from public.indicacao_config c limit 1;
  v_min := coalesce(v_min, 4);

  for v_p in
    select p.id, p.indicado_restaurante_id
      from public.indicacao_premios p
     where p.restaurante_id = p_restaurante_id
       and p.status = 'pendente'
       and p.reservado_pagamento is null
     order by p.criado_em, p.id
       for update
  loop
    exit when cardinality(v_ids) >= v_max;
    v_sit := public.indicacao_situacao_do_indicado(v_p.indicado_restaurante_id);
    if v_sit = 'saiu' then
      update public.indicacao_premios
         set status = 'cancelado', descartado_em = now(), motivo = 'indicado_cancelou'
       where id = v_p.id;
    elsif v_sit = 'ativo' and (v_max = 1 or public.indicacao_indicado_firme(v_p.indicado_restaurante_id, v_min)) then
      update public.indicacao_premios set reservado_pagamento = p_pagamento where id = v_p.id;
      v_ids := v_ids || v_p.id;
    end if;
    -- 'atrasado', ou pouco tempo pago no semestral/anual: fica na fila.
  end loop;

  return jsonb_build_object('meses', cardinality(v_ids), 'premios', to_jsonb(v_ids));
end;
$$;

-- A cobrança foi paga (ou saiu inteira, no mês grátis): os bônus dela foram usados.
create or replace function public.indicacao_confirmar_bonus(p_pagamento text)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare v_n integer;
begin
  update public.indicacao_premios
     set status = 'aplicado', aplicado_em = now(), aplicado_por = 'asaas',
         aplicado_pagamento = p_pagamento, reservado_pagamento = null
   where reservado_pagamento = p_pagamento and status = 'pendente';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- A cobrança saiu ou foi estornada sem ser paga: os bônus voltam para a fila.
create or replace function public.indicacao_soltar_bonus(p_pagamento text)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare v_n integer;
begin
  update public.indicacao_premios
     set reservado_pagamento = null
   where reservado_pagamento = p_pagamento and status = 'pendente';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.indicacao_situacao_do_indicado(bigint) from public, anon, authenticated;
revoke execute on function public.indicacao_indicado_firme(bigint, integer) from public, anon, authenticated;
revoke execute on function public.indicacao_reservar_bonus(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.indicacao_confirmar_bonus(text) from public, anon, authenticated;
revoke execute on function public.indicacao_soltar_bonus(text) from public, anon, authenticated;
grant execute on function public.indicacao_situacao_do_indicado(bigint) to service_role;
grant execute on function public.indicacao_indicado_firme(bigint, integer) to service_role;
grant execute on function public.indicacao_reservar_bonus(bigint, text, text) to service_role;
grant execute on function public.indicacao_confirmar_bonus(text) to service_role;
grant execute on function public.indicacao_soltar_bonus(text) to service_role;

-- ── O gatilho: 2º mês pago do indicado → 1 bônus na fila do padrinho ─────────
create or replace function public.indicacao_registrar_pagamento(p_restaurante_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind    public.indicacoes%rowtype;
  v_af     public.afiliados%rowtype;
  v_premio uuid;
begin
  if p_restaurante_id is null then return null; end if;

  select * into v_ind from public.indicacoes i where i.indicado_restaurante_id = p_restaurante_id for update;
  if not found then return null; end if;

  if v_ind.pagou_em is null then
    update public.indicacoes set pagou_em = now() where indicado_restaurante_id = p_restaurante_id;
  end if;

  -- O bônus só nasce no 2º mês pago.
  if public.indicacao_meses_pagos(p_restaurante_id) < 2 then return null; end if;

  select * into v_af from public.afiliados a where a.id = v_ind.afiliado_id;
  -- Só para conta EasyFeed que indica (afiliado de fora ganha comissão em
  -- dinheiro), ativa, e nunca para si mesma.
  if not found or v_af.restaurante_id is null or not v_af.ativo or v_af.restaurante_id = p_restaurante_id then
    return null;
  end if;

  insert into public.indicacao_premios (restaurante_id, indicado_restaurante_id, beneficio, porcentagem)
  values (v_af.restaurante_id, p_restaurante_id, '1 mensalidade grátis', 100)
  on conflict (indicado_restaurante_id) do nothing
  returning id into v_premio;
  return v_premio;
end;
$$;

-- ── Admin: mudar à mão e o mínimo de meses da renovação ──────────────────────
create or replace function public.indicacao_admin_premio(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  if p_status not in ('pendente', 'aplicado', 'cancelado') then
    return jsonb_build_object('ok', false, 'motivo', 'status_invalido');
  end if;

  update public.indicacao_premios
     set status              = p_status,
         aplicado_em         = case when p_status = 'aplicado' then now() end,
         aplicado_por        = case when p_status = 'aplicado' then lower(auth.email()) end,
         aplicado_pagamento  = case when p_status = 'aplicado' then aplicado_pagamento end,
         reservado_pagamento = case when p_status = 'pendente' then reservado_pagamento end,
         descartado_em       = case when p_status = 'cancelado' then now() end,
         motivo              = case when p_status = 'cancelado' then 'admin' end
   where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'premio_nao_encontrado');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.indicacao_admin_meses_renovacao(p_meses integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  if p_meses is null or p_meses < 1 or p_meses > 24 then
    raise exception 'De 1 a 24 meses.' using errcode = '22023';
  end if;
  update public.indicacao_config set meses_para_renovacao = p_meses, atualizado_em = now(), atualizado_por = lower(auth.email());
  return p_meses;
end;
$$;
revoke execute on function public.indicacao_admin_meses_renovacao(integer) from public, anon;
grant execute on function public.indicacao_admin_meses_renovacao(integer) to authenticated;

-- ── A página Descontos → Indicações ──────────────────────────────────────────
create or replace function public.indicacao_minha()
returns jsonb
language plpgsql
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
    'liberado', true,
    'area',     v_area,
    'codigo',   v_af.codigo,
    'ativo',    v_af.ativo,
    'numeros', (
      select jsonb_build_object(
        'entraram',    count(*),
        'nao_pagaram', count(*) filter (where m.meses = 0),
        'a_caminho',   count(*) filter (where m.meses = 1 and r.assinatura_status = 'ativa'),
        'contam',      count(*) filter (where m.meses >= 2))
        from public.indicacoes i
        left join public.restaurantes r on r.id = i.indicado_restaurante_id
       cross join lateral (select public.indicacao_meses_pagos(i.indicado_restaurante_id) as meses) m
       where i.afiliado_id = v_af.id),
    -- A fila primeiro (na ordem em que vai ser usada), depois os usados e os
    -- descartados, do mais recente para o mais antigo. Sem dizer quem é o indicado.
    'bonus', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'status', p.status, 'criado_em', p.criado_em, 'aplicado_em', p.aplicado_em,
               'descartado_em', p.descartado_em, 'motivo', p.motivo, 'reservado', p.reservado_pagamento is not null)
             order by (p.status = 'pendente') desc,
                      case when p.status = 'pendente' then p.criado_em end asc,
                      coalesce(p.aplicado_em, p.descartado_em, p.criado_em) desc)
        from public.indicacao_premios p
       where p.restaurante_id = v_rid), '[]'::jsonb)
  );
end;
$$;

-- ── Admin → Afiliados ────────────────────────────────────────────────────────
create or replace function public.afiliados_numeros(p_area text)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_area text := case when p_area = 'rh' then 'rh' else 'restaurante' end;
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(a.id, jsonb_build_object(
             'entraram',  (select count(*) from public.indicacoes i where i.afiliado_id = a.id),
             'assinaram', (select count(*) from public.indicacoes i where i.afiliado_id = a.id
                             and public.indicacao_meses_pagos(i.indicado_restaurante_id) >= 1),
             'usam',      (select count(*) from public.indicacoes i join public.restaurantes r on r.id = i.indicado_restaurante_id
                             where i.afiliado_id = a.id and r.assinatura_status = 'ativa'
                               and public.indicacao_meses_pagos(i.indicado_restaurante_id) >= 1),
             'contam',    public.indicacao_contam(a.id),
             'premios',   coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', p.id, 'beneficio', p.beneficio, 'status', p.status, 'criado_em', p.criado_em,
                        'aplicado_em', p.aplicado_em, 'descartado_em', p.descartado_em, 'motivo', p.motivo,
                        'reservado', p.reservado_pagamento is not null, 'aplicado_por', p.aplicado_por,
                        'indicado', coalesce(nullif(btrim(ri.nome_restaurante), ''), 'Conta ' || p.indicado_restaurante_id))
                      order by (p.status = 'pendente') desc, p.criado_em)
                 from public.indicacao_premios p
                 left join public.restaurantes ri on ri.id = p.indicado_restaurante_id
                where a.restaurante_id is not null and p.restaurante_id = a.restaurante_id), '[]'::jsonb)))
      from public.afiliados a
     where a.area = v_area), '{}'::jsonb);
end;
$$;
