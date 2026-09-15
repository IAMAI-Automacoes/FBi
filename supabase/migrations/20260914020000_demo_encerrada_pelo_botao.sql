-- Demonstração encerrada pelo botão "Encerrar demonstração" ficava parecendo aberta.
--
-- O botão faz logout só daquela aba, e o próprio Supabase apaga a sessão de
-- `auth.sessions` — sem passar por `encerrar_sessoes_demo`. O registro em
-- `sessoes_demo` ficava sem `encerrada_em` para sempre. A varredura de cada
-- minuto passa a fechar também o registro cuja sessão já não existe.
create or replace function public.encerrar_sessoes_demo()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer := 0;
  m integer := 0;
begin
  with vencidas as (
    update public.sessoes_demo s
       set encerrada_em = now()
     where s.encerrada_em is null
       and s.session_id is not null
       and s.expira_em <= now()
    returning s.session_id
  ), apagadas as (
    delete from auth.sessions a using vencidas v where a.id = v.session_id returning 1
  )
  select count(*) into n from apagadas;

  -- Link mágico de vendedor que nunca foi registrado: vale no máximo 2 h.
  delete from auth.sessions a
   where a.created_at < now() - interval '120 minutes'
     and exists (select 1 from auth.mfa_amr_claims c
                  where c.session_id = a.id and c.authentication_method in ('magiclink', 'otp'))
     and exists (select 1 from auth.users u join public.vendedores v on v.email = lower(u.email)
                  where u.id = a.user_id)
     and not exists (select 1 from public.sessoes_demo s where s.session_id = a.id);
  get diagnostics m = row_count;

  -- Encerrada por logout (botão da tela) ou por qualquer outro caminho: a sessão
  -- sumiu, o registro fecha junto.
  update public.sessoes_demo s
     set encerrada_em = now()
   where s.encerrada_em is null
     and s.session_id is not null
     and not exists (select 1 from auth.sessions a where a.id = s.session_id);

  -- Código aceito cujo link nunca virou sessão.
  update public.sessoes_demo
     set encerrada_em = now()
   where session_id is null and encerrada_em is null and criado_em < now() - interval '10 minutes';

  delete from public.demo_tentativas where criado_em < now() - interval '1 day';

  return n + m;
end;
$$;
