-- Cobrança pelo Asaas — Fase 1: vender e liberar o acesso.
--
-- Decisões (15/10/2026, ver CLAUDE.md → Cobrança):
--   - O sistema cria o cliente e a assinatura (ou o parcelamento) pela API do
--     Asaas, com o nosso id, e manda a pessoa para a fatura do Asaas. O cartão
--     nunca passa por nós. O webhook (`asaas-webhook`) é quem libera o acesso.
--   - Recorrente (mensal, semestral, anual) no cartão; parcelado (semestral 6x,
--     anual 12x) pelo mesmo total, sem renovação automática e com 7 dias de
--     carência depois do período.
--   - Cada conta do Asaas (hoje só o MEI) é uma linha de `contas_cobranca`, e
--     tudo guarda em qual conta está: prepara a troca de CNPJ. A chave de API
--     fica em secret (`ASAAS_CONTA_<ID>_API_KEY`), nunca no banco.
--   - Descontos: o do cupom entra na 1ª cobrança; o bônus de indicação, em uma
--     mensalidade (padrão provisório, a confirmar com o Raver). Consumidos uma
--     vez: `cupons_usos.aplicado_em` e `indicacao_premios.status = 'aplicado'`.
--
-- O sandbox e a produção do Asaas gravam neste mesmo banco. Antes de ligar a
-- conta de produção, rodar a limpeza comentada no fim deste arquivo.
--
-- Pode rodar mais de uma vez.

-- ─────────────────────────────────────────────────────────────
-- 1. Contas do Asaas
-- ─────────────────────────────────────────────────────────────
create table if not exists public.contas_cobranca (
  id                  text primary key check (id ~ '^[a-z0-9_]{2,20}$'),
  nome                text not null,
  ambiente            text not null default 'sandbox' check (ambiente in ('sandbox', 'producao')),
  recebe_novas_vendas boolean not null default false,
  ativa               boolean not null default true,
  criado_em           timestamptz not null default now()
);
comment on table public.contas_cobranca is
  'Contas do Asaas (hoje só o MEI). A chave fica no secret ASAAS_CONTA_<ID>_API_KEY. Só uma recebe as vendas novas.';

create unique index if not exists contas_cobranca_uma_recebe_novas
  on public.contas_cobranca ((true)) where recebe_novas_vendas;

insert into public.contas_cobranca (id, nome, ambiente, recebe_novas_vendas)
values ('mei', 'MEI Guilherme (EasyFeed)', 'sandbox', true)
on conflict (id) do nothing;

alter table public.contas_cobranca enable row level security;
drop policy if exists contas_cobranca_admin on public.contas_cobranca;
create policy contas_cobranca_admin on public.contas_cobranca
  for all to authenticated
  using      (exists (select 1 from public.platform_admins where email = auth.email()))
  with check (exists (select 1 from public.platform_admins where email = auth.email()));

-- ─────────────────────────────────────────────────────────────
-- 2. Parcelado nos preços (mesmo total do à vista)
-- ─────────────────────────────────────────────────────────────
alter table public.planos_precos add column if not exists parcelas_max integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planos_precos_parcelas_max_check') then
    alter table public.planos_precos add constraint planos_precos_parcelas_max_check
      check (parcelas_max is null or parcelas_max between 2 and 12);
  end if;
end $$;
comment on column public.planos_precos.parcelas_max is
  'Em quantas vezes o ciclo pode ser parcelado no cartão, pelo mesmo total. Nulo = só recorrente.';

update public.planos_precos
   set parcelas_max = case ciclo when 'semestral' then 6 when 'anual' then 12 end
 where parcelas_max is null and ciclo in ('semestral', 'anual');

