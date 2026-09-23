-- Conta de vendedor volta a ser igual à de qualquer restaurante.
--
-- Decisão do dono: o vendedor não ganha acesso sozinho. Para não pagar, ele usa
-- um cupom, como qualquer conta. O que continua diferente é só a demonstração
-- (o código no perfil e o /demo) e, na tela, poder pular a conexão do WhatsApp
-- no onboarding.
--
-- Sai o trigger que fazia a conta de um email marcado nascer ativa, e sai a
-- troca de assinatura ao marcar e desmarcar — com as colunas que guardavam o
-- status de antes. Marcar ou desmarcar não mexe mais em assinatura nenhuma.
drop trigger if exists trg_restaurantes_vendedor_ativo on public.restaurantes;
drop function if exists public.ativar_conta_de_vendedor();

create or replace function public.admin_definir_vendedor(p_email text, p_vendedor boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user  uuid;
begin
  if not public.eh_admin_plataforma_ou_console() then
    raise exception 'Só o admin da plataforma' using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email inválido' using errcode = '22023';
  end if;

  if p_vendedor then
    insert into public.vendedores (email, criado_por)
    values (v_email, auth.email())
    on conflict (email) do nothing;
    return;
  end if;

  if not exists (select 1 from public.vendedores v where v.email = v_email) then
    return;
  end if;

  -- Fecha as demonstrações abertas desta conta antes de tirar a marca.
  select u.id into v_user from auth.users u where lower(u.email) = v_email limit 1;
  delete from auth.sessions a
   using public.sessoes_demo s
   where s.email_vendedor = v_email and s.session_id = a.id;
  delete from auth.sessions a
   where a.user_id = v_user
     and exists (select 1 from auth.mfa_amr_claims c
                  where c.session_id = a.id and c.authentication_method in ('magiclink', 'otp'));

  delete from public.vendedores v where v.email = v_email;
end;
$$;

alter table public.vendedores
  drop column if exists assinatura_anterior,
  drop column if exists expira_anterior;

comment on table public.vendedores is
  'Emails de vendedores. A conta é igual à de qualquer restaurante (paga com cupom); a marca só libera o código da demonstração no perfil e o pular do WhatsApp no onboarding.';
