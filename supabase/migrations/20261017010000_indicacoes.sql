-- Indicação entre restaurantes (página Descontos → Indicações).
--
-- O restaurante pega o próprio link, manda para outro restaurante e, quando o
-- indicado paga a PRIMEIRA mensalidade, ganha o benefício que o admin escreveu.
--
-- Decisões do Raver (13/10/2026):
--   - o benefício é um TEXTO que o admin escreve em Admin → Afiliados, aplicado
--     à mão (como os prêmios dos vídeos). Aplicar sozinho na cobrança fica para
--     quando o pagamento sair do Stripe e for para o Asaas;
--   - nasce na primeira mensalidade paga pelo indicado;
--   - só o admin da plataforma vê a página por enquanto (indicacao_liberada).
--
-- Como encaixa no que já existia:
--   - o restaurante que indica vira uma linha de `afiliados` (restaurante_id
--     preenchido, comissão 0). Assim o link `?ref=CODIGO` e o campo "Código de
--     indicação" do checkout já aceitam o código dele sem mexer em função do
--     Stripe, e `gerar_repasses_da_fatura` não cria repasse (comissão 0);
--   - afiliado de fora (restaurante_id vazio) continua igual: comissão em
--     dinheiro pelos repasses;
--   - quem indicou quem fica em `indicacoes`, FORA das tabelas do Stripe. O
--     aviso de "pagou" entra por `indicacao_registrar_pagamento`, que hoje é
--     chamada por gatilho nas tabelas do Stripe e amanhã pelo webhook do Asaas.
--
-- Pode rodar mais de uma vez.

-- ─────────────────────────────────────────────────────────────
-- 1. O restaurante como afiliado
-- ─────────────────────────────────────────────────────────────
alter table public.afiliados
  add column if not exists restaurante_id bigint references public.restaurantes (id) on delete cascade;

create unique index if not exists uq_afiliados_restaurante
  on public.afiliados (restaurante_id)
  where restaurante_id is not null;

comment on column public.afiliados.restaurante_id is
  'Preenchido = é um restaurante indicando (ganha o benefício da indicação, comissão 0). Vazio = afiliado de fora, que ganha comissão.';

-- ─────────────────────────────────────────────────────────────
-- 2. Tabelas
-- ─────────────────────────────────────────────────────────────
-- Uma linha só: ligado/desligado e o texto do benefício.
create table if not exists public.indicacao_config (
  id            boolean primary key default true check (id),
  ativo         boolean not null default false,
  beneficio     text not null default '',
  atualizado_por text,
  atualizado_em timestamptz not null default now(),
  constraint indicacao_config_beneficio_check
    check (char_length(beneficio) <= 300 and (not ativo or char_length(btrim(beneficio)) >= 5))
);
insert into public.indicacao_config (id) values (true) on conflict do nothing;

-- Quem indicou cada restaurante (um por indicado). `origem`: 'conta' = o
-- indicado, já com conta, registrou pelo link ou digitando o código;
-- 'pagamento' = comprou pela página de vendas antes de ter conta, e o código
-- veio da assinatura.
create table if not exists public.indicacoes (
  indicado_restaurante_id bigint primary key references public.restaurantes (id) on delete cascade,
  afiliado_id             uuid not null references public.afiliados (id) on delete cascade,
  codigo                  text not null,
  origem                  text not null default 'conta' check (origem in ('conta', 'pagamento')),
  criado_em               timestamptz not null default now(),
  -- Quando a primeira mensalidade foi paga. Preenchido = não muda mais.
  pagou_em                timestamptz
);
create index if not exists idx_indicacoes_afiliado on public.indicacoes (afiliado_id);

