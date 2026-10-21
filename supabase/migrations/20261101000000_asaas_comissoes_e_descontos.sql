-- Asaas, fase 2 (decisões do Caio em 20/10/2026, em cima do painel do Raver de 21/10):
--
-- 1. Vendedor recebe a comissão pelo SPLIT do Asaas: o Asaas manda a parte
--    dele direto para a conta Asaas do vendedor (`asaas_wallet_id`) quando o
--    dinheiro da cobrança entra. A regra é a de `afiliado_config` (X% de uma
--    mensalidade na 2ª, Y% por Z meses), sempre sobre a mensalidade LÍQUIDA:
--    o que o Asaas entregou menos os nossos custos (`comissao_custos`). Cada
--    cobrança com comissão fica em `cobranca_comissoes` (o asaas-webhook grava).
-- 2. Quem compra pelo código de um vendedor ganha desconto: `desconto_pct`
--    nas `desconto_cobrancas` primeiras cobranças (cada vendedor tem o seu).
-- 3. O saldo do vídeo aprovado (`video_premios.valor_centavos`) abate a
--    próxima cobrança: reservar → confirmar no pagamento → soltar se a
--    cobrança sair sem ser paga (o mesmo jeito dos meses grátis de indicação).
-- 4. Limite dos vídeos por período: ano, semestre ou trimestre
--    (`video_config.periodo_meses`); `max_por_ano` passa a ser o máximo do período.
-- 5. Indicação: o bônus vale X% de uma mensalidade (`indicacao_config.bonus_pct`,
--    padrão 100 = a mensalidade inteira, como era).
--
-- Pode rodar mais de uma vez.

-- ── 1. Vendedor: carteira do Asaas e desconto de quem compra ──────────────
alter table public.afiliados
  add column if not exists asaas_wallet_id    text,
  add column if not exists desconto_pct       numeric not null default 0,
  add column if not exists desconto_cobrancas integer not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'afiliados_desconto_check') then
    alter table public.afiliados add constraint afiliados_desconto_check
      check (desconto_pct between 0 and 100 and desconto_cobrancas between 1 and 24);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'afiliados_wallet_check') then
    alter table public.afiliados add constraint afiliados_wallet_check
      check (asaas_wallet_id is null or asaas_wallet_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  end if;
end $$;
comment on column public.afiliados.asaas_wallet_id is
  'walletId da conta Asaas do vendedor: a comissão vai por split. Vazio = a comissão fica registrada para pagar à mão.';
comment on column public.afiliados.desconto_pct is
  'Desconto (%) de quem compra com o código deste vendedor, em cada uma das desconto_cobrancas primeiras cobranças.';

-- O desconto de um código, para a tela de compra mostrar antes de pagar.
create or replace function public.indicacao_desconto_do_codigo(p_codigo text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select jsonb_build_object('pct', a.desconto_pct, 'cobrancas', a.desconto_cobrancas)
      from public.afiliados a
     where a.codigo = upper(btrim(coalesce(p_codigo, '')))
       and a.ativo and a.restaurante_id is null and a.desconto_pct > 0
     limit 1
  ), jsonb_build_object('pct', 0, 'cobrancas', 0))
$$;
revoke execute on function public.indicacao_desconto_do_codigo(text) from public, anon;
grant execute on function public.indicacao_desconto_do_codigo(text) to authenticated;

-- ── 2. Os descontos de cada cobrança (para conferir e para não repetir) ───
alter table public.cobranca_pagamentos
  add column if not exists desconto_vendedor_centavos integer,
  add column if not exists saldo_video_centavos       integer;

