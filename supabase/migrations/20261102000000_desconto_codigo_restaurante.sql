-- Desconto para quem compra com o código de um RESTAURANTE (decisão de 23/10/2026).
--
-- Até aqui só o código de vendedor/influenciador dava desconto a quem compra
-- (`afiliados.desconto_pct`, um por vendedor). O código de indicação de uma
-- conta EasyFeed passa a dar também, com a % e o número de cobranças num campo
-- próprio do admin (Admin → Descontos → Indicação), igual para todos os
-- restaurantes. 0% = desligado.
--
-- Regra dos descontos (não acumulam, "ou um ou outro"): na compra vale o maior
-- entre cupom e código (vendedor, influenciador ou restaurante). Só o saldo dos
-- vídeos soma por cima. No mês grátis de indicação não entra nenhum outro
-- desconto: código e vídeo ficam para a cobrança seguinte (asaas-webhook).

alter table public.indicacao_config
  add column if not exists desconto_indicado_pct numeric(5, 2) not null default 0,
  add column if not exists desconto_indicado_cobrancas integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'indicacao_config_desconto_indicado_check') then
    alter table public.indicacao_config add constraint indicacao_config_desconto_indicado_check
      check (desconto_indicado_pct between 0 and 100 and desconto_indicado_cobrancas between 1 and 24);
  end if;
end $$;
comment on column public.indicacao_config.desconto_indicado_pct is
  'Desconto (%) de quem compra com o código de um restaurante, nas desconto_indicado_cobrancas primeiras cobranças. 0 = nenhum.';

create or replace function public.indicacao_admin_desconto_indicado(p_pct numeric, p_cobrancas integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.indicacao_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then
    raise exception 'De 0%% a 100%%.' using errcode = '22023';
  end if;
  if p_cobrancas is null or p_cobrancas < 1 or p_cobrancas > 24 then
    raise exception 'De 1 a 24 cobranças.' using errcode = '22023';
  end if;
  update public.indicacao_config
     set desconto_indicado_pct = round(p_pct, 2), desconto_indicado_cobrancas = p_cobrancas,
         atualizado_em = now(), atualizado_por = lower(auth.email());
end;
$$;
revoke execute on function public.indicacao_admin_desconto_indicado(numeric, integer) from public, anon;
grant execute on function public.indicacao_admin_desconto_indicado(numeric, integer) to authenticated;

-- O desconto que um código dá a quem compra (tela de compra): o do vendedor,
-- ou o dos restaurantes (indicacao_config) se o código for de uma conta EasyFeed.
create or replace function public.indicacao_desconto_do_codigo(p_codigo text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case when a.restaurante_id is null
                then jsonb_build_object('pct', a.desconto_pct, 'cobrancas', a.desconto_cobrancas)
                else jsonb_build_object('pct', c.desconto_indicado_pct, 'cobrancas', c.desconto_indicado_cobrancas)
           end
      from public.afiliados a
      left join public.indicacao_config c on true
     where a.codigo = upper(btrim(coalesce(p_codigo, '')))
       and a.ativo
       and (case when a.restaurante_id is null then a.desconto_pct else coalesce(c.desconto_indicado_pct, 0) end) > 0
     limit 1
  ), jsonb_build_object('pct', 0, 'cobrancas', 0))
$$;
revoke execute on function public.indicacao_desconto_do_codigo(text) from public, anon;
grant execute on function public.indicacao_desconto_do_codigo(text) to authenticated;

notify pgrst, 'reload schema';
