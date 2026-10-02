-- Notificações por APARELHO (navegador), não por conta.
--
-- Até aqui, silenciar valia para a conta inteira (preferencias_conversa):
-- silenciou no PC, o celular também parava. Agora cada aparelho decide o seu.
-- O id do aparelho é gerado no navegador (src/lib/aparelho.ts, localStorage)
-- e vai junto na inscrição de push, para a enviar-push filtrar por inscrição.
-- Fixar conversa continua por conta (preferencias_conversa.fixada_em).

-- ---------------------------------------------------------------------------
-- 1. Silêncios por aparelho
-- ---------------------------------------------------------------------------
-- A linha existir = silenciado. conversa '' = o canal inteiro (sino do topo).
create table if not exists public.silencios_aparelho (
  auth_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  aparelho text not null check (length(aparelho) between 8 and 64),
  canal text not null check (canal in ('whatsapp', 'suporte', 'suporte_admin')),
  conversa text not null default '',
  criado_em timestamptz not null default now(),
  primary key (auth_user_id, aparelho, canal, conversa)
);

alter table public.silencios_aparelho enable row level security;

drop policy if exists silencios_proprios on public.silencios_aparelho;
create policy silencios_proprios on public.silencios_aparelho
  for all using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

comment on table public.silencios_aparelho is
  'Conversas/canais silenciados em cada aparelho (navegador). conversa = '''' vale para o canal inteiro. Lida pela enviar-push por inscrição e pelos sons da página.';

-- Abas abertas no mesmo aparelho veem a mudança na hora.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'silencios_aparelho'
  ) then
    alter publication supabase_realtime add table public.silencios_aparelho;
  end if;
end $$;
alter table public.silencios_aparelho replica identity full;

comment on column public.preferencias_conversa.silenciada is
  'OBSOLETA desde 03/10/2026: o silenciar passou a ser por aparelho (silencios_aparelho). Esta tabela guarda só o fixar.';

-- ---------------------------------------------------------------------------
-- 2. Inscrição de push com o aparelho, e troca de conta no mesmo navegador
-- ---------------------------------------------------------------------------
alter table public.push_subscriptions add column if not exists aparelho text;

-- O endpoint é único por navegador. Pela RLS, a conta nova não conseguia
-- assumir a inscrição deixada pela anterior (o upsert batia na linha da outra
-- pessoa): o aparelho seguia recebendo as notificações da conta antiga.
-- Quem está logado no navegador agora é quem recebe.
create or replace function public.registrar_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text,
  p_aparelho text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sem login';
  end if;
  insert into public.push_subscriptions (auth_user_id, endpoint, p256dh, auth, user_agent, aparelho)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent, nullif(p_aparelho, ''))
  on conflict (endpoint) do update
     set auth_user_id = excluded.auth_user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         aparelho = excluded.aparelho;
end;
$$;
revoke all on function public.registrar_push(text, text, text, text, text) from public, anon;
grant execute on function public.registrar_push(text, text, text, text, text) to authenticated;

-- Inscrições dos admins, agora com o aparelho (silêncio por aparelho).
drop function if exists public.admin_push_subscriptions();
create function public.admin_push_subscriptions()
returns table(auth_user_id uuid, endpoint text, p256dh text, auth text, aparelho text)
language sql
security definer
set search_path = public
as $$
  select ps.auth_user_id, ps.endpoint, ps.p256dh, ps.auth, ps.aparelho
  from public.push_subscriptions ps
  join auth.users u on u.id = ps.auth_user_id
  join public.platform_admins pa on lower(pa.email) = lower(u.email);
$$;
revoke all on function public.admin_push_subscriptions() from public;
grant execute on function public.admin_push_subscriptions() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Gatilhos do suporte mandam os anexos (e o id da conversa)
-- ---------------------------------------------------------------------------
-- Mensagem só com foto/arquivo virava "Enviou uma nova mensagem."; com os
-- arquivos, a notificação diz "📷 Foto", "📄 PDF"… E o id da conversa deixa o
-- clique abrir direto nela no painel do admin (/admin?conversa=<id>).
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
    v_body := jsonb_build_object('tipo','sugestao','sugestao_id', NEW.id, 'usuario_id', NEW.usuario_id,
                                 'texto', NEW.texto, 'titulo', NEW.titulo, 'arquivos', NEW.arquivos);
  else
    v_body := jsonb_build_object('tipo','resposta','sugestao_id', NEW.sugestao_id, 'texto', NEW.texto,
                                 'arquivos', NEW.arquivos);
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

create or replace function public.notificar_push_suporte_dono()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select valor into v_secret from public.integracao_config where chave = 'PUSH_TRIGGER_SECRET';
  if v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/enviar-push',
    body := jsonb_build_object('tipo', 'suporte_resposta', 'sugestao_id', new.sugestao_id, 'texto', new.texto,
                               'arquivos', new.arquivos),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trigger-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;
revoke execute on function public.notificar_push_suporte_dono() from public, anon, authenticated;