-- ─────────────────────────────────────────────────────────────
-- 3. Clientes, assinaturas, pagamentos e eventos
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cobranca_clientes (
  id                uuid primary key default gen_random_uuid(),
  conta_id          text not null references public.contas_cobranca (id),
  restaurante_id    bigint not null references public.restaurantes (id) on delete cascade,
  asaas_customer_id text not null,
  cpf_cnpj          text not null,
  criado_em         timestamptz not null default now(),
  unique (conta_id, restaurante_id),
  unique (conta_id, asaas_customer_id)
);
comment on table public.cobranca_clientes is 'O cliente do Asaas de cada conta EasyFeed, por conta do Asaas.';

-- O pedido e o contrato numa linha só: nasce `aguardando` quando a pessoa vai
-- para a fatura, vira `ativa` no primeiro pagamento.
create table if not exists public.cobranca_assinaturas (
  id                         uuid primary key default gen_random_uuid(),
  conta_id                   text not null references public.contas_cobranca (id),
  restaurante_id             bigint references public.restaurantes (id) on delete set null,
  area                       text not null default 'restaurante' check (area in ('restaurante', 'rh')),
  modalidade                 text not null check (modalidade in ('recorrente', 'parcelado')),
  ciclo                      text not null check (ciclo in ('mensal', 'semestral', 'anual')),
  parcelas                   integer check (parcelas is null or parcelas between 2 and 12),
  -- `sub_…` (recorrente) ou o id do parcelamento. Nulo só enquanto é criado.
  asaas_id                   text,
  asaas_customer_id          text not null,
  status                     text not null default 'aguardando'
                               check (status in ('aguardando', 'ativa', 'atrasada', 'cancelada', 'encerrada', 'expirada')),
  -- Total cheio de cada ciclo (recorrente) ou do parcelamento, em centavos.
  valor_centavos             integer not null check (valor_centavos > 0),
  -- O que a 1ª cobrança custou, já com o desconto do cupom.
  primeira_cobranca_centavos integer,
  -- Até quando o pagamento cobre o acesso.
  periodo_fim                timestamptz,
  afiliado_id                uuid references public.afiliados (id) on delete set null,
  cupom_uso_id               uuid references public.cupons_usos (id) on delete set null,
  termos_versao              text,
  criada_em                  timestamptz not null default now(),
  atualizada_em              timestamptz not null default now(),
  cancelada_em               timestamptz,
  unique (conta_id, asaas_id)
);
create index if not exists cobranca_assinaturas_restaurante on public.cobranca_assinaturas (restaurante_id, status);
comment on table public.cobranca_assinaturas is
  'Assinatura recorrente ou parcelamento no Asaas. Grava só o servidor (criar-cobranca, asaas-webhook).';