-- ── 3. As comissões (uma por cobrança do indicado) ────────────────────────
create table if not exists public.cobranca_comissoes (
  id               uuid primary key default gen_random_uuid(),
  conta_id         text not null,
  asaas_payment_id text not null,
  assinatura_id    uuid references public.cobranca_assinaturas (id) on delete set null,
  -- O indicado (quem paga). Sem FK: a conta pode ser excluída e o histórico fica.
  restaurante_id   bigint,
  afiliado_id      uuid references public.afiliados (id) on delete set null,
  wallet_id        text,
  -- Quais meses do indicado esta cobrança cobre (1 = o 1º mês pago).
  mes_de           integer,
  mes_ate          integer,
  -- A base de UM mês: o líquido do Asaas menos os nossos custos (comissao_custos).
  base_mes_centavos integer,
  valor_centavos   integer not null check (valor_centavos >= 0),
  -- agendado: o split está na cobrança, sai quando o dinheiro entrar
  -- sem_carteira: o vendedor não tem conta Asaas cadastrada — pagar à mão
  -- repassado: o Asaas mandou; pago_manual: o admin marcou que pagou
  -- cancelado / estornado / bloqueado (divergência de valor) / erro
  status           text not null default 'agendado'
                   check (status in ('agendado', 'sem_carteira', 'repassado', 'pago_manual', 'cancelado', 'estornado', 'bloqueado', 'erro')),
  erro             text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (conta_id, asaas_payment_id)
);
alter table public.cobranca_comissoes add column if not exists base_mes_centavos integer;
create index if not exists cobranca_comissoes_afiliado on public.cobranca_comissoes (afiliado_id, criado_em desc);

-- Os nossos custos, que saem antes da comissão (decisão do Caio, 21/10/2026):
-- a comissão é sobre a mensalidade LÍQUIDA = o que o Asaas entregou (já sem a
-- taxa dele) − os custos de % (sobre esse valor) − os custos em R$ por mês.
-- "Mensalidade cheia" na 2ª = essa base inteira.
create table if not exists public.comissao_custos (
  id            uuid primary key default gen_random_uuid(),
  area          text not null check (area in ('restaurante', 'rh')),
  nome          text not null check (btrim(nome) <> ''),
  -- 'valor' = R$ por mês (em reais); 'porcentagem' = % do valor recebido.
  tipo          text not null check (tipo in ('valor', 'porcentagem')),
  valor         numeric not null check (valor >= 0),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (tipo <> 'porcentagem' or valor <= 100)
);
comment on table public.comissao_custos is
  'Admin → Vendedores: custos da empresa descontados antes de calcular a comissão (por software).';
