-- Stripe, parte 2: histórico de faturas, divisão de receita (repasses) e
-- afiliados via Stripe Connect.
--
-- Complementa 20260929000000_stripe_assinaturas.sql (ainda não aplicada em
-- produção — as duas entram juntas). Decisões fechadas com o dono:
--   - sócios/empresa: LIVRO-RAZÃO + Pix pago pela empresa (nada de transferência
--     automática para CPF de sócio: a receita é da IAMAI, o lucro só existe
--     depois de imposto e custo);
--   - afiliados: transferência AUTOMÁTICA pelo Stripe Connect a cada fatura
--     paga, quando o afiliado já conectou a conta; caso contrário fica no
--     livro-razão para pagar por Pix;
--   - atribuição da venda: `afiliados.codigo`, digitado pelo comprador ou
--     preenchido pelo link `?ref=CODIGO`;
--   - payload dos eventos guardado por 90 dias, depois apagado (LGPD).
--
-- Reaproveita o que já existia: `afiliados` (comissão, chave Pix,
-- `stripe_account_id`), `divisao_receita` (sócios: % ou valor fixo, chave Pix)
-- e `integracao_config` (configuração não secreta). Colunas novas em tabelas
-- antigas: só `stripe_assinaturas.afiliado_id`, `afiliados.stripe_connect_status`
-- e `stripe_eventos_webhook.payload`.

-- ─────────────────────────────────────────────────────────────
-- 1. Payload dos eventos, com validade de 90 dias
-- ─────────────────────────────────────────────────────────────
alter table public.stripe_eventos_webhook
  add column if not exists payload jsonb;

comment on column public.stripe_eventos_webhook.payload is
  'Evento completo do Stripe, para investigar e reprocessar. Apagado após 90 dias por limpar_payload_eventos_stripe() (contém dados pessoais do cliente).';

create or replace function public.limpar_payload_eventos_stripe()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.stripe_eventos_webhook
     set payload = null
   where payload is not null
     and recebido_em < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.limpar_payload_eventos_stripe() from public;

do $$ begin perform cron.unschedule('limpar-payload-eventos-stripe'); exception when others then null; end $$;
select cron.schedule('limpar-payload-eventos-stripe', '40 3 * * *', $$select public.limpar_payload_eventos_stripe();$$);

-- ─────────────────────────────────────────────────────────────
-- 2. Afiliado na assinatura + estado da conta Connect
-- ─────────────────────────────────────────────────────────────
alter table public.stripe_assinaturas
  add column if not exists afiliado_id uuid references public.afiliados (id) on delete set null;

create index if not exists idx_stripe_assinaturas_afiliado
  on public.stripe_assinaturas (afiliado_id)
  where afiliado_id is not null;

-- `afiliados.stripe_account_id` já existia. Este campo diz se a conta terminou
-- o cadastro no Stripe e pode receber (`ativo`) — atualizado pela edge
-- function `conectar-afiliado` e pelo evento `account.updated`.
alter table public.afiliados
  add column if not exists stripe_connect_status text not null default 'nao_conectado';

alter table public.afiliados
  drop constraint if exists afiliados_stripe_connect_status_check;

alter table public.afiliados
  add constraint afiliados_stripe_connect_status_check
  check (stripe_connect_status in ('nao_conectado', 'pendente', 'ativo', 'restrito'));

