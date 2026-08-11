-- Jobs diários de manutenção de assinatura (pg_cron).

-- 1) Expiração: assinatura 'ativa' com data vencida vira 'cancelada'.
--    É o que faz "manter até a data paga, depois perde acesso" — o dado fica.
create or replace function public.expirar_assinaturas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.restaurantes
     set assinatura_status = 'cancelada'
   where assinatura_status = 'ativa'
     and assinatura_expira_em is not null
     and assinatura_expira_em < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 2) Limpeza: apaga contas que são "só o login" — nunca pagaram (sem_assinatura),
--    nunca configuraram (onboarding incompleto, sem WhatsApp, sem feedback), não
--    são admin da plataforma, e têm mais de 7 dias. NUNCA toca em quem pagou
--    (ativa/cancelada/inadimplente não são 'sem_assinatura').
create or replace function public.limpar_contas_abandonadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  alvos uuid[];
begin
  select array_agg(r.auth_user_id) into alvos
  from public.restaurantes r
  where r.assinatura_status = 'sem_assinatura'
    and coalesce(r.onboarding_completo, false) = false
    and r.whatsapp_token is null
    and r.created_at < now() - interval '7 days'
    and not exists (select 1 from public.feedbacks_restaurante f where f.restaurante_id = r.id)
    and not exists (
      select 1 from public.platform_admins pa
      join auth.users u on u.id = r.auth_user_id
      where lower(pa.email) = lower(u.email)
    );

  if alvos is null or array_length(alvos, 1) is null then
    return 0;
  end if;

  delete from public.usuarios where id = any(alvos);   -- usuarios não tem FK cascade
  delete from auth.users where id = any(alvos);        -- cascata: restaurantes + push_subscriptions

  return array_length(alvos, 1);
end;
$$;

revoke all on function public.expirar_assinaturas() from public;
revoke all on function public.limpar_contas_abandonadas() from public;

-- 3) Agendamento diário. Nomes fixos → reagenda sem duplicar.
do $$ begin perform cron.unschedule('expirar-assinaturas'); exception when others then null; end $$;
select cron.schedule('expirar-assinaturas', '5 0 * * *', $$select public.expirar_assinaturas();$$);

do $$ begin perform cron.unschedule('limpar-contas-abandonadas'); exception when others then null; end $$;
select cron.schedule('limpar-contas-abandonadas', '20 4 * * *', $$select public.limpar_contas_abandonadas();$$);