create table if not exists public.cobranca_pagamentos (
  id               uuid primary key default gen_random_uuid(),
  conta_id         text not null references public.contas_cobranca (id),
  asaas_payment_id text not null,
  assinatura_id    uuid references public.cobranca_assinaturas (id) on delete set null,
  restaurante_id   bigint references public.restaurantes (id) on delete set null,
  numero_parcela   integer,
  -- Status cru do Asaas (PENDING, CONFIRMED, RECEIVED, OVERDUE, REFUNDED…).
  status           text not null,
  valor_centavos   integer not null,
  liquido_centavos integer,
  vencimento       date,
  pago_em          timestamptz,
  credito_em       date,
  invoice_url      text,
  cupom_uso_id     uuid references public.cupons_usos (id) on delete set null,
  premio_id        uuid references public.indicacao_premios (id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (conta_id, asaas_payment_id)
);
create index if not exists cobranca_pagamentos_restaurante on public.cobranca_pagamentos (restaurante_id, status);
create index if not exists cobranca_pagamentos_assinatura on public.cobranca_pagamentos (assinatura_id);
comment on table public.cobranca_pagamentos is 'Cada cobrança do Asaas (mensalidade, ciclo ou parcela), espelhada pelo webhook.';

create table if not exists public.cobranca_eventos_webhook (
  conta_id      text not null references public.contas_cobranca (id),
  event_id      text not null,
  tipo          text not null,
  status        text not null default 'processando' check (status in ('processando', 'ok', 'erro')),
  erro          text,
  -- Evento inteiro, para investigar. Apagado depois de 90 dias (dados pessoais).
  payload       jsonb,
  recebido_em   timestamptz not null default now(),
  processado_em timestamptz,
  primary key (conta_id, event_id)
);
comment on table public.cobranca_eventos_webhook is 'Idempotência do asaas-webhook: um evento por id, por conta.';

-- Leitura: o dono vê as suas; o admin da plataforma vê todas. Ninguém grava
-- pelo client (sem policy de escrita; o service_role passa por cima da RLS).
alter table public.cobranca_clientes        enable row level security;
alter table public.cobranca_assinaturas     enable row level security;
alter table public.cobranca_pagamentos      enable row level security;
alter table public.cobranca_eventos_webhook enable row level security;

drop policy if exists cobranca_clientes_leitura on public.cobranca_clientes;
create policy cobranca_clientes_leitura on public.cobranca_clientes
  for select to authenticated
  using (restaurante_id = public.get_user_restaurante_id()
         or exists (select 1 from public.platform_admins where email = auth.email()));

drop policy if exists cobranca_assinaturas_leitura on public.cobranca_assinaturas;
create policy cobranca_assinaturas_leitura on public.cobranca_assinaturas
  for select to authenticated
  using (restaurante_id = public.get_user_restaurante_id()
         or exists (select 1 from public.platform_admins where email = auth.email()));

drop policy if exists cobranca_pagamentos_leitura on public.cobranca_pagamentos;
create policy cobranca_pagamentos_leitura on public.cobranca_pagamentos
  for select to authenticated
  using (restaurante_id = public.get_user_restaurante_id()
         or exists (select 1 from public.platform_admins where email = auth.email()));

drop policy if exists cobranca_eventos_admin on public.cobranca_eventos_webhook;
create policy cobranca_eventos_admin on public.cobranca_eventos_webhook
  for select to authenticated
  using (exists (select 1 from public.platform_admins where email = auth.email()));

-- Payload dos eventos some depois de 90 dias.
do $$ begin perform cron.unschedule('limpar-payload-eventos-asaas'); exception when others then null; end $$;
select cron.schedule(
  'limpar-payload-eventos-asaas',
  '15 4 * * *',
  $$ update public.cobranca_eventos_webhook set payload = null
      where payload is not null and recebido_em < now() - interval '90 days'; $$
);

-- ─────────────────────────────────────────────────────────────
-- 4. Desconto do cupom: consumido uma vez
-- ─────────────────────────────────────────────────────────────
alter table public.cupons_usos add column if not exists aplicado_em timestamptz;
alter table public.cupons_usos add column if not exists aplicado_pagamento text;
comment on column public.cupons_usos.aplicado_em is
  'Quando o desconto entrou numa cobrança do Asaas. Nulo = ainda guardado.';

-- ─────────────────────────────────────────────────────────────
-- 5. De onde vem o acesso
-- ─────────────────────────────────────────────────────────────
alter table public.restaurantes add column if not exists assinatura_origem text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurantes_assinatura_origem_check') then
    alter table public.restaurantes add constraint restaurantes_assinatura_origem_check
      check (assinatura_origem is null
             or assinatura_origem in ('asaas_recorrente', 'asaas_parcelado', 'cupom', 'manual'));
  end if;
end $$;
comment on column public.restaurantes.assinatura_origem is
  'De onde vem o acesso: asaas_recorrente (o webhook rege), asaas_parcelado (vence com 7 dias de carência), cupom ou manual (vencem pela data).';

-- Quem já tem acesso hoje: cupom se resgatou algum, senão liberação manual.
update public.restaurantes r
   set assinatura_origem = case
         when exists (select 1 from public.cupons_usos u where u.restaurante_id = r.id) then 'cupom'
         else 'manual' end
 where r.assinatura_origem is null and r.assinatura_status = 'ativa';

-- Igual à versão de 20261028000000_remover_stripe.sql, mais `assinatura_origem`.
create or replace function public.proteger_colunas_assinatura()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  claims text := current_setting('request.jwt.claims', true);
  papel  text := nullif(claims, '')::jsonb ->> 'role';
  padrao text;
begin
  if claims is null or claims = '' then
    return new;
  end if;
  if papel = 'service_role' then
    return new;
  end if;
  if exists (select 1 from public.platform_admins where email = auth.email()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.assinatura_status       := 'sem_assinatura';
    new.assinatura_origem       := null;
    new.plano_ciclo             := null;
    new.assinatura_expira_em    := null;
    new.assinatura_cancelada_em := null;
    new.excluida_em             := null;
    new.area                    := null;
    -- O crédito de IA volta para o padrão da coluna, seja ele qual for.
    select pg_get_expr(d.adbin, d.adrelid) into padrao
      from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'public.restaurantes'::regclass and a.attname = 'credito_ia_limite_usd';
    if padrao is null then new.credito_ia_limite_usd := null;
    else execute 'select (' || padrao || ')::numeric' into new.credito_ia_limite_usd; end if;
    new.credito_ia_ciclo_inicio := now();
    return new;
  end if;

  if new.assinatura_status       is distinct from old.assinatura_status
     or new.assinatura_origem       is distinct from old.assinatura_origem
     or new.plano_ciclo             is distinct from old.plano_ciclo
     or new.assinatura_expira_em    is distinct from old.assinatura_expira_em
     or new.assinatura_cancelada_em is distinct from old.assinatura_cancelada_em
     or new.excluida_em             is distinct from old.excluida_em
     or new.credito_ia_limite_usd   is distinct from old.credito_ia_limite_usd
     or new.credito_ia_ciclo_inicio is distinct from old.credito_ia_ciclo_inicio
  then
    raise exception 'Campos de assinatura só podem ser alterados pelo servidor ou por um admin da plataforma';
  end if;

  if new.area is distinct from old.area
     and coalesce(current_setting('easyfeed.escolhendo_area', true), '') <> '1' then
    raise exception 'A versão da conta é definida na escolha inicial; depois, só um admin da plataforma troca';
  end if;

  return new;
end;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 6. Projeção: cobranças do Asaas → acesso da conta
-- ─────────────────────────────────────────────────────────────
-- Chamada pelo webhook depois de cada mudança. Olha TODAS as cobranças da
-- conta, então uma assinatura antiga que termina não derruba o acesso de outra
-- vigente. Acesso por cupom ou liberação manual ainda válido não é tocado por
-- cobrança atrasada ou encerrada.
create or replace function public.cobranca_aplicar(p_restaurante_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.restaurantes%rowtype;
  a public.cobranca_assinaturas%rowtype;
  acesso_proprio boolean;
begin
  select * into r from public.restaurantes where id = p_restaurante_id for update;
  if not found then return null; end if;

  -- Acesso por cupom ou manual ainda válido.
  acesso_proprio := r.assinatura_status = 'ativa'
    and coalesce(r.assinatura_origem, 'manual') in ('cupom', 'manual')
    and (r.assinatura_expira_em is null or r.assinatura_expira_em > now());

  -- 1) Algo que dá acesso: recorrente ativa; parcelado ativo dentro do período
  --    mais a carência; recorrente cancelada com período pago pela frente.
  select * into a
    from public.cobranca_assinaturas c
   where c.restaurante_id = p_restaurante_id
     and (   (c.status = 'ativa' and c.modalidade = 'recorrente')
          or (c.status = 'ativa' and c.modalidade = 'parcelado' and c.periodo_fim > now() - interval '7 days')
          or (c.status = 'cancelada' and c.modalidade = 'recorrente' and c.periodo_fim > now()))
   order by (c.status = 'ativa') desc, c.periodo_fim desc nulls first
   limit 1;
  if found then
    update public.restaurantes
       set assinatura_status       = 'ativa',
           assinatura_origem       = case a.modalidade when 'recorrente' then 'asaas_recorrente' else 'asaas_parcelado' end,
           plano_ciclo             = a.ciclo,
           assinatura_expira_em    = a.periodo_fim,
           assinatura_cancelada_em = case when a.status = 'cancelada' then coalesce(a.cancelada_em, now()) end
     where id = p_restaurante_id;
    return 'ativa';
  end if;

  -- 2) Recorrente com pagamento atrasado: inadimplente (regulariza a mesma).
  select * into a
    from public.cobranca_assinaturas c
   where c.restaurante_id = p_restaurante_id and c.status = 'atrasada'
   order by c.atualizada_em desc
   limit 1;
  if found then
    if acesso_proprio then return 'mantido'; end if;
    update public.restaurantes
       set assinatura_status = 'inadimplente',
           assinatura_origem = 'asaas_recorrente',
           plano_ciclo       = a.ciclo
     where id = p_restaurante_id;
    return 'inadimplente';
  end if;

  -- 3) Nada vigente no Asaas: só encerra se o acesso atual era do Asaas.
  if r.assinatura_origem like 'asaas_%' and r.assinatura_status in ('ativa', 'inadimplente') then
    update public.restaurantes
       set assinatura_status       = 'cancelada',
           assinatura_cancelada_em = coalesce(r.assinatura_cancelada_em, now())
     where id = p_restaurante_id;
    return 'cancelada';
  end if;
  return 'mantido';
