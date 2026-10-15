-- Remove o Stripe do banco por completo.
--
-- Decisão do dono (15/10/2026): a cobrança vai para o Asaas e o Stripe sai
-- inteiro ANTES, mesmo que o sistema fique um tempo sem forma de pagamento.
-- O Stripe só rodou em modo de teste: nenhuma tabela daqui tem dado real.
--
-- O que outras partes usavam e continua existindo, sem o Stripe:
--   - indicações (`indicacao_ja_pagou`, `indicacao_meses_pagos`,
--     `indicacao_registrar_pagamento`): passam a não ver pagamento nenhum até
--     o webhook do Asaas chamar `indicacao_registrar_pagamento` de novo;
--   - `limpar_contas_abandonadas`: sem as travas do Stripe, mantendo a dos
--     influenciadores;
--   - `proteger_colunas_assinatura`: sem as colunas `stripe_*`;
--   - o cron de expiração: volta a valer para todo acesso com data (cupom,
--     liberação manual), já que não há mais assinatura recorrente.
--
-- Pode rodar mais de uma vez.

-- ─────────────────────────────────────────────────────────────
-- 1. Cron e funções que só existiam para o Stripe
-- ─────────────────────────────────────────────────────────────
do $$ begin perform cron.unschedule('limpar-payload-eventos-stripe'); exception when others then null; end $$;

-- As tabelas levam junto os gatilhos de indicação que estavam nelas.
drop table if exists public.stripe_repasses;
drop table if exists public.stripe_faturas;
drop table if exists public.stripe_eventos_webhook;
drop table if exists public.stripe_checkout_sessions;
drop table if exists public.stripe_assinaturas;
drop table if exists public.stripe_clientes;

drop function if exists public.limpar_payload_eventos_stripe();
drop function if exists public.aplicar_assinatura_stripe(bigint);
drop function if exists public.gerar_repasses_da_fatura(uuid);
drop function if exists public.indicacao_ao_pagar_fatura();
drop function if exists public.indicacao_ao_vincular_assinatura();
drop function if exists public.stripe_touch_updated_at();

delete from public.integracao_config where chave = 'STRIPE_PORTAL_CONFIGURATION_ID';

-- ─────────────────────────────────────────────────────────────
-- 2. Proteção das colunas de assinatura, sem as colunas do Stripe
-- ─────────────────────────────────────────────────────────────
-- Igual à versão de 20261019000000_area_da_conta.sql, menos stripe_*.
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
-- 3. Colunas do Stripe em tabelas que continuam
-- ─────────────────────────────────────────────────────────────
-- Depois da função acima, que era a última a citar essas colunas.
alter table public.restaurantes drop column if exists stripe_customer_id;
alter table public.restaurantes drop column if exists stripe_subscription_id;
alter table public.afiliados drop column if exists stripe_connect_status;
alter table public.afiliados drop column if exists stripe_account_id;

-- ─────────────────────────────────────────────────────────────
-- 4. Expiração por data (cupom, liberação manual)
-- ─────────────────────────────────────────────────────────────
-- Sem assinatura recorrente, todo acesso com data vence pelo cron. A versão
-- anterior pulava quem tinha `stripe_subscription_id`.
create or replace function public.expirar_assinaturas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.restaurantes
     set assinatura_status = 'cancelada'
   where assinatura_status = 'ativa'
     and assinatura_expira_em is not null
     and assinatura_expira_em < now();
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
  update public.restaurantes
     set assinatura_status = 'cancelada'
   where assinatura_status = 'ativa'
     and assinatura_expira_em is not null
     and assinatura_expira_em < now();

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

revoke all on function public.expirar_assinaturas() from public, anon, authenticated;
grant execute on function public.expirar_assinaturas() to service_role;
revoke all on function public.assinaturas_expirar_e_listar() from public, anon, authenticated;
grant execute on function public.assinaturas_expirar_e_listar() to service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. Limpeza de contas abandonadas, sem as travas do Stripe
-- ─────────────────────────────────────────────────────────────
-- Igual à versão de 20261008000000_influencers.sql, menos stripe_*. Quando o
-- Asaas entrar, a trava "pagou ou está pagando" volta com as tabelas dele.
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

revoke all on function public.limpar_contas_abandonadas() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. Indicações: sem pagamento até o Asaas
-- ─────────────────────────────────────────────────────────────
-- Mesmas assinaturas de antes (outras funções chamam estas). Hoje não há
-- pagamento registrado em lugar nenhum; o webhook do Asaas vai alimentar.
create or replace function public.indicacao_ja_pagou(p_restaurante_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- TODO(asaas): olhar as cobranças pagas do Asaas.
  select false
$$;

create or replace function public.indicacao_meses_pagos(p_restaurante_id bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  -- TODO(asaas): contar as mensalidades pagas no Asaas.
  select 0
$$;

-- Igual à versão de 20261027000000_afiliados_e_indicacoes_por_software.sql,
-- menos o caminho "comprou pela página de vendas antes de ter conta" (lia o
-- afiliado da assinatura do Stripe). Sem registro em `indicacoes`, não há
-- indicação: o Asaas vai registrar a indicação na hora da compra.
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
  v_premio uuid;
  v_pct    numeric;
begin
  if p_restaurante_id is null then return null; end if;

  select * into v_ind from public.indicacoes i where i.indicado_restaurante_id = p_restaurante_id for update;
  if not found then return null; end if;

  if v_ind.pagou_em is null then
    update public.indicacoes set pagou_em = now() where indicado_restaurante_id = p_restaurante_id;
  end if;

  -- O benefício só conta depois do 2º mês pago.
  if public.indicacao_meses_pagos(p_restaurante_id) < 2 then return null; end if;

  select * into v_af from public.afiliados a where a.id = v_ind.afiliado_id;
  -- Benefício só para conta EasyFeed que indica (afiliado de fora ganha
  -- comissão em dinheiro), ativa, e nunca para si mesma.
  if not found or v_af.restaurante_id is null or not v_af.ativo or v_af.restaurante_id = p_restaurante_id then
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