alter table public.comissao_custos enable row level security;
drop policy if exists comissao_custos_admin on public.comissao_custos;
create policy comissao_custos_admin on public.comissao_custos
  for all to authenticated
  using      (exists (select 1 from public.platform_admins where lower(email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins where lower(email) = lower(auth.email())));
comment on table public.cobranca_comissoes is
  'Comissão do vendedor em cada cobrança do indicado (split do Asaas). Grava o asaas-webhook.';

alter table public.cobranca_comissoes enable row level security;
drop policy if exists cobranca_comissoes_admin_le on public.cobranca_comissoes;
create policy cobranca_comissoes_admin_le on public.cobranca_comissoes
  for select to authenticated
  using (exists (select 1 from public.platform_admins where lower(email) = lower(auth.email())));

-- O admin pagou à mão (sem conta Asaas, ou o split falhou).
create or replace function public.comissao_marcar_paga(p_id uuid)
returns boolean
language plpgsql volatile security definer set search_path = public
as $$
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  update public.cobranca_comissoes
     set status = 'pago_manual', erro = null, atualizado_em = now()
   where id = p_id and status in ('sem_carteira', 'erro', 'cancelado', 'bloqueado');
  return found;
end;
$$;
revoke execute on function public.comissao_marcar_paga(uuid) from public, anon;
grant execute on function public.comissao_marcar_paga(uuid) to authenticated;

-- Quais meses do indicado uma cobrança cobre: soma o peso das cobranças que
-- vêm antes (pagas, ou da mesma assinatura ainda em aberto). Peso: mensal e
-- cada parcela = 1; semestral/anual à vista = 6/12. Cobrança removida ou
-- estornada não conta (é a mesma conta de `indicacao_meses_pagos`).
create or replace function public.cobranca_meses_do_pagamento(p_conta_id text, p_asaas_payment_id text)
returns table (de integer, ate integer)
language sql stable security definer set search_path = public
as $$
  with pagamentos as (
    select p.id, p.assinatura_id, p.restaurante_id, p.status, p.vencimento, coalesce(p.numero_parcela, 0) as parcela,
           p.criado_em, p.valor_centavos, p.conta_id, p.asaas_payment_id,
           case when a.modalidade = 'recorrente'
                then case a.ciclo when 'semestral' then 6 when 'anual' then 12 else 1 end
                else 1 end as peso
      from public.cobranca_pagamentos p
      join public.cobranca_assinaturas a on a.id = p.assinatura_id
  ), alvo as (
    select * from pagamentos where conta_id = p_conta_id and asaas_payment_id = p_asaas_payment_id
  )
  select (coalesce(sum(o.peso), 0) + 1)::int, (coalesce(sum(o.peso), 0) + max(alvo.peso))::int
    from alvo
    left join pagamentos o
      on o.restaurante_id = alvo.restaurante_id
     and o.id <> alvo.id
     and o.valor_centavos > 0
     and o.status not in ('DELETED', 'REFUNDED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL')
     and (o.status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH') or o.assinatura_id = alvo.assinatura_id)
     and (o.vencimento, o.parcela, o.criado_em) < (alvo.vencimento, alvo.parcela, alvo.criado_em)
   group by alvo.id
$$;
revoke execute on function public.cobranca_meses_do_pagamento(text, text) from public, anon, authenticated;
grant execute on function public.cobranca_meses_do_pagamento(text, text) to service_role;

-- ── 4. Saldo do vídeo na cobrança ─────────────────────────────────────────
alter table public.video_premios
  add column if not exists reservado_pagamento text,
  add column if not exists aplicado_pagamento  text;
comment on column public.video_premios.reservado_pagamento is
  'Cobrança do Asaas (ou o pedido, na compra) em que o saldo entrou e que ainda não foi paga.';
create index if not exists video_premios_saldo on public.video_premios (restaurante_id, criado_em)
  where status = 'pendente' and valor_centavos > 0;

-- Os saldos que cabem nesta cobrança (até p_max_centavos), do mais antigo.
-- Evento repetido devolve o mesmo, com `repetido` (o webhook não abate de novo).
create or replace function public.video_reservar_saldo(p_restaurante_id bigint, p_chave text, p_max_centavos integer)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_total integer := 0;
  v_ids   uuid[] := '{}';
  v_p     record;
begin
  if p_restaurante_id is null or coalesce(p_chave, '') = '' or coalesce(p_max_centavos, 0) <= 0 then
    return jsonb_build_object('centavos', 0, 'premios', '[]'::jsonb);
  end if;

  select coalesce(sum(v.valor_centavos), 0), coalesce(array_agg(v.id), '{}') into v_total, v_ids
    from public.video_premios v
   where v.restaurante_id = p_restaurante_id
     and (v.reservado_pagamento = p_chave or v.aplicado_pagamento = p_chave);
  if cardinality(v_ids) > 0 then
    return jsonb_build_object('centavos', v_total, 'premios', to_jsonb(v_ids), 'repetido', true);
  end if;

  -- Reserva esquecida: a cobrança (ou o pedido) não está mais em aberto.
  update public.video_premios v
     set reservado_pagamento = null
   where v.restaurante_id = p_restaurante_id
     and v.status = 'pendente'
     and v.reservado_pagamento is not null
     and not exists (select 1 from public.cobranca_pagamentos cp
                      where cp.asaas_payment_id = v.reservado_pagamento and cp.status in ('PENDING', 'OVERDUE'))
     and not exists (select 1 from public.cobranca_assinaturas ca
                      where ca.id::text = v.reservado_pagamento and ca.status = 'aguardando');

  for v_p in
    select v.id, v.valor_centavos
      from public.video_premios v
     where v.restaurante_id = p_restaurante_id
       and v.status = 'pendente'
       and v.reservado_pagamento is null
       and coalesce(v.valor_centavos, 0) > 0
     order by v.criado_em, v.id
       for update
  loop
    exit when v_total + v_p.valor_centavos > p_max_centavos;
    update public.video_premios set reservado_pagamento = p_chave where id = v_p.id;
    v_total := v_total + v_p.valor_centavos;
    v_ids := v_ids || v_p.id;
  end loop;

  return jsonb_build_object('centavos', v_total, 'premios', to_jsonb(v_ids));
end;
$$;

-- A cobrança foi paga: os saldos dela (reservados por ela ou pelo pedido) foram usados.
create or replace function public.video_confirmar_saldo(p_pagamento text, p_pedido text)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare v_n integer;
begin
  update public.video_premios
     set status = 'aplicado', aplicado_em = now(), aplicado_por = 'asaas',
         aplicado_pagamento = p_pagamento, reservado_pagamento = null
   where status = 'pendente'
     and reservado_pagamento is not null
     and reservado_pagamento in (p_pagamento, coalesce(p_pedido, p_pagamento));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- A cobrança (ou o pedido) saiu sem ser paga: o saldo volta.
create or replace function public.video_soltar_saldo(p_chave text)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare v_n integer;
begin
  update public.video_premios
     set reservado_pagamento = null
   where reservado_pagamento = p_chave and status = 'pendente';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.video_reservar_saldo(bigint, text, integer) from public, anon, authenticated;
revoke execute on function public.video_confirmar_saldo(text, text) from public, anon, authenticated;
revoke execute on function public.video_soltar_saldo(text) from public, anon, authenticated;
grant execute on function public.video_reservar_saldo(bigint, text, integer) to service_role;
grant execute on function public.video_confirmar_saldo(text, text) to service_role;
grant execute on function public.video_soltar_saldo(text) to service_role;

-- ── 5. Limite dos vídeos por período ──────────────────────────────────────
alter table public.video_config add column if not exists periodo_meses integer not null default 12;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'video_config_periodo_check') then
    alter table public.video_config add constraint video_config_periodo_check check (periodo_meses in (3, 6, 12));
  end if;
end $$;
comment on column public.video_config.periodo_meses is
  'O limite de vídeos vale por período: 12 = ano, 6 = semestre (jan e jul), 3 = trimestre (jan, abr, jul, out).';
comment on column public.video_config.max_por_ano is
  'Máximo de vídeos aprovados por conta em cada período (periodo_meses). O nome ficou de quando era só por ano.';

-- O prêmio do vídeo aprovado: X% da mensalidade do software da conta, até o
-- limite do período. `recompensa_ordem` continua sendo a ordem no ano (a chave
-- única é por ano).
create or replace function public.video_envio_premio()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a integer;
  n integer;
  no_periodo integer;
  ar text;
  pct numeric;
  maximo integer;
  meses integer;
  inicio timestamptz;
  mensal integer;
  valor integer;
  texto text;
  local timestamp;
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    local := new.aprovado_em at time zone 'America/Sao_Paulo';
    a := extract(year from local)::int;
    -- N = vídeos aprovados da conta NESTE ano (a ordem do prêmio).
    select count(*) into n
      from public.video_envios
     where restaurante_id = new.restaurante_id and status = 'aprovado'
       and extract(year from (aprovado_em at time zone 'America/Sao_Paulo'))::int = a;

    ar := coalesce(public.area_da_conta(new.restaurante_id), 'restaurante');
    select c.saldo_pct_mensalidade, c.max_por_ano, c.periodo_meses into pct, maximo, meses
      from public.video_config c where c.area = ar;
    meses := coalesce(meses, 12);
    inicio := make_date(a, ((extract(month from local)::int - 1) / meses) * meses + 1, 1)::timestamp
              at time zone 'America/Sao_Paulo';
    select count(*) into no_periodo
      from public.video_envios
     where restaurante_id = new.restaurante_id and status = 'aprovado'
       and aprovado_em >= inicio;
    if maximo is not null and no_periodo > maximo then
      return new; -- passou do limite do período: o vídeo vale, sem saldo novo
    end if;

    select p.total_centavos into mensal
      from public.planos_precos p
     where p.area = ar and p.ciclo = 'mensal' and p.ativo
     order by p.atualizado_em desc nulls last
     limit 1;
    valor := round(coalesce(mensal, 0) * coalesce(pct, 50) / 100.0);
    if valor <= 0 then
      return new;
    end if;
    texto := 'Saldo de R$ ' || replace(to_char(valor / 100.0, 'FM999999990.00'), '.', ',')
      || ' (' || case when coalesce(pct, 50) = round(coalesce(pct, 50)) then round(coalesce(pct, 50))::text
                      else replace(round(pct, 2)::text, '.', ',') end
      || '% de uma mensalidade)';

    if exists (
      select 1 from public.video_premios
       where restaurante_id = new.restaurante_id and ano = a and recompensa_ordem = n
         and status <> 'cancelado' and envio_id <> new.id
    ) then
      return new;
    end if;
    insert into public.video_premios (restaurante_id, ano, recompensa_ordem, descricao, valor_centavos, envio_id)
    values (new.restaurante_id, a, n, texto, valor, new.id)
    on conflict (envio_id) do update
      set ano = excluded.ano, recompensa_ordem = excluded.recompensa_ordem, descricao = excluded.descricao,
          valor_centavos = excluded.valor_centavos, status = 'pendente', aplicado_em = null, aplicado_por = null
      where public.video_premios.status = 'cancelado';
  elsif old.status = 'aprovado' and new.status is distinct from 'aprovado' then
    -- Desaprovou: o saldo sai, se ainda não foi usado (nem reservado numa cobrança).
    update public.video_premios set status = 'cancelado'
     where envio_id = new.id and status = 'pendente' and reservado_pagamento is null;
  end if;
  return new;
end;
$function$;

-- ── 6. Indicação: quanto de uma mensalidade cada bônus vale ───────────────
alter table public.indicacao_config add column if not exists bonus_pct numeric not null default 100;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'indicacao_config_bonus_check') then
    alter table public.indicacao_config add constraint indicacao_config_bonus_check check (bonus_pct between 1 and 100);
  end if;
