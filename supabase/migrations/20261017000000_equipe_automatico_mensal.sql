-- Equipe: o pedido automático mensal sai num dia do mês escolhido pelo dono.
--
-- Até aqui "todo mês" contava 30 dias a partir do último pedido. Agora segue o
-- calendário: no começo do mês (dia 1) ou no dia que o dono escolher. Quem
-- calcula a data é a função equipe (regra em _shared/equipe.ts): 10h de
-- Brasília, domingo vira segunda e, em mês mais curto, vale o último dia dele.
--
-- O dia só existe no mensal (cada_dias = 30); nas outras frequências fica vazio.
-- Pode rodar mais de uma vez.

alter table public.equipe_automatico
  add column if not exists dia_do_mes smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipe_automatico_dia_do_mes_check') then
    alter table public.equipe_automatico
      add constraint equipe_automatico_dia_do_mes_check check (dia_do_mes is null or dia_do_mes between 1 and 31);
  end if;
end $$;

comment on column public.equipe_automatico.dia_do_mes is
  'Só no mensal (cada_dias = 30): o dia do mês em que o pedido sai. 1 = começo do mês. Vazio no mensal antigo vale 1.';