end;
$$;

-- A conta tem cobrança no Asaas que ainda vale (trava do cupom de acesso e de
-- uma segunda compra).
create or replace function public.cobranca_vigente(p_restaurante_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cobranca_assinaturas c
     where c.restaurante_id = p_restaurante_id
       and (   (c.modalidade = 'recorrente' and c.status in ('ativa', 'atrasada'))
            or (c.modalidade = 'parcelado'  and c.status = 'ativa' and c.periodo_fim > now())))
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. Expiração por data
-- ─────────────────────────────────────────────────────────────
--   - cupom e manual: vencem na data (como antes);
--   - parcelado: vence 7 dias depois da data (carência);
--   - recorrente: quem rege é o webhook; só vence pela data se foi cancelada.
create or replace function public.expirar_assinaturas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.cobranca_assinaturas
     set status = 'encerrada', atualizada_em = now()
   where modalidade = 'parcelado' and status = 'ativa'
     and periodo_fim < now() - interval '7 days';

  update public.cobranca_assinaturas
     set status = 'expirada', atualizada_em = now()
   where status = 'aguardando' and criada_em < now() - interval '7 days';

  update public.restaurantes
     set assinatura_status = 'cancelada'
   where assinatura_status = 'ativa'
     and assinatura_expira_em is not null
     and (   (coalesce(assinatura_origem, 'manual') in ('cupom', 'manual') and assinatura_expira_em < now())
          or (assinatura_origem = 'asaas_parcelado' and assinatura_expira_em < now() - interval '7 days')
          or (assinatura_origem = 'asaas_recorrente' and assinatura_cancelada_em is not null
              and assinatura_expira_em < now()));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.assinaturas_expirar_e_listar()
