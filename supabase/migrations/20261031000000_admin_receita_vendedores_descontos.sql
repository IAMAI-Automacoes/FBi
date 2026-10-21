-- Painel do admin (pedido do Raver, 21/10/2026), nos dois softwares.
--
-- 1. Receita: acabou a divisão da receita entre pessoas. Cada software tem UMA
--    conta onde cai o dinheiro da empresa. `recebedores` e `divisao_receita`
--    ficam no banco, sem uso.
-- 2. Vendedores: afiliado e vendedor viraram uma coisa só. A comissão é a
--    mesma regra para todos os vendedores do software: X% de uma mensalidade
--    quando o indicado paga a 2ª, depois Y% de cada mensalidade paga por Z
--    meses. Se o indicado cancelar, acaba. Padrão: 100%, 15% e 12 meses.
--    (`afiliado_config.comissao_padrao` e `afiliados.comissao_*` ficam sem uso.)
-- 3. Descontos → Vídeos: a escada de prêmios saiu. Cada vídeo aprovado vale um
--    saldo de X% de uma mensalidade do software (padrão 50%), até N vídeos por
--    ano (padrão 6). `video_recompensas` fica no banco, sem uso.
--
-- Pode rodar mais de uma vez.

-- ── 1. Receita ───────────────────────────────────────────────────────────
create table if not exists public.receita_contas (
  area           text primary key check (area in ('restaurante', 'rh')),
  titular        text,
  cpf_cnpj       text,
  chave_pix      text,
  codigo_banco   text,
  banco          text,
  agencia        text,
  conta          text,
  tipo_conta     text check (tipo_conta in ('corrente', 'poupanca')),
  observacoes    text,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);
comment on table public.receita_contas is
  'Admin → Receita: a conta onde cai o dinheiro de cada software. Substituiu a divisão (recebedores e divisao_receita, sem uso desde 21/10/2026).';

alter table public.receita_contas enable row level security;
drop policy if exists so_admins_receita_contas on public.receita_contas;
create policy so_admins_receita_contas on public.receita_contas
  for all to authenticated
  using      (exists (select 1 from public.platform_admins where lower(email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins where lower(email) = lower(auth.email())));

insert into public.receita_contas (area) values ('restaurante'), ('rh') on conflict (area) do nothing;

-- ── 2. Vendedores: a regra de comissão do software ────────────────────────
alter table public.afiliado_config
  add column if not exists comissao_entrada_pct      numeric not null default 100,
  add column if not exists comissao_recorrente_pct   numeric not null default 15,
  add column if not exists comissao_recorrente_meses integer not null default 12;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'afiliado_config_comissao_check') then
    alter table public.afiliado_config add constraint afiliado_config_comissao_check check (
      comissao_entrada_pct between 0 and 100
      and comissao_recorrente_pct between 0 and 100
      and comissao_recorrente_meses between 0 and 120
    );
  end if;
end $$;
comment on column public.afiliado_config.comissao_entrada_pct is
  'Quanto de UMA mensalidade o vendedor ganha quando o indicado paga a 2ª mensalidade.';
comment on column public.afiliado_config.comissao_recorrente_pct is
  'Quanto de cada mensalidade paga o vendedor ganha depois disso, por comissao_recorrente_meses meses.';
comment on column public.afiliado_config.comissao_padrao is 'Sem uso desde 21/10/2026 (a comissão é a regra de entrada + recorrente).';

insert into public.afiliado_config (area) values ('restaurante'), ('rh') on conflict (area) do nothing;

-- ── 3. Descontos → Vídeos: cada vídeo aprovado vale saldo ────────────────
alter table public.video_config add column if not exists saldo_pct_mensalidade numeric not null default 50;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'video_config_saldo_check') then
    alter table public.video_config add constraint video_config_saldo_check check (saldo_pct_mensalidade between 0 and 1000);
  end if;
end $$;
comment on column public.video_config.saldo_pct_mensalidade is
  'Quanto de UMA mensalidade do software cada vídeo aprovado vale de saldo (50 = meia mensalidade).';

-- O padrão novo é 6 vídeos por ano, nos dois softwares.
alter table public.video_config alter column max_por_ano set default 6;
update public.video_config set max_por_ano = 6 where max_por_ano is distinct from 6;
insert into public.video_config (id, area, max_por_ano, saldo_pct_mensalidade)
values (true, 'restaurante', 6, 50), (true, 'rh', 6, 50)
on conflict (area) do nothing;

alter table public.video_premios add column if not exists valor_centavos integer;
comment on column public.video_premios.valor_centavos is 'O saldo que o vídeo deu, em centavos (desde 21/10/2026; antes era o texto da escada).';
comment on table public.video_recompensas is 'Sem uso desde 21/10/2026: cada vídeo aprovado vale saldo (video_config.saldo_pct_mensalidade).';

-- O prêmio do vídeo aprovado: X% da mensalidade do software da conta.
create or replace function public.video_envio_premio()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a integer;
  n integer;
  ar text;
  pct numeric;
  maximo integer;
  mensal integer;
  valor integer;
  texto text;
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    a := extract(year from (new.aprovado_em at time zone 'America/Sao_Paulo'))::int;
    -- N = vídeos aprovados da conta NESTE ano (o limite recomeça em janeiro).
    select count(*) into n
      from public.video_envios
     where restaurante_id = new.restaurante_id and status = 'aprovado'
       and extract(year from (aprovado_em at time zone 'America/Sao_Paulo'))::int = a;

    ar := coalesce(public.area_da_conta(new.restaurante_id), 'restaurante');
    select c.saldo_pct_mensalidade, c.max_por_ano into pct, maximo from public.video_config c where c.area = ar;
    if maximo is not null and n > maximo then
      return new; -- passou do limite do ano: o vídeo vale, sem saldo novo
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
    update public.video_premios set status = 'cancelado'
     where envio_id = new.id and status = 'pendente';
  end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
