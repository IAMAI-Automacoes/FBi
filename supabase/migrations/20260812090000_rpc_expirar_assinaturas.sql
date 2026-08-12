-- Expira as assinaturas vencidas e devolve a lista de instâncias a derrubar
-- (contas NÃO ativas, com token, que NÃO são admin da plataforma). A edge
-- function `expirar-assinaturas` chama isto e faz o DELETE na uazapi + limpa o
-- token de cada uma.
--
-- Admins são de propósito poupados: não pagam (ficam 'sem_assinatura'), então
-- sem essa exceção o cron derrubaria a instância de teste deles todo dia.
create or replace function public.assinaturas_expirar_e_listar()
returns table (id bigint, whatsapp_token text, whatsapp_base_url text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) mantém até a data paga; vencida vira 'cancelada'
  update public.restaurantes
     set assinatura_status = 'cancelada'
   where assinatura_status = 'ativa'
     and assinatura_expira_em is not null
     and assinatura_expira_em < now();

  -- 2) instâncias a liberar: não-ativas, com token, e não-admin
  return query
    select r.id, r.whatsapp_token, r.whatsapp_base_url
    from public.restaurantes r
    where r.assinatura_status <> 'ativa'
      and r.whatsapp_token is not null
      and not exists (
        select 1 from public.platform_admins pa
        join auth.users u on u.id = r.auth_user_id
        where lower(pa.email) = lower(u.email)
      );
end;
$$;

revoke all on function public.assinaturas_expirar_e_listar() from public;
grant execute on function public.assinaturas_expirar_e_listar() to service_role;