-- Pagamentos por software (Restaurante e RH).
--
-- Pedido do Raver (15/10/2026):
--   - Caio, Raver e Guilherme são os donos de TODOS os softwares, com 40% / 40%
--     / 20% de padrão. Os dados de cada pessoa (nome, conta bancária) são
--     preenchidos uma vez e valem para todos os softwares; a % muda por software.
--   - Dá para pôr mais gente para receber, por software.
--   - A lista de repasses sai da tela (o pagamento vai ser automático). A
--     tabela stripe_repasses continua sendo preenchida pelo webhook.
--
-- Como fica:
--   - `recebedores`: uma linha por pessoa, com os dados bancários.
--   - `divisao_receita`: a parte de cada pessoa EM CADA SOFTWARE (area +
--     recebedor_id). As linhas antigas (não havia nenhuma) continuam valendo
--     como restaurante.
--   - `gerar_repasses_da_fatura` (chamada pelo webhook do Stripe) usa a divisão
--     do software da conta que pagou, e não paga em dinheiro o afiliado que é
--     um restaurante ou empresa: o ganho dele por indicar é desconto na própria
--     mensalidade (decisão de 15/10/2026).
--
-- Pode rodar mais de uma vez.

create table if not exists public.recebedores (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(btrim(nome)) between 1 and 120),
  email         text,
  cpf_cnpj      text,
  chave_pix     text,
  codigo_banco  text,
  banco         text,
  agencia       text,
  conta         text,
  tipo_conta    text check (tipo_conta is null or tipo_conta in ('corrente', 'poupanca')),
  observacoes   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.recebedores is
  'Quem recebe parte da receita (sócios e quem mais o admin puser). Os dados valem para todos os softwares; a % de cada software fica em divisao_receita.';
alter table public.recebedores enable row level security;
drop policy if exists so_admins_recebedores on public.recebedores;
create policy so_admins_recebedores on public.recebedores
  for all to authenticated
  using      (exists (select 1 from public.platform_admins where email = auth.email()))
  with check (exists (select 1 from public.platform_admins where email = auth.email()));

alter table public.divisao_receita add column if not exists area text not null default 'restaurante';
alter table public.divisao_receita add column if not exists recebedor_id uuid references public.recebedores (id) on delete cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'divisao_receita_area_check') then
    alter table public.divisao_receita add constraint divisao_receita_area_check check (area in ('restaurante', 'rh'));
  end if;
end $$;
create unique index if not exists divisao_receita_uma_por_pessoa on public.divisao_receita (area, recebedor_id) where recebedor_id is not null;
comment on column public.divisao_receita.area is 'De qual software é esta parte: a receita das contas daquele software se divide pelas linhas dele.';

-- ── Os donos de padrão ───────────────────────────────────────────────────
insert into public.recebedores (nome)
select n from (values ('Caio'), ('Raver'), ('Guilherme')) v(n)
where not exists (select 1 from public.recebedores r where lower(r.nome) = lower(v.n));

-- Em cada software que ainda não tem divisão: Caio 40, Raver 40, Guilherme 20.
insert into public.divisao_receita (nome, tipo, valor, ativo, area, recebedor_id)
select r.nome, 'porcentagem', p.pct, true, a.area, r.id
  from (values ('restaurante'), ('rh')) a(area)
  cross join (values ('Caio', 40), ('Raver', 40), ('Guilherme', 20)) p(nome, pct)
  join public.recebedores r on lower(r.nome) = lower(p.nome)
 where not exists (select 1 from public.divisao_receita d where d.area = a.area);

-- ── Repasses de uma fatura paga, pelo software de quem pagou ─────────────
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
  v_rest     bigint;
  v_area     text;
begin
  select * into f from public.stripe_faturas where id = p_fatura_id;
  if f is null or f.status <> 'paid' or f.pago_centavos <= 0 then
    return 0;
  end if;
  pago := f.pago_centavos;

  -- De qual software é a conta que pagou (sem conta ainda: restaurante).
  v_rest := coalesce(f.restaurante_id,
    (select s.restaurante_id from public.stripe_assinaturas s where s.stripe_subscription_id = f.stripe_subscription_id limit 1));
  v_area := case when v_rest is null then 'restaurante' else public.area_da_conta(v_rest) end;

  -- ── Afiliado ──
  -- Quem é restaurante ou empresa (restaurante_id preenchido) não ganha
  -- dinheiro por indicar: ganha desconto na própria mensalidade (indicações).
  select af.*
    into a
    from public.stripe_assinaturas s
    join public.afiliados af on af.id = s.afiliado_id
   where s.stripe_subscription_id = f.stripe_subscription_id
     and af.ativo = true
     and af.restaurante_id is null;

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

  -- ── Sócios / quem recebe, do software da conta ──
  base := pago - comissao;
  for d in
    select dr.*, coalesce(r.nome, dr.nome) as quem
      from public.divisao_receita dr
      left join public.recebedores r on r.id = dr.recebedor_id
     where dr.ativo = true and dr.area = v_area
     order by dr.created_at
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
      (p_fatura_id, 'divisao', d.id, d.quem, base, valor,
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

notify pgrst, 'reload schema';
