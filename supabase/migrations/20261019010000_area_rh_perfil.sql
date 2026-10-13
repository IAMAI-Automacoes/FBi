-- Versão RH: o perfil da empresa.
--
-- A conta de restaurante descreve o negócio por tipo de culinária e número de
-- mesas. A conta RH pode ser de qualquer empresa: o que a descreve é o ramo e
-- quantos funcionários tem. São colunas próprias (em vez de reaproveitar
-- `tipo_culinaria` e `numero_mesas`) para a IA não ler "culinária: comércio".
-- Vazias na conta de restaurante.
--
-- Pode rodar mais de uma vez.

alter table public.restaurantes
  add column if not exists ramo text,
  add column if not exists numero_funcionarios integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurantes_numero_funcionarios_check') then
    alter table public.restaurantes
      add constraint restaurantes_numero_funcionarios_check check (numero_funcionarios is null or numero_funcionarios between 1 and 100000);
  end if;
end $$;

comment on column public.restaurantes.ramo is 'Versão RH: o ramo da empresa (comércio, saúde, serviços…), escrito no onboarding. A IA usa como contexto.';
comment on column public.restaurantes.numero_funcionarios is 'Versão RH: quantos funcionários a empresa tem, informado no onboarding.';
