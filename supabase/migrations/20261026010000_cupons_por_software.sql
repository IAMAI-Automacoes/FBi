-- Cupons por software, com desconto e o tipo de conta que o cupom cria.
--
-- Decisões do Raver (15/10/2026):
--   - cada cupom é de UM software (Restaurante ou RH); o resgate recusa cupom
--     de outro software (`resgatar-cupom`);
--   - o cupom pode dar desconto em % ou em R$ (as colunas já existiam, sem uso).
--     O desconto fica guardado e entra na cobrança quando o pagamento novo
--     (Asaas) chegar; até lá o Stripe não muda. Cupom só de desconto parcial
--     não libera o acesso (a regra está em supabase/functions/_shared/cupom.ts);
--   - o cupom escolhe o tipo de conta que cria: normal, vendedor ou admin. O de
--     admin é OBRIGADO a ter número de usos (até 20) e data de validade: quem
--     souber o código vira admin da plataforma.
--   - `cupons_usos` guarda quem usou cada cupom e o desconto que ficou guardado.
--
-- Os cupons que existiam viram cupons do restaurante, de conta normal. Pode
-- rodar mais de uma vez.

alter table public.cupons add column if not exists area text not null default 'restaurante';
alter table public.cupons add column if not exists tipo_conta text not null default 'normal';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cupons_area_check') then
    alter table public.cupons add constraint cupons_area_check check (area in ('restaurante', 'rh'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cupons_tipo_conta_check') then
    alter table public.cupons add constraint cupons_tipo_conta_check check (tipo_conta in ('normal', 'vendedor', 'admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cupons_admin_com_limite') then
    alter table public.cupons add constraint cupons_admin_com_limite check (
      tipo_conta <> 'admin' or (vezes_uso_maximo between 1 and 20 and data_expiracao is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cupons_desconto_valido') then
    alter table public.cupons add constraint cupons_desconto_valido check (
      (porcentagem_desconto is null or porcentagem_desconto between 0 and 100)
      and (valor_desconto is null or valor_desconto >= 0));
  end if;
end $$;
comment on column public.cupons.area is 'De qual software é o cupom: só conta daquele software resgata.';
comment on column public.cupons.tipo_conta is 'O que a conta vira ao resgatar: normal, vendedor (entra em vendedores) ou admin (entra em platform_admins).';

create table if not exists public.cupons_usos (
  id                   uuid primary key default gen_random_uuid(),
  cupom_id             bigint references public.cupons (id) on delete set null,
  cupom                text not null,
  restaurante_id       bigint references public.restaurantes (id) on delete cascade,
  email                text,
  area                 text not null default 'restaurante',
  tipo_conta           text not null default 'normal',
  dias_validade        integer,
  porcentagem_desconto numeric,
  valor_desconto       numeric,
  usado_em             timestamptz not null default now()
);
comment on table public.cupons_usos is
  'Cada resgate de cupom: quem usou e o desconto que ficou guardado para a cobrança (o pagamento novo lê daqui). Grava só a função resgatar-cupom.';
create index if not exists cupons_usos_restaurante_idx on public.cupons_usos (restaurante_id, usado_em desc);
alter table public.cupons_usos enable row level security;
drop policy if exists admins_leem_cupons_usos on public.cupons_usos;
create policy admins_leem_cupons_usos on public.cupons_usos
  for select to authenticated
  using (exists (select 1 from public.platform_admins where email = auth.email()));

notify pgrst, 'reload schema';
