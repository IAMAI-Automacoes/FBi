-- Push notifications para o admin da plataforma (mensagens de clientes).
-- As chaves VAPID e o segredo do gatilho NÃO ficam aqui: vivem em
-- integracao_config (tabela privada), setados fora do controle de versão.

-- Inscrições de push por aparelho.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_sub_own_select on public.push_subscriptions;
drop policy if exists push_sub_own_insert on public.push_subscriptions;
drop policy if exists push_sub_own_update on public.push_subscriptions;
drop policy if exists push_sub_own_delete on public.push_subscriptions;
create policy push_sub_own_select on public.push_subscriptions for select using (auth_user_id = auth.uid());
create policy push_sub_own_insert on public.push_subscriptions for insert with check (auth_user_id = auth.uid());
create policy push_sub_own_update on public.push_subscriptions for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy push_sub_own_delete on public.push_subscriptions for delete using (auth_user_id = auth.uid());

create index if not exists idx_push_sub_user on public.push_subscriptions(auth_user_id);

-- Retorna só as inscrições de quem é admin da plataforma (o edge function usa via service_role).
create or replace function public.admin_push_subscriptions()
returns table(endpoint text, p256dh text, auth text)
language sql
security definer
set search_path = public
as $$
  select ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  join auth.users u on u.id = ps.auth_user_id
  join public.platform_admins pa on lower(pa.email) = lower(u.email);
$$;
revoke all on function public.admin_push_subscriptions() from public;
grant execute on function public.admin_push_subscriptions() to service_role;

-- Gatilho: nova mensagem de cliente -> chama o edge function que envia o push.
create or replace function public.notificar_push_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_url text := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/enviar-push';
  v_body jsonb;
begin
  select valor into v_secret from public.integracao_config where chave = 'PUSH_TRIGGER_SECRET';
  if v_secret is null then
    return null;
  end if;

  if TG_TABLE_NAME = 'sugestoes_plataforma' then
    v_body := jsonb_build_object('tipo','sugestao','usuario_id', NEW.usuario_id, 'texto', NEW.texto, 'titulo', NEW.titulo);
  else
    v_body := jsonb_build_object('tipo','resposta','sugestao_id', NEW.sugestao_id, 'texto', NEW.texto);
  end if;

  perform net.http_post(
    url := v_url,
    body := v_body,
    headers := jsonb_build_object('Content-Type','application/json','x-trigger-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

drop trigger if exists trg_push_nova_sugestao on public.sugestoes_plataforma;
create trigger trg_push_nova_sugestao
after insert on public.sugestoes_plataforma
for each row execute function public.notificar_push_admin();

drop trigger if exists trg_push_nova_resposta on public.respostas_sugestoes;
create trigger trg_push_nova_resposta
after insert on public.respostas_sugestoes
for each row when (NEW.autor = 'usuario')
execute function public.notificar_push_admin();