returns table (id bigint, whatsapp_token text, whatsapp_base_url text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) mantém até a data paga; vencida vira 'cancelada'
  perform public.expirar_assinaturas();

  -- 2) instâncias a liberar: sem plano, com token, e não-admin. `inadimplente`
  --    fica de fora: a cobrança ainda pode ser regularizada.
  return query
    select r.id, r.whatsapp_token, r.whatsapp_base_url
    from public.restaurantes r
    where r.assinatura_status not in ('ativa', 'inadimplente')
      and r.whatsapp_token is not null
      and not exists (
        select 1 from public.platform_admins pa
        join auth.users u on u.id = r.auth_user_id
        where lower(pa.email) = lower(u.email)
      );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. Limpeza de contas abandonadas: poupa quem tem cobrança no Asaas
-- ─────────────────────────────────────────────────────────────
create or replace function public.limpar_contas_abandonadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  alvos uuid[];
begin
  select array_agg(r.auth_user_id) into alvos
  from public.restaurantes r
  where r.assinatura_status = 'sem_assinatura'
    and coalesce(r.onboarding_completo, false) = false
    and r.whatsapp_token is null
    and r.created_at < now() - interval '7 days'
    and not exists (select 1 from public.feedbacks_restaurante f where f.restaurante_id = r.id)
    -- Foi para a fatura do Asaas (pagando ou não): não é conta abandonada.
    and not exists (select 1 from public.cobranca_assinaturas c where c.restaurante_id = r.id)
    and not exists (
      select 1 from public.platform_admins pa
      join auth.users u on u.id = r.auth_user_id
      where lower(pa.email) = lower(u.email)
    )
    -- Influenciador: a conta dele é do EasyFeed Influencers, não um restaurante abandonado.
    and not exists (
      select 1 from public.influenciadores i
      join auth.users u on u.id = r.auth_user_id
      where i.email = lower(u.email)
    );

  if alvos is null or array_length(alvos, 1) is null then
    return 0;
  end if;

  delete from public.usuarios where id = any(alvos);   -- usuarios não tem FK cascade
  delete from auth.users where id = any(alvos);        -- cascata: restaurantes + push_subscriptions

  return array_length(alvos, 1);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. Indicações: pagamentos do Asaas
