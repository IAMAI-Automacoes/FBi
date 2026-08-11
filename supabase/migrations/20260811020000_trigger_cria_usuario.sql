-- Cria a linha de PESSOA (usuarios) automaticamente quando um restaurante é
-- inserido. O cadastro/login fazem `update usuarios(...)` contando com essa
-- linha existir; sem o trigger, contas novas ficavam sem linha de pessoa (nome/
-- avatar não salvavam e o Settings — que lê de usuarios — ficava em branco).
create or replace function public.criar_usuario_para_restaurante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, restaurante_id)
  values (new.auth_user_id, new.id)
  on conflict (id) do update set restaurante_id = excluded.restaurante_id;
  return new;
end;
$$;

drop trigger if exists trg_criar_usuario_restaurante on public.restaurantes;
create trigger trg_criar_usuario_restaurante
after insert on public.restaurantes
for each row execute function public.criar_usuario_para_restaurante();