-- O benefício ganho: um por indicado, com o texto que valia na hora.
create table if not exists public.indicacao_premios (
  id                      uuid primary key default gen_random_uuid(),
  -- Quem ganhou (o restaurante que indicou).
  restaurante_id          bigint not null references public.restaurantes (id) on delete cascade,
  -- Por causa de quem. Se o indicado for apagado, o prêmio continua.
  indicado_restaurante_id bigint unique references public.restaurantes (id) on delete set null,
  beneficio               text not null,
  status                  text not null default 'pendente' check (status in ('pendente', 'aplicado', 'cancelado')),
  criado_em               timestamptz not null default now(),
  aplicado_em             timestamptz,
  aplicado_por            text
);
create index if not exists idx_indicacao_premios_restaurante on public.indicacao_premios (restaurante_id, criado_em desc);

-- Ninguém escreve direto: tudo passa pelas funções abaixo. O admin lê.
alter table public.indicacao_config  enable row level security;
alter table public.indicacoes        enable row level security;
alter table public.indicacao_premios enable row level security;

revoke all on public.indicacao_config, public.indicacoes, public.indicacao_premios from anon, authenticated;
grant select on public.indicacao_config, public.indicacoes, public.indicacao_premios to authenticated;

do $$
declare t text;
begin
  foreach t in array array['indicacao_config', 'indicacoes', 'indicacao_premios'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_le', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())))',
      t || '_admin_le', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Quem pode
-- ─────────────────────────────────────────────────────────────
-- Quem vê a página de indicações. Hoje só o admin da plataforma; para liberar
-- aos donos, troque o corpo por `select true` (e tire o SoAdminPlataforma da
-- rota e o `soAdmin` do menu).
create or replace function public.indicacao_liberada()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email()))
$$;

