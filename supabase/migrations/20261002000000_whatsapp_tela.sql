-- Tela "WhatsApp" do painel: leitura por conversa, lista de conversas e push.
--
-- A captura (mensagens_whatsapp + bucket "mensagens") já existe. Isto é o que a
-- TELA precisa a mais:
--   1. saber até onde o dono já leu cada conversa (contador de não lidas);
--   2. listar as conversas sem baixar o histórico inteiro;
--   3. avisar o dono no celular quando chega mensagem (Web Push).

-- ---------------------------------------------------------------------------
-- 1. Leitura por conversa
-- ---------------------------------------------------------------------------
-- Uma linha por (restaurante, conversa): até quando o dono já leu. Gravada pela
-- função whatsapp-instancia (ação marcar-lidas), que também marca como lida no
-- WhatsApp de verdade — o cliente vê os tiques azuis (decisão do Raver, 01/10).
create table if not exists public.mensagens_whatsapp_leitura (
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  chat_id text not null,
  lido_ate timestamptz not null,
  atualizado_em timestamptz not null default now(),
  primary key (restaurante_id, chat_id)
);

alter table public.mensagens_whatsapp_leitura enable row level security;

drop policy if exists leitura_select on public.mensagens_whatsapp_leitura;
create policy leitura_select on public.mensagens_whatsapp_leitura
  for select using (restaurante_id = public.get_user_restaurante_id());

drop policy if exists leitura_insert on public.mensagens_whatsapp_leitura;
create policy leitura_insert on public.mensagens_whatsapp_leitura
  for insert with check (restaurante_id = public.get_user_restaurante_id());

drop policy if exists leitura_update on public.mensagens_whatsapp_leitura;
create policy leitura_update on public.mensagens_whatsapp_leitura
  for update using (restaurante_id = public.get_user_restaurante_id())
  with check (restaurante_id = public.get_user_restaurante_id());

comment on table public.mensagens_whatsapp_leitura is
  'Até quando o dono leu cada conversa da tela WhatsApp. Base do contador de não lidas.';

-- Badge do menu zera em todas as abas abertas quando uma conversa é lida.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensagens_whatsapp_leitura'
  ) then
    alter publication supabase_realtime add table public.mensagens_whatsapp_leitura;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Lista de conversas
-- ---------------------------------------------------------------------------
-- Uma linha por chat_id com a última mensagem e as não lidas. security invoker:
-- a RLS de mensagens_whatsapp continua valendo, então cada dono só lista o que
-- é dele mesmo passando outro p_restaurante_id.
--
-- Não lida = mensagem RECEBIDA (sem contar reação nem apagada) depois do que
-- for mais recente entre:
--   - lido_ate (o dono abriu a conversa no painel);
--   - a última mensagem que o DONO mandou pelo celular (de_mim e não por_api).
--     Quem respondeu, leu — como no WhatsApp. A resposta automática do EasyFeed
--     (por_api) não conta: ela sai em toda conversa de feedback.
create or replace function public.conversas_whatsapp(p_restaurante_id bigint)
returns table (
  chat_id text,
  nome_exibicao text,
  telefone text,
  grupo boolean,
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
  nao_lidas integer
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
                   coalesce(d.respondeu_em, '-infinity'::timestamptz)))
    from ultimas u
    left join nomes n on n.chat_id = u.chat_id
    left join dono d on d.chat_id = u.chat_id
    left join public.mensagens_whatsapp_leitura l
           on l.restaurante_id = p_restaurante_id and l.chat_id = u.chat_id
   order by u.enviada_em desc
$$;

revoke execute on function public.conversas_whatsapp(bigint) from public, anon;
grant execute on function public.conversas_whatsapp(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Push quando chega mensagem
-- ---------------------------------------------------------------------------
-- Mesmo caminho do push de suporte (notificar_push_admin): o gatilho chama a
-- função enviar-push com o segredo, e ela decide para quem e o quê mostrar.
-- Grupos notificam também (decisão do Raver, 01/10). Reação só notifica se for
-- numa mensagem do restaurante — quem filtra é a função.
create or replace function public.notificar_push_whatsapp()
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
    body := jsonb_build_object('tipo', 'whatsapp', 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trigger-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

revoke execute on function public.notificar_push_whatsapp() from public, anon, authenticated;

drop trigger if exists trg_mensagens_whatsapp_push on public.mensagens_whatsapp;
create trigger trg_mensagens_whatsapp_push
  after insert on public.mensagens_whatsapp
  for each row when (new.de_mim = false)
  execute function public.notificar_push_whatsapp();
