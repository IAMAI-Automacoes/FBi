-- Preferências sincronizadas entre abas/aparelhos e pesquisa por relevância.

-- ---------------------------------------------------------------------------
-- 1. Silenciar/fixar em tempo real
-- ---------------------------------------------------------------------------
-- As preferências eram lidas uma vez, ao abrir a tela: silenciar numa aba não
-- chegava nas outras abas abertas, que continuavam tocando o som. Com o
-- Realtime, toda aba e todo aparelho veem a mudança na hora (a RLS da tabela
-- vale também aqui: cada pessoa só recebe as próprias).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'preferencias_conversa'
  ) then
    alter publication supabase_realtime add table public.preferencias_conversa;
  end if;
end $$;
alter table public.preferencias_conversa replica identity full;

-- ---------------------------------------------------------------------------
-- 2. Pesquisa: exatos primeiro, depois parecidos
-- ---------------------------------------------------------------------------
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- Minúsculas, sem acento, sem pontuação, espaços colapsados. É a mesma regra
-- de normalizarBusca em src/lib/whatsapp/formatacao.ts. O dicionário é
-- passado explícito para a função poder ser imutável.
create or replace function public.normalizar_busca(t text)
returns text
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select btrim(regexp_replace(
           regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;

-- Duas letras vizinhas trocadas ("fira" → "fria"): o erro de digitação mais
-- comum, que a distância de edição conta como 2 diferenças.
create or replace function public.difere_por_troca(a text, b text)
returns boolean
language sql
immutable
parallel safe
as $$
  select length(a) = length(b) and length(a) >= 2 and a <> b and exists (
    select 1 from generate_series(1, length(a) - 1) as i
     where overlay(a placing substr(a, i + 1, 1) || substr(a, i, 1) from i for 2) = b
  )
$$;

-- relevancia:
--   1 = aparece exatamente como foi escrito;
--   2 = aparece ignorando acento, maiúscula e pontuação;
--   3 = parecido: cada palavra pesquisada bate com alguma palavra da mensagem
--       por começo de palavra, por até 1 letra de diferença (2 em palavras
--       com mais de 7 letras) ou por duas letras vizinhas trocadas; ou a
--       frase toda é semelhante (trigramas).
-- security invoker: a RLS de mensagens_whatsapp vale (outro restaurante volta vazio).
create or replace function public.pesquisar_mensagens_whatsapp(
  p_restaurante_id bigint,
  p_termo text,
  p_chat_id text default null,
  p_limite integer default 60
)
returns table (
  id bigint,
  message_id text,
  chat_id text,
  telefone text,
  nome_exibicao text,
  de_mim boolean,
  por_api boolean,
  grupo boolean,
  tipo text,
  texto text,
  transcricao text,
  reacao text,
  responde_message_id text,
  midia_caminho text,
  midia_mime text,
  midia_nome text,
  status text,
  editada_em timestamptz,
  enviada_em timestamptz,
  remetente text,
  relevancia integer,
  semelhanca real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with alvo as (
    select btrim(coalesce(p_termo, '')) as termo, public.normalizar_busca(p_termo) as norm
  ),
  base as (
    select m.*,
           concat_ws(' ', m.texto, m.transcricao, m.midia_nome) as tudo,
           public.normalizar_busca(concat_ws(' ', m.texto, m.transcricao, m.midia_nome)) as tudo_norm
      from public.mensagens_whatsapp m, alvo a
     where m.restaurante_id = p_restaurante_id
       and (p_chat_id is null or m.chat_id = p_chat_id)
       and m.tipo <> 'reaction'
       and m.status is distinct from 'DELETED'
       and length(a.termo) >= 2
       and coalesce(m.texto, m.transcricao, m.midia_nome) is not null
  ),
  pontuada as (
    select b.*,
           case
             when position(a.termo in b.tudo) > 0 then 1
             when a.norm <> '' and position(a.norm in b.tudo_norm) > 0 then 2
             else 3
           end as rel,
           case when a.norm <> '' then extensions.word_similarity(a.norm, b.tudo_norm) else 0 end::real as sim,
           a.norm
      from base b, alvo a
  )
  select p.id, p.message_id, p.chat_id, p.telefone, p.nome_exibicao, p.de_mim, p.por_api, p.grupo, p.tipo,
         p.texto, p.transcricao, p.reacao, p.responde_message_id, p.midia_caminho, p.midia_mime, p.midia_nome,
         p.status, p.editada_em, p.enviada_em, p.payload -> 'message' ->> 'senderName', p.rel, p.sim
    from pontuada p
   where p.rel < 3
      or (p.norm <> '' and (
            p.sim >= 0.6
            or not exists (
              select 1
                from unnest(string_to_array(p.norm, ' ')) as tw
               where length(tw) > 0
                 and not exists (
                   select 1
                     from unnest(string_to_array(p.tudo_norm, ' ')) as w
                    where length(w) between 1 and 60
                      and (
                        (length(tw) >= 3 and w like tw || '%')
                        or extensions.levenshtein(w, tw) <=
                             case when length(tw) <= 3 then 0 when length(tw) <= 7 then 1 else 2 end
                        or (length(tw) >= 3 and public.difere_por_troca(w, tw))
                      )
                 )
            )
          ))
   order by p.rel, case when p.rel = 3 then -p.sim else 0 end, p.enviada_em desc
   limit greatest(1, least(coalesce(p_limite, 60), 200))
$$;

revoke execute on function public.pesquisar_mensagens_whatsapp(bigint, text, text, integer) from public, anon;
grant execute on function public.pesquisar_mensagens_whatsapp(bigint, text, text, integer) to authenticated;