-- O admin da plataforma (configura o benefício e marca os prêmios). Não muda
-- quando a página for liberada aos donos.
create or replace function public.indicacao_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email()))
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. Peças internas
-- ─────────────────────────────────────────────────────────────
-- Um código novo para o restaurante: o nome sem acento e sem espaço (até 12
-- letras) e 4 caracteres sorteados, sem os que se confundem (0/O, 1/I).
-- Cabe na regra do link e do checkout: ^[A-Z0-9_-]{2,30}$.
create or replace function public.indicacao_codigo_novo(p_nome text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_base     text;
  v_codigo   text;
  i          integer;
begin
  v_base := upper(translate(coalesce(p_nome, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'));
  v_base := left(regexp_replace(v_base, '[^A-Z0-9]', '', 'g'), 12);
  if char_length(v_base) < 3 then v_base := 'EASYFEED'; end if;
  loop
    v_codigo := v_base || '-';
    for i in 1..4 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * char_length(v_alfabeto))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.afiliados a where a.codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

-- O restaurante já pagou alguma mensalidade? Hoje olha as faturas do Stripe
-- (a fatura pode estar ligada ao restaurante direto ou pela assinatura).
-- Quando o Asaas entrar, acrescente aqui a consulta das cobranças dele.
create or replace function public.indicacao_ja_pagou(p_restaurante_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.stripe_faturas f
     where f.status = 'paid'
       and f.pago_centavos > 0
       and (f.restaurante_id = p_restaurante_id
            or f.stripe_subscription_id in (
              select s.stripe_subscription_id from public.stripe_assinaturas s where s.restaurante_id = p_restaurante_id)))
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. O indicado registra quem o indicou
-- ─────────────────────────────────────────────────────────────
-- Chamada pela conta logada (link `?ref=` guardado, ou código digitado na hora
-- de assinar). Enquanto não pagou, o último código informado é o que vale, que
-- é também o que o checkout manda para a cobrança.
create or replace function public.indicacao_registrar(p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rid    bigint := public.get_user_restaurante_id();
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_af     public.afiliados%rowtype;
  v_pagou  timestamptz;
begin
  if v_rid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_restaurante');
  end if;
  if v_codigo !~ '^[A-Z0-9_-]{2,30}$' then
    return jsonb_build_object('ok', false, 'motivo', 'codigo_invalido');
  end if;

  select * into v_af from public.afiliados a where a.codigo = v_codigo and a.ativo;
  if v_af.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'codigo_invalido');
  end if;
  if v_af.restaurante_id = v_rid then
    return jsonb_build_object('ok', false, 'motivo', 'proprio_codigo');
  end if;

  -- Indicação é de cliente NOVO: quem já pagou alguma vez não entra.
  select i.pagou_em into v_pagou from public.indicacoes i where i.indicado_restaurante_id = v_rid for update;
  if v_pagou is not null or public.indicacao_ja_pagou(v_rid) then
    return jsonb_build_object('ok', false, 'motivo', 'ja_assinou');
  end if;

  insert into public.indicacoes (indicado_restaurante_id, afiliado_id, codigo, origem)
  values (v_rid, v_af.id, v_codigo, 'conta')
  on conflict (indicado_restaurante_id) do update
     set afiliado_id = excluded.afiliado_id,
         codigo      = excluded.codigo,
         origem      = 'conta',
         criado_em   = case when public.indicacoes.afiliado_id = excluded.afiliado_id then public.indicacoes.criado_em else now() end
   where public.indicacoes.pagou_em is null;

  return jsonb_build_object('ok', true);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. A primeira mensalidade paga
-- ─────────────────────────────────────────────────────────────
-- "O restaurante X pagou." Marca a indicação como paga e, se quem indicou é um
-- restaurante e a indicação está ligada, cria o prêmio com o texto de agora.
-- Só a primeira chamada faz alguma coisa: pode chamar a cada fatura.
-- Devolve o id do prêmio criado, ou null.
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
  v_cfg    public.indicacao_config%rowtype;
  v_afid   uuid;
  v_premio uuid;
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

  if v_ind.pagou_em is not null then return null; end if;

  update public.indicacoes set pagou_em = now() where indicado_restaurante_id = p_restaurante_id;

  select * into v_af  from public.afiliados a where a.id = v_ind.afiliado_id;
  select * into v_cfg from public.indicacao_config c where c.id;

  -- Prêmio só para restaurante que indica (afiliado de fora ganha comissão),
  -- com a indicação ligada, e nunca para si mesmo.
  if v_af.restaurante_id is null
     or not v_af.ativo
     or v_af.restaurante_id = p_restaurante_id
     or not coalesce(v_cfg.ativo, false) then
    return null;
  end if;

  insert into public.indicacao_premios (restaurante_id, indicado_restaurante_id, beneficio)
  values (v_af.restaurante_id, p_restaurante_id, v_cfg.beneficio)
  on conflict (indicado_restaurante_id) do nothing
  returning id into v_premio;

  return v_premio;
end;
$$;

-- Fatura paga no Stripe → avisa a indicação. Um erro aqui nunca pode derrubar
-- a gravação da fatura (o webhook de cobrança vem antes de qualquer prêmio).
create or replace function public.indicacao_ao_pagar_fatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rid bigint;
begin
  if new.status = 'paid' and coalesce(new.pago_centavos, 0) > 0 then
    v_rid := coalesce(new.restaurante_id, (
      select s.restaurante_id from public.stripe_assinaturas s
       where s.stripe_subscription_id = new.stripe_subscription_id and s.restaurante_id is not null
       limit 1));
    if v_rid is not null then
      begin
        perform public.indicacao_registrar_pagamento(v_rid);
      exception when others then
        raise warning 'indicacao_registrar_pagamento(%) falhou: %', v_rid, sqlerrm;
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stripe_faturas_indicacao on public.stripe_faturas;
create trigger trg_stripe_faturas_indicacao
  after insert or update of status, pago_centavos, restaurante_id on public.stripe_faturas
  for each row execute function public.indicacao_ao_pagar_fatura();

-- Na compra pela página de vendas a fatura chega antes de a assinatura ter
-- restaurante (a conta é criada depois de pagar). Quando a assinatura ganha o
-- restaurante ou o afiliado, confere se já tinha fatura paga.
create or replace function public.indicacao_ao_vincular_assinatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.restaurante_id is not null and new.afiliado_id is not null
     and exists (
       select 1 from public.stripe_faturas f
        where f.stripe_subscription_id = new.stripe_subscription_id
          and f.status = 'paid' and f.pago_centavos > 0) then
    begin
      perform public.indicacao_registrar_pagamento(new.restaurante_id);
    exception when others then
      raise warning 'indicacao_registrar_pagamento(%) falhou: %', new.restaurante_id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stripe_assinaturas_indicacao on public.stripe_assinaturas;
create trigger trg_stripe_assinaturas_indicacao
  after insert or update of restaurante_id, afiliado_id on public.stripe_assinaturas
  for each row execute function public.indicacao_ao_vincular_assinatura();

-- ─────────────────────────────────────────────────────────────
-- 7. A página do restaurante
-- ─────────────────────────────────────────────────────────────
-- Tudo o que a subpágina Indicações mostra. Cria o código do restaurante na
-- primeira visita (com a indicação ligada). NÃO devolve o nome de quem foi
-- indicado: só as contagens e os prêmios.
create or replace function public.indicacao_minha()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rid  bigint;
  v_cfg  public.indicacao_config%rowtype;
  v_af   public.afiliados%rowtype;
  v_nome text;
begin
  if not public.indicacao_liberada() then
    return jsonb_build_object('liberado', false);
  end if;
  v_rid := public.get_user_restaurante_id();
  if v_rid is null then
    return jsonb_build_object('liberado', true, 'sem_restaurante', true);
  end if;

  select * into v_cfg from public.indicacao_config c where c.id;
  select * into v_af  from public.afiliados a where a.restaurante_id = v_rid;

  if v_af.id is null and coalesce(v_cfg.ativo, false) then
    select r.nome_restaurante into v_nome from public.restaurantes r where r.id = v_rid;
    begin
      insert into public.afiliados (nome, codigo, comissao_tipo, comissao_valor, ativo, restaurante_id, observacoes)
      values (coalesce(nullif(btrim(v_nome), ''), 'Restaurante ' || v_rid), public.indicacao_codigo_novo(v_nome),
              'porcentagem', 0, true, v_rid, 'Criado pela indicação entre restaurantes (página Descontos).')
      returning * into v_af;
    exception when unique_violation then
      -- Duas abas ao mesmo tempo: a outra já criou.
      select * into v_af from public.afiliados a where a.restaurante_id = v_rid;
    end;
  end if;

  return jsonb_build_object(
    'liberado',  true,
    'ativo',     coalesce(v_cfg.ativo, false),
    'beneficio', coalesce(v_cfg.beneficio, ''),
    'codigo',    v_af.codigo,
    'indicados', (select count(*) from public.indicacoes i where i.afiliado_id = v_af.id),
    'assinaram', (select count(*) from public.indicacoes i where i.afiliado_id = v_af.id and i.pagou_em is not null),
    'premios',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'beneficio', p.beneficio, 'status', p.status,
               'criado_em', p.criado_em, 'aplicado_em', p.aplicado_em) order by p.criado_em desc)
        from public.indicacao_premios p
       where p.restaurante_id = v_rid), '[]'::jsonb)
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. O painel do admin (Admin → Afiliados)
-- ─────────────────────────────────────────────────────────────
create or replace function public.indicacao_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg public.indicacao_config%rowtype;
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  select * into v_cfg from public.indicacao_config c where c.id;

  return jsonb_build_object(
    'ativo',         coalesce(v_cfg.ativo, false),
    'beneficio',     coalesce(v_cfg.beneficio, ''),
    'atualizado_em', v_cfg.atualizado_em,
    'premios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'quem_indicou', coalesce(nullif(btrim(r.nome_restaurante), ''), 'Restaurante ' || p.restaurante_id),
               'indicado', case when p.indicado_restaurante_id is null then null
                                else coalesce(nullif(btrim(i.nome_restaurante), ''), 'Restaurante ' || p.indicado_restaurante_id) end,
               'beneficio', p.beneficio, 'status', p.status,
               'criado_em', p.criado_em, 'aplicado_em', p.aplicado_em, 'aplicado_por', p.aplicado_por)
             order by (p.status = 'pendente') desc, p.criado_em desc)
        from public.indicacao_premios p
        left join public.restaurantes r on r.id = p.restaurante_id
        left join public.restaurantes i on i.id = p.indicado_restaurante_id), '[]'::jsonb),
    -- Os restaurantes que já pegaram o link, com o que cada um trouxe.
    'indicadores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'restaurante', coalesce(nullif(btrim(r.nome_restaurante), ''), 'Restaurante ' || a.restaurante_id),
               'codigo', a.codigo,
               'indicados', (select count(*) from public.indicacoes x where x.afiliado_id = a.id),
               'assinaram', (select count(*) from public.indicacoes x where x.afiliado_id = a.id and x.pagou_em is not null))
             order by a.created_at desc)
        from public.afiliados a
        left join public.restaurantes r on r.id = a.restaurante_id
       where a.restaurante_id is not null), '[]'::jsonb)
  );