-- ─────────────────────────────────────────────────────────────
create or replace function public.indicacao_ja_pagou(p_restaurante_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cobranca_pagamentos p
     where p.restaurante_id = p_restaurante_id
       and p.status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
       and p.valor_centavos > 0)
$$;

-- Mensalidades pagas: mensal = 1; recorrente semestral/anual pago à vista = 6/12;
-- cada parcela do parcelado = 1.
create or replace function public.indicacao_meses_pagos(p_restaurante_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
           case when a.modalidade = 'recorrente'
                then case a.ciclo when 'semestral' then 6 when 'anual' then 12 else 1 end
                else 1 end), 0)::int
    from public.cobranca_pagamentos p
    join public.cobranca_assinaturas a on a.id = p.assinatura_id
   where p.restaurante_id = p_restaurante_id
     and p.status in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH')
     and p.valor_centavos > 0
$$;

-- ─────────────────────────────────────────────────────────────
-- 10. Permissões
-- ─────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'cobranca_aplicar(bigint)', 'cobranca_vigente(bigint)', 'expirar_assinaturas()',
    'assinaturas_expirar_e_listar()', 'limpar_contas_abandonadas()',
    'indicacao_ja_pagou(bigint)', 'indicacao_meses_pagos(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────
-- LIMPEZA ANTES DE LIGAR A PRODUÇÃO (não roda junto; copiar e rodar à parte)
-- ─────────────────────────────────────────────────────────────
-- Os ids do sandbox não existem na conta de produção. Apaga o que o sandbox
-- gravou e devolve as contas de teste para "sem assinatura".
--
-- begin;
--   update public.restaurantes
--      set assinatura_status = 'sem_assinatura', assinatura_origem = null,
--          plano_ciclo = null, assinatura_expira_em = null, assinatura_cancelada_em = null
--    where assinatura_origem like 'asaas_%';
--   update public.cupons_usos set aplicado_em = null, aplicado_pagamento = null
--    where aplicado_em is not null;
--   -- Benefícios de indicação nascidos de pagamento de teste: conferir à mão
--   -- (select * from public.indicacao_premios) e apagar os dos testes.
--   update public.indicacao_premios set status = 'pendente', aplicado_em = null, aplicado_por = null
--    where aplicado_por = 'asaas';
--   update public.indicacoes i set pagou_em = null
--    where exists (select 1 from public.cobranca_pagamentos p where p.restaurante_id = i.indicado_restaurante_id);
--   delete from public.cobranca_pagamentos;
--   delete from public.cobranca_assinaturas;
--   delete from public.cobranca_clientes;
--   delete from public.cobranca_eventos_webhook;
--   update public.contas_cobranca set ambiente = 'producao' where id = 'mei';
-- commit;
