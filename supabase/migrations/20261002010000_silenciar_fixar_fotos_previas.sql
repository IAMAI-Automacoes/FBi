-- Silenciar e fixar conversas, fotos na lista do WhatsApp, push de resposta do
-- suporte para o dono e cache de prévia de link.

-- ---------------------------------------------------------------------------
-- 1. Preferências por pessoa: silenciar e fixar
-- ---------------------------------------------------------------------------
-- Uma tabela para os três lugares que têm conversas:
--   canal 'whatsapp'      → tela WhatsApp do dono (conversa = chat_id)
--   canal 'suporte'       → chat de suporte do dono (só o canal inteiro)
--   canal 'suporte_admin' → painel de suporte do admin (conversa = usuario_id)
-- conversa = '' é o canal INTEIRO (o sino do topo: "silenciar tudo").
-- Fixar não tem limite (pedido do Raver; o WhatsApp limita a 3).
create table if not exists public.preferencias_conversa (
  auth_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  canal text not null check (canal in ('whatsapp', 'suporte', 'suporte_admin')),
  conversa text not null default '',
  silenciada boolean not null default false,
  fixada_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (auth_user_id, canal, conversa)
);

alter table public.preferencias_conversa enable row level security;

drop policy if exists pref_proprias on public.preferencias_conversa;
create policy pref_proprias on public.preferencias_conversa
  for all using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

comment on table public.preferencias_conversa is
  'Silenciar/fixar conversas, por pessoa. conversa = '''' vale para o canal inteiro. Lida pela enviar-push antes de notificar.';

-- ---------------------------------------------------------------------------
-- 2. Lista do WhatsApp com foto, fixada e silenciada
-- ---------------------------------------------------------------------------
-- A foto vem do próprio evento da uazapi (payload->chat->imagePreview): é um
-- link do WhatsApp que expira depois de um tempo, por isso a da mensagem MAIS
-- RECENTE. A tela cai nas iniciais se o link não abrir.
-- Mudou o formato do retorno: precisa dropar e recriar.
drop function if exists public.conversas_whatsapp(bigint);
create function public.conversas_whatsapp(p_restaurante_id bigint)
returns table (
  chat_id text,
  nome_exibicao text,
  telefone text,
  grupo boolean,
  foto_url text,
  ultima_message_id text,
  ultima_tipo text,
  ultima_texto text,
  ultima_de_mim boolean,
  ultima_por_api boolean,
  ultima_status text,
  ultima_midia_nome text,
  ultima_reacao text,
  ultima_remetente text,
  ultima_enviada_em timestamptz,
  nao_lidas integer,
  silenciada boolean,
  fixada_em timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with ultimas as (
    select distinct on (m.chat_id) m.*
      from public.mensagens_whatsapp m
     where m.restaurante_id = p_restaurante_id
     order by m.chat_id, m.enviada_em desc, m.id desc
  ),
  nomes as (
    select distinct on (m.chat_id) m.chat_id, m.nome_exibicao
      from public.mensagens_whatsapp m
     where m.restaurante_id = p_restaurante_id and m.nome_exibicao is not null
     order by m.chat_id, m.enviada_em desc
  ),
  dono as (
    select m.chat_id, max(m.enviada_em) as respondeu_em
      from public.mensagens_whatsapp m
     where m.restaurante_id = p_restaurante_id and m.de_mim and not m.por_api
     group by m.chat_id
  )
  select u.chat_id,
         coalesce(n.nome_exibicao, u.nome_exibicao),
         case when u.grupo then null else u.telefone end,
         u.grupo,
         nullif(coalesce(nullif(u.payload -> 'chat' ->> 'imagePreview', ''), u.payload -> 'chat' ->> 'image'), ''),
         u.message_id,
         u.tipo,
         u.texto,
         u.de_mim,
         u.por_api,
         u.status,
         u.midia_nome,
         u.reacao,
         u.payload -> 'message' ->> 'senderName',
         u.enviada_em,
         (select count(*)::integer
            from public.mensagens_whatsapp x
           where x.restaurante_id = p_restaurante_id
             and x.chat_id = u.chat_id
             and not x.de_mim
             and x.tipo <> 'reaction'
             and x.status is distinct from 'DELETED'
             and x.enviada_em > greatest(
                   coalesce(l.lido_ate, '-infinity'::timestamptz),
                   coalesce(d.respondeu_em, '-infinity'::timestamptz))),
         coalesce(p.silenciada, false),
         p.fixada_em
    from ultimas u
    left join nomes n on n.chat_id = u.chat_id
    left join dono d on d.chat_id = u.chat_id
    left join public.mensagens_whatsapp_leitura l
           on l.restaurante_id = p_restaurante_id and l.chat_id = u.chat_id
    left join public.preferencias_conversa p
           on p.auth_user_id = auth.uid() and p.canal = 'whatsapp' and p.conversa = u.chat_id
   order by p.fixada_em desc nulls last, u.enviada_em desc
$$;

revoke execute on function public.conversas_whatsapp(bigint) from public, anon;
grant execute on function public.conversas_whatsapp(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Push do suporte: o admin silencia; o dono passa a receber a resposta
-- ---------------------------------------------------------------------------
-- A enviar-push precisa saber DE QUEM é cada inscrição de admin para respeitar
-- o "silenciar" de cada um. Mudou o retorno: dropar e recriar.
drop function if exists public.admin_push_subscriptions();
create function public.admin_push_subscriptions()
returns table(auth_user_id uuid, endpoint text, p256dh text, auth text)
language sql
security definer
set search_path = public
as $$
  select ps.auth_user_id, ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  join auth.users u on u.id = ps.auth_user_id
  join public.platform_admins pa on lower(pa.email) = lower(u.email);
$$;
revoke all on function public.admin_push_subscriptions() from public;
grant execute on function public.admin_push_subscriptions() to service_role;

-- Resposta do SUPORTE (autor diferente de 'usuario') → push para o dono da
-- conversa. Até aqui só o admin era avisado (quando o cliente escrevia).
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
    body := jsonb_build_object('tipo', 'suporte_resposta', 'sugestao_id', new.sugestao_id, 'texto', new.texto),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trigger-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;
revoke execute on function public.notificar_push_suporte_dono() from public, anon, authenticated;

drop trigger if exists trg_push_resposta_suporte_dono on public.respostas_sugestoes;
create trigger trg_push_resposta_suporte_dono
  after insert on public.respostas_sugestoes
  for each row when (new.autor <> 'usuario')
  execute function public.notificar_push_suporte_dono();

-- ---------------------------------------------------------------------------
-- 4. Cache da prévia de link (imagem/título do site)
-- ---------------------------------------------------------------------------
-- Preenchido pela função previa-link (chave de serviço). Sem política de
-- acesso de propósito: a tela só fala com a função, nunca com a tabela.
create table if not exists public.previas_link (
  url text primary key,
  ok boolean not null,
  titulo text,
  descricao text,
  imagem text,
  site text,
  url_final text,
  buscado_em timestamptz not null default now()
);
alter table public.previas_link enable row level security;
comment on table public.previas_link is
  'Cache da prévia (Open Graph) dos links das mensagens do WhatsApp. Só a função previa-link lê e grava.';
