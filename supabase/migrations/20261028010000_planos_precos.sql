-- Preços dos planos, no banco.
--
-- Antes vinham do Stripe (função `get-prices`, por lookup_key). Com o Stripe
-- removido, o preço mora aqui: uma linha por software e ciclo, editável pelo
-- admin, lida direto pela landing e pela tela de planos (é informação
-- pública). Continua valendo a regra da casa: nenhum valor fixo no código.
--
-- Os valores iniciais são os que estavam no Stripe. A versão RH usa os mesmos
-- planos e valores, por enquanto (ver `RECURSOS_DO_RH` no front).
--
-- Pode rodar mais de uma vez.

create table if not exists public.planos_precos (
  area           text    not null check (area in ('restaurante', 'rh')),
  ciclo          text    not null check (ciclo in ('mensal', 'semestral', 'anual')),
  -- Total cobrado a cada ciclo, em centavos.
  total_centavos integer not null check (total_centavos > 0),
  ativo          boolean not null default true,
  atualizado_por text,
  atualizado_em  timestamptz not null default now(),
  primary key (area, ciclo)
);

comment on table public.planos_precos is
  'Preço de cada plano por software. Público para leitura; só admin da plataforma altera.';

alter table public.planos_precos enable row level security;

drop policy if exists planos_precos_leitura_publica on public.planos_precos;
create policy planos_precos_leitura_publica on public.planos_precos
  for select to anon, authenticated
  using (ativo);

drop policy if exists planos_precos_admin on public.planos_precos;
create policy planos_precos_admin on public.planos_precos
  for all to authenticated
  using      (exists (select 1 from public.platform_admins where email = auth.email()))
  with check (exists (select 1 from public.platform_admins where email = auth.email()));

insert into public.planos_precos (area, ciclo, total_centavos)
values
  ('restaurante', 'mensal',    19700),
  ('restaurante', 'semestral', 100200),
  ('restaurante', 'anual',     176400),
  ('rh',          'mensal',    19700),
  ('rh',          'semestral', 100200),
  ('rh',          'anual',     176400)
on conflict (area, ciclo) do nothing;