end $$;
comment on column public.indicacao_config.bonus_pct is
  'Quanto de UMA mensalidade cada indicado que paga o 2º mês vale para quem indicou (100 = a mensalidade inteira).';

create or replace function public.indicacao_admin_bonus_pct(p_pct numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  if p_pct is null or p_pct < 1 or p_pct > 100 then
    raise exception 'De 1%% a 100%%.' using errcode = '22023';
  end if;
  update public.indicacao_config set bonus_pct = round(p_pct, 2), atualizado_em = now(), atualizado_por = lower(auth.email());
  return round(p_pct, 2);
end;
$$;
revoke execute on function public.indicacao_admin_bonus_pct(numeric) from public, anon;
grant execute on function public.indicacao_admin_bonus_pct(numeric) to authenticated;

-- O bônus nasce com a % de agora (mudar a % depois não mexe nos que já existem).
create or replace function public.indicacao_registrar_pagamento(p_restaurante_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind    public.indicacoes%rowtype;
  v_af     public.afiliados%rowtype;
  v_pct    numeric;
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
  -- Só para conta EasyFeed que indica (vendedor ganha comissão em dinheiro),
  -- ativa, e nunca para si mesma.
  if not found or v_af.restaurante_id is null or not v_af.ativo or v_af.restaurante_id = p_restaurante_id then
    return null;
  end if;

  select c.bonus_pct into v_pct from public.indicacao_config c limit 1;
  v_pct := coalesce(v_pct, 100);

  insert into public.indicacao_premios (restaurante_id, indicado_restaurante_id, beneficio, porcentagem)
  values (v_af.restaurante_id, p_restaurante_id,
          case when v_pct >= 100 then '1 mensalidade grátis'
               when v_pct = round(v_pct) then round(v_pct)::text || '% de uma mensalidade'
               else replace(round(v_pct, 2)::text, '.', ',') || '% de uma mensalidade' end,
          v_pct)
  on conflict (indicado_restaurante_id) do nothing
  returning id into v_premio;
  return v_premio;
end;
$$;

-- A reserva devolve também a soma das % (`pct`): o webhook abate pct/100 mensalidades.
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
  v_pct  numeric := 0;
begin
  if p_restaurante_id is null or coalesce(p_pagamento, '') = '' then
    return jsonb_build_object('meses', 0, 'pct', 0, 'premios', '[]'::jsonb);
  end if;

  select coalesce(array_agg(p.id), '{}'), coalesce(sum(coalesce(p.porcentagem, 100)), 0) into v_ids, v_pct
    from public.indicacao_premios p
   where p.restaurante_id = p_restaurante_id
     and (p.reservado_pagamento = p_pagamento or p.aplicado_pagamento = p_pagamento);
  if cardinality(v_ids) > 0 then
    return jsonb_build_object('meses', cardinality(v_ids), 'pct', v_pct, 'premios', to_jsonb(v_ids), 'repetido', true);
  end if;

  select c.meses_para_renovacao into v_min from public.indicacao_config c limit 1;
  v_min := coalesce(v_min, 4);

  for v_p in
    select p.id, p.indicado_restaurante_id, coalesce(p.porcentagem, 100) as pct
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
      v_pct := v_pct + v_p.pct;
    end if;
    -- 'atrasado', ou pouco tempo pago no semestral/anual: fica na fila.
  end loop;

  return jsonb_build_object('meses', cardinality(v_ids), 'pct', v_pct, 'premios', to_jsonb(v_ids));
end;
$$;

notify pgrst, 'reload schema';
