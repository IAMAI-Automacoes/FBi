-- E-mail da conta direto na linha do restaurante.
--
-- Até aqui, para saber de quem é um restaurante era preciso cruzar
-- restaurantes.auth_user_id com auth.users (que o painel do Supabase e o n8n
-- não mostram junto) ou com usuarios (que é a pessoa, e pode faltar). Agora o
-- e-mail de login aparece na própria tabela.
--
-- A fonte da verdade continua sendo auth.users: esta coluna é um espelho, e
-- ninguém escreve nela. Dois gatilhos mantêm o espelho:
--   1. em restaurantes, antes de inserir/atualizar, copia o e-mail do dono
--      (qualquer valor mandado pela API é sobrescrito);
--   2. em auth.users, quando o e-mail de login muda, repassa para o restaurante.

alter table public.restaurantes
  add column if not exists email text;

comment on column public.restaurantes.email is
  'E-mail de login da conta (espelho de auth.users.email via auth_user_id). Não editar: muda sozinho quando o e-mail de login muda.';

create or replace function public.restaurantes_copiar_email_da_conta()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Sem dono (conta excluída), o último e-mail fica como registro.
  if new.auth_user_id is not null then
    new.email := (select u.email from auth.users u where u.id = new.auth_user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restaurantes_copiar_email_da_conta on public.restaurantes;
create trigger trg_restaurantes_copiar_email_da_conta
  before insert or update on public.restaurantes
  for each row execute function public.restaurantes_copiar_email_da_conta();

create or replace function public.auth_repassar_email_ao_restaurante()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.restaurantes set email = new.email where auth_user_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_auth_repassar_email_ao_restaurante on auth.users;
create trigger trg_auth_repassar_email_ao_restaurante
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.auth_repassar_email_ao_restaurante();

revoke execute on function public.restaurantes_copiar_email_da_conta() from public, anon, authenticated;
revoke execute on function public.auth_repassar_email_ao_restaurante() from public, anon, authenticated;

-- Preenche os que já existem.
update public.restaurantes r
   set email = u.email
  from auth.users u
 where u.id = r.auth_user_id;