end;
$$;

-- Liga, desliga e muda o texto do benefício. Prêmio que já nasceu fica com o
-- texto antigo: o novo vale para as próximas indicações.
create or replace function public.indicacao_admin_salvar(p_ativo boolean, p_beneficio text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_texto text := btrim(regexp_replace(coalesce(p_beneficio, ''), '\s+', ' ', 'g'));
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  if char_length(v_texto) > 300 then
    return jsonb_build_object('ok', false, 'motivo', 'beneficio_longo');
  end if;
  if coalesce(p_ativo, false) and char_length(v_texto) < 5 then
    return jsonb_build_object('ok', false, 'motivo', 'beneficio_vazio');
  end if;

  update public.indicacao_config
     set ativo = coalesce(p_ativo, false), beneficio = v_texto,
         atualizado_por = lower(auth.email()), atualizado_em = now()
   where id;

  return jsonb_build_object('ok', true, 'ativo', coalesce(p_ativo, false), 'beneficio', v_texto);
end;
$$;

-- O admin marca que já deu o benefício, cancela ou volta para pendente.
create or replace function public.indicacao_admin_premio(p_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
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
     set status       = p_status,
         aplicado_em  = case when p_status = 'aplicado' then now() end,
         aplicado_por = case when p_status = 'aplicado' then lower(auth.email()) end
   where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'premio_nao_encontrado');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. Quem chama o quê
-- ─────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  -- Só o servidor (gatilhos e webhook).
  foreach f in array array[
    'indicacao_codigo_novo(text)', 'indicacao_ja_pagou(bigint)', 'indicacao_registrar_pagamento(bigint)',
    'indicacao_ao_pagar_fatura()', 'indicacao_ao_vincular_assinatura()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- A conta logada (cada função confere por dentro quem pode).
  foreach f in array array[
    'indicacao_liberada()', 'indicacao_eh_admin()', 'indicacao_registrar(text)', 'indicacao_minha()',
    'indicacao_admin()', 'indicacao_admin_salvar(boolean, text)', 'indicacao_admin_premio(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 10. O que já existia
-- ─────────────────────────────────────────────────────────────
-- Assinaturas que já tinham afiliado entram no registro, para o histórico
-- ficar num lugar só. Vale a primeira assinatura de cada restaurante.
with primeira as (
  select distinct on (s.restaurante_id) s.restaurante_id, s.afiliado_id, s.stripe_subscription_id, s.created_at
    from public.stripe_assinaturas s
   where s.restaurante_id is not null
   order by s.restaurante_id, s.created_at
)
insert into public.indicacoes (indicado_restaurante_id, afiliado_id, codigo, origem, criado_em, pagou_em)
select p.restaurante_id, a.id, a.codigo, 'pagamento', p.created_at,
       (select min(f.pago_em) from public.stripe_faturas f
         where f.stripe_subscription_id = p.stripe_subscription_id and f.status = 'paid' and f.pago_centavos > 0)
  from primeira p
  join public.afiliados a on a.id = p.afiliado_id
 where a.restaurante_id is distinct from p.restaurante_id
on conflict (indicado_restaurante_id) do nothing;