-- ─────────────────────────────────────────────────────────────
-- 3. Faturas (histórico de cobranças)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.stripe_faturas (
  id                     uuid primary key default gen_random_uuid(),
  stripe_invoice_id      text not null unique,
  stripe_subscription_id text,
  stripe_customer_id     text,
  restaurante_id         bigint references public.restaurantes (id) on delete set null,
  -- Número legível ("EASYFEED-0001"), status cru do Stripe (draft, open, paid,
  -- uncollectible, void) e motivo (subscription_create, subscription_cycle...).
  numero                 text,
  status                 text not null,
  billing_reason         text,
  moeda                  text not null default 'brl',
  total_centavos         integer not null default 0,
  pago_centavos          integer not null default 0,
  periodo_inicio         timestamptz,
  periodo_fim            timestamptz,
  pago_em                timestamptz,
  -- Links hospedados pelo Stripe (página da fatura e PDF). Não guardamos o PDF.
  hosted_invoice_url     text,
  invoice_pdf            text,
  -- Cobrança por trás do pagamento: é a origem (`source_transaction`) das
  -- transferências de comissão.
  stripe_charge_id       text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_stripe_faturas_restaurante
  on public.stripe_faturas (restaurante_id, created_at desc)
  where restaurante_id is not null;

create index if not exists idx_stripe_faturas_assinatura
  on public.stripe_faturas (stripe_subscription_id);

drop trigger if exists trg_stripe_faturas_updated on public.stripe_faturas;
create trigger trg_stripe_faturas_updated
  before update on public.stripe_faturas
  for each row execute function public.stripe_touch_updated_at();

alter table public.stripe_faturas enable row level security;

drop policy if exists stripe_faturas_select_dono on public.stripe_faturas;
create policy stripe_faturas_select_dono on public.stripe_faturas
  for select to authenticated
  using (restaurante_id = public.get_user_restaurante_id());

drop policy if exists stripe_faturas_select_admin on public.stripe_faturas;
create policy stripe_faturas_select_admin on public.stripe_faturas
  for select to authenticated
  using (exists (select 1 from public.platform_admins where email = auth.email()));

-- ─────────────────────────────────────────────────────────────
-- 4. Repasses (livro-razão da divisão de receita)
-- ─────────────────────────────────────────────────────────────
-- Uma linha por (fatura paga × destinatário). Destinatário é uma linha de
-- `divisao_receita` (sócio/empresa) OU um `afiliado`. O valor é calculado no
-- momento em que a fatura é paga e nunca recalculado — se a % mudar depois,
-- vale para as próximas faturas.
create table if not exists public.stripe_repasses (
  id                 uuid primary key default gen_random_uuid(),
  fatura_id          uuid not null references public.stripe_faturas (id) on delete cascade,
  destino_tipo       text not null check (destino_tipo in ('divisao', 'afiliado')),
  divisao_id         uuid references public.divisao_receita (id) on delete set null,
  afiliado_id        uuid references public.afiliados (id) on delete set null,
  -- Nome no momento do cálculo: se a linha de origem for apagada, o histórico
  -- continua legível.
  descricao          text not null,
  -- Sobre o que a regra foi aplicada e o que resultou.
  base_centavos      integer not null,
  valor_centavos     integer not null check (valor_centavos >= 0),
  regra              text not null,   -- ex.: '10%' ou 'R$ 50,00 fixo'
  -- pix: admin paga pela conta da empresa e marca como pago.
  -- stripe_connect: o webhook transfere pelo Stripe (só afiliado conectado).
  metodo             text not null check (metodo in ('pix', 'stripe_connect')),
  status             text not null default 'pendente'
                     check (status in ('pendente', 'pago', 'falhou', 'cancelado')),
  stripe_transfer_id text unique,
  erro               text,
  pago_em            timestamptz,
  -- E-mail do admin que marcou como pago (Pix) ou 'stripe' (automático).
  pago_por           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint stripe_repasses_destino_coerente check (
    (destino_tipo = 'divisao'  and divisao_id  is not null and afiliado_id is null) or
    (destino_tipo = 'afiliado' and afiliado_id is not null and divisao_id  is null)
  )
);

-- Um repasse por destinatário por fatura (idempotência do cálculo).
create unique index if not exists uq_stripe_repasses_fatura_destino
  on public.stripe_repasses (fatura_id, destino_tipo, coalesce(divisao_id, afiliado_id));

create index if not exists idx_stripe_repasses_status
  on public.stripe_repasses (status, created_at desc);

drop trigger if exists trg_stripe_repasses_updated on public.stripe_repasses;
create trigger trg_stripe_repasses_updated
  before update on public.stripe_repasses
  for each row execute function public.stripe_touch_updated_at();

alter table public.stripe_repasses enable row level security;

-- Mesmo molde de `divisao_receita`: só admin da plataforma, e ele precisa de
-- UPDATE para marcar o Pix como pago.
drop policy if exists only_admins_stripe_repasses on public.stripe_repasses;
create policy only_admins_stripe_repasses on public.stripe_repasses
  for all to authenticated
  using      (exists (select 1 from public.platform_admins where email = auth.email()))
  with check (exists (select 1 from public.platform_admins where email = auth.email()));

-- ─────────────────────────────────────────────────────────────
-- 5. Cálculo dos repasses de uma fatura paga
-- ─────────────────────────────────────────────────────────────
-- Ordem: primeiro a comissão do afiliado (sobre o valor pago); depois as
-- linhas de `divisao_receita` sobre o que sobrou. Assim os sócios dividem a
-- receita líquida de comissão, não a bruta.
--
-- Idempotente: quem já tem linha para (fatura, destinatário) é pulado, então
-- o webhook pode chamar de novo sem duplicar. Devolve quantas linhas criou.
create or replace function public.gerar_repasses_da_fatura(p_fatura_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f          record;
  a          record;
  d          record;
  pago       integer;
  comissao   integer := 0;
  base       integer;
  valor      integer;
  criados    integer := 0;
begin
  select * into f from public.stripe_faturas where id = p_fatura_id;
  if f is null or f.status <> 'paid' or f.pago_centavos <= 0 then
    return 0;
  end if;
  pago := f.pago_centavos;

  -- ── Afiliado ──
  select af.*
    into a
    from public.stripe_assinaturas s
    join public.afiliados af on af.id = s.afiliado_id
   where s.stripe_subscription_id = f.stripe_subscription_id
     and af.ativo = true;

  if a is not null then
    if a.comissao_tipo = 'porcentagem' then
      comissao := round(pago * a.comissao_valor / 100.0);
    else
      comissao := round(a.comissao_valor * 100);
    end if;
    comissao := least(greatest(comissao, 0), pago);

    if comissao > 0 then
      insert into public.stripe_repasses
        (fatura_id, destino_tipo, afiliado_id, descricao, base_centavos, valor_centavos, regra, metodo)
      values
        (p_fatura_id, 'afiliado', a.id, a.nome, pago, comissao,
         case when a.comissao_tipo = 'porcentagem'
              then a.comissao_valor::text || '%'
              else 'R$ ' || to_char(a.comissao_valor, 'FM999G999D00') || ' fixo' end,
         case when a.stripe_account_id is not null and a.stripe_connect_status = 'ativo'
              then 'stripe_connect' else 'pix' end)
      on conflict do nothing;
      if found then criados := criados + 1; end if;
    end if;
  end if;

  -- ── Sócios / empresa ──
  base := pago - comissao;
  for d in
    select * from public.divisao_receita where ativo = true order by created_at
  loop
    if d.tipo = 'porcentagem' then
      valor := round(base * d.valor / 100.0);
    else
      valor := round(d.valor * 100);
    end if;
    valor := least(greatest(valor, 0), base);
    if valor <= 0 then continue; end if;

    insert into public.stripe_repasses
      (fatura_id, destino_tipo, divisao_id, descricao, base_centavos, valor_centavos, regra, metodo)
    values
      (p_fatura_id, 'divisao', d.id, d.nome, base, valor,
       case when d.tipo = 'porcentagem'
            then d.valor::text || '%'
            else 'R$ ' || to_char(d.valor, 'FM999G999D00') || ' fixo' end,
       'pix')
    on conflict do nothing;
    if found then criados := criados + 1; end if;
  end loop;

  return criados;
end;
$$;

revoke all on function public.gerar_repasses_da_fatura(uuid) from public;
grant execute on function public.gerar_repasses_da_fatura(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- 6. Configuração não secreta em `integracao_config` (padrão da casa)
-- ─────────────────────────────────────────────────────────────
-- As edge functions leem estas chaves daqui antes de cair na variável de
-- ambiente. Segredos (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) NÃO entram
-- aqui: ficam em `supabase secrets`.
insert into public.integracao_config (chave, valor)
values
  ('SITE_URL', 'https://easyfeed.com.br'),
  ('STRIPE_PORTAL_CONFIGURATION_ID', '')
on conflict (chave) do nothing;
