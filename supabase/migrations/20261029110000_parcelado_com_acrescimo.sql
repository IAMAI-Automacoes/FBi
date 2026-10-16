-- Parcelado com acréscimo: o custo a mais do cartão parcelado vai para o cliente.
--
-- Decisão do dono (16/10/2026): o Asaas cobra uma taxa maior no parcelado
-- (12x: 1 ponto percentual a mais que o à vista; 6x: meio ponto). Essa
-- diferença é repassada a quem parcela, para o parcelado render o mesmo que o
-- à vista. Antes era "sem juros, mesmo total".
--
--   anual     à vista R$1.764  →  12x de R$148,50 (total R$1.782)
--   semestral à vista R$1.002  →   6x de R$168,00 (total R$1.008)
--
-- O total do parcelado fica no banco, editável (as taxas do Asaas mudam em
-- 05/01/2027). Nulo = parcelado pelo mesmo total do à vista.
--
-- Pode rodar mais de uma vez.

alter table public.planos_precos add column if not exists total_parcelado_centavos integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planos_precos_total_parcelado_check') then
    alter table public.planos_precos add constraint planos_precos_total_parcelado_check
      check (total_parcelado_centavos is null or total_parcelado_centavos > 0);
  end if;
end $$;
comment on column public.planos_precos.total_parcelado_centavos is
  'Total cobrado no parcelado (em parcelas_max vezes), com o acréscimo da taxa do cartão parcelado. Nulo = mesmo total do à vista.';

update public.planos_precos
   set total_parcelado_centavos = case ciclo when 'anual' then 178200 when 'semestral' then 100800 end,
       atualizado_em = now(),
       atualizado_por = 'migration 20261029110000'
 where total_parcelado_centavos is null
   and ciclo in ('anual', 'semestral');

notify pgrst, 'reload schema';
