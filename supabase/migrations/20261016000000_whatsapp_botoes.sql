-- Tela WhatsApp: botões, listas e as respostas a eles.
--
-- A uazapi entrega essas mensagens com o conteúdo dentro de `message.content`,
-- num formato diferente para cada tipo (conferido com eventos reais do Camelo,
-- 08 a 12/10/2026):
--
--   NativeFlowMessage           botões que o EasyFeed manda (/send/menu, type button)
--   ButtonsMessage              botões "clássicos" que alguém manda para o restaurante
--   TemplateMessage             modelo de empresa (título, texto, rodapé, botões)
--   ListMessage                 menu de lista (um botão que abre as opções)
--   TemplateButtonReplyMessage  o toque num botão do NativeFlow/modelo
--   ButtonsResponseMessage      o toque num botão clássico
--   ListResponseMessage         a escolha de um item da lista
--
-- Até aqui o workflow "Simulação Whatsapp" gravava essas mensagens como texto
-- sem texto (balão vazio) ou como "outro" ("mensagem não suportada"): os botões
-- e a resposta não apareciam na tela.
--
-- A tradução fica AQUI, no banco, e não no n8n: o evento cru já é guardado em
-- `payload`, então o mesmo código serve para as mensagens novas (gatilho) e
-- para as que já estavam gravadas (o update no fim), e o workflow não muda.
--
-- Pode rodar mais de uma vez.

alter table public.mensagens_whatsapp add column if not exists interativo jsonb;
comment on column public.mensagens_whatsapp.interativo is
  'Botões, lista ou a resposta a eles, já no formato da tela (ver whatsapp_interativo). Nulo nas mensagens comuns.';

-- Texto que deveria ser JSON (o `buttonParamsJSON` dos botões). Inválido = nulo.
create or replace function public.jsonb_de_texto(p_texto text)
returns jsonb
language plpgsql
immutable
as $$
begin
  return p_texto::jsonb;
exception when others then
  return null;
end;
$$;

-- O evento da uazapi → o que a tela desenha. Nulo = mensagem comum.
--
--   { "tipo": "botoes", "titulo", "corpo", "rodape",
--     "botoes": [ { "id", "texto", "tipo": "resposta" | "link" | "ligar" | "copiar" | "outro", "valor" } ] }
--   { "tipo": "lista", "titulo", "corpo", "rodape", "botao_lista",
--     "secoes": [ { "titulo", "itens": [ { "id", "titulo", "descricao" } ] } ] }
--   { "tipo": "escolha", "escolha": { "id", "texto" } }      -- o toque no botão ou no item
create or replace function public.whatsapp_interativo(p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  m        jsonb := coalesce(p_payload -> 'message', '{}'::jsonb);
  c        jsonb;
  h        jsonb;
  t        text;
  v_id     text;
  v_texto  text;
  v_botoes jsonb;
  v_secoes jsonb;
begin
  if jsonb_typeof(m) <> 'object' then
    return null;
  end if;
  c := case when jsonb_typeof(m -> 'content') = 'object' then m -> 'content' else '{}'::jsonb end;
  t := coalesce(m ->> 'messageType', '');

  -- 1. A ESCOLHA: o toque num botão ou num item de lista. A uazapi põe o id em
  --    `buttonOrListid` em todos os formatos. (Enquete também usa `vote`, mas
  --    sem id e com outro messageType: não entra aqui.)
  v_id := nullif(btrim(coalesce(m ->> 'buttonOrListid', '')), '');
  if v_id is not null
     or t in ('ButtonsResponseMessage', 'TemplateButtonReplyMessage', 'ListResponseMessage', 'InteractiveResponseMessage') then
    v_texto := coalesce(
      nullif(btrim(c ->> 'selectedDisplayText'), ''),                -- TemplateButtonReplyMessage
      nullif(btrim(c -> 'Response' ->> 'SelectedDisplayText'), ''),  -- ButtonsResponseMessage
      nullif(btrim(c ->> 'title'), ''),                              -- ListResponseMessage
      nullif(btrim(m ->> 'vote'), ''),
      v_id);
    if v_texto is null then
      return null;
    end if;
    return jsonb_strip_nulls(jsonb_build_object(
      'tipo', 'escolha',
      'escolha', jsonb_build_object(
        'id', coalesce(v_id, nullif(c ->> 'selectedID', ''), nullif(c ->> 'selectedButtonID', ''),
                       nullif(c -> 'singleSelectReply' ->> 'selectedRowID', '')),
        'texto', v_texto)));
  end if;

  -- O modelo de empresa mais novo (TemplateMessage com Format) embrulha o mesmo
  -- formato dos botões de fluxo: título, texto, rodapé e botões.
  if jsonb_typeof(c -> 'Format' -> 'InteractiveMessageTemplate') = 'object' then
    c := c -> 'Format' -> 'InteractiveMessageTemplate';
  end if;

  -- 2. Botões de fluxo (o que sai do /send/menu com type "button").
  if jsonb_typeof(c -> 'InteractiveMessage' -> 'NativeFlowMessage' -> 'buttons') = 'array' then
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', nullif(q.p ->> 'id', ''),
             'texto', coalesce(nullif(btrim(q.p ->> 'display_text'), ''), nullif(btrim(q.p ->> 'title'), ''), 'Botão'),
             'tipo', case x.b ->> 'name'
                       when 'quick_reply' then 'resposta'
                       when 'cta_url' then 'link'
                       when 'cta_call' then 'ligar'
                       when 'cta_copy' then 'copiar'
                       else 'outro' end,
             'valor', coalesce(nullif(q.p ->> 'url', ''), nullif(q.p ->> 'phone_number', ''), nullif(q.p ->> 'copy_code', ''))
           )) order by x.ord)
      into v_botoes
      from jsonb_array_elements(c -> 'InteractiveMessage' -> 'NativeFlowMessage' -> 'buttons') with ordinality as x(b, ord)
      cross join lateral (select coalesce(public.jsonb_de_texto(x.b ->> 'buttonParamsJSON'), '{}'::jsonb) as p) q;
    return jsonb_strip_nulls(jsonb_build_object(
      'tipo', 'botoes',
      'titulo', nullif(btrim(c -> 'header' ->> 'title'), ''),
      'corpo', nullif(btrim(coalesce(c -> 'body' ->> 'text', m ->> 'text')), ''),
      'rodape', nullif(btrim(c -> 'footer' ->> 'text'), ''),
      'botoes', coalesce(v_botoes, '[]'::jsonb)));
  end if;

  -- 3. Botões clássicos.
  if jsonb_typeof(c -> 'buttons') = 'array' then
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', nullif(x.b ->> 'buttonID', ''),
             'texto', coalesce(nullif(btrim(x.b -> 'buttonText' ->> 'displayText'), ''), nullif(x.b ->> 'buttonID', ''), 'Botão'),
             'tipo', 'resposta'
           )) order by x.ord)
      into v_botoes
      from jsonb_array_elements(c -> 'buttons') with ordinality as x(b, ord);
    return jsonb_strip_nulls(jsonb_build_object(
      'tipo', 'botoes',
      'titulo', nullif(btrim(coalesce(c -> 'Header' ->> 'Text', c -> 'Header' ->> 'text')), ''),
      'corpo', nullif(btrim(coalesce(c ->> 'contentText', m ->> 'text')), ''),
      'rodape', nullif(btrim(c ->> 'footerText'), ''),
      'botoes', coalesce(v_botoes, '[]'::jsonb)));
  end if;

  -- 4. Modelo de empresa (banco, operadora…): título, texto, rodapé e botões
  --    de resposta, de link ou de ligação.
  h := c -> 'hydratedTemplate';
  if jsonb_typeof(h) = 'object' then
    if jsonb_typeof(h -> 'hydratedButtons') = 'array' then
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', nullif(x.b -> 'HydratedButton' -> 'QuickReplyButton' ->> 'ID', ''),
               'texto', coalesce(
                 nullif(btrim(x.b -> 'HydratedButton' -> 'QuickReplyButton' ->> 'displayText'), ''),
                 nullif(btrim(x.b -> 'HydratedButton' -> 'UrlButton' ->> 'displayText'), ''),
                 nullif(btrim(x.b -> 'HydratedButton' -> 'CallButton' ->> 'displayText'), ''),
                 'Botão'),
               'tipo', case
                         when x.b -> 'HydratedButton' ? 'QuickReplyButton' then 'resposta'
                         when x.b -> 'HydratedButton' ? 'UrlButton' then 'link'
                         when x.b -> 'HydratedButton' ? 'CallButton' then 'ligar'
                         else 'outro' end,
               'valor', coalesce(
                 nullif(x.b -> 'HydratedButton' -> 'UrlButton' ->> 'URL', ''),
                 nullif(x.b -> 'HydratedButton' -> 'CallButton' ->> 'phoneNumber', ''))
             )) order by x.ord)
        into v_botoes
        from jsonb_array_elements(h -> 'hydratedButtons') with ordinality as x(b, ord);
    end if;
    return jsonb_strip_nulls(jsonb_build_object(
      'tipo', 'botoes',
      'titulo', nullif(btrim(h -> 'Title' ->> 'HydratedTitleText'), ''),
      'corpo', nullif(btrim(coalesce(h ->> 'hydratedContentText', m ->> 'text')), ''),
      'rodape', nullif(btrim(h ->> 'hydratedFooterText'), ''),
      'botoes', coalesce(v_botoes, '[]'::jsonb)));
  end if;

  -- 5. Menu de lista: um botão que abre as opções, em seções.
  if jsonb_typeof(c -> 'sections') = 'array' then
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'titulo', nullif(btrim(s.sec ->> 'title'), ''),
             'itens', coalesce((
               select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                        'id', nullif(r.linha ->> 'rowID', ''),
                        'titulo', coalesce(nullif(btrim(r.linha ->> 'title'), ''), nullif(r.linha ->> 'rowID', ''), 'Opção'),
                        'descricao', nullif(btrim(r.linha ->> 'description'), '')
                      )) order by r.ord)
                 from jsonb_array_elements(case when jsonb_typeof(s.sec -> 'rows') = 'array' then s.sec -> 'rows' else '[]'::jsonb end)
                      with ordinality as r(linha, ord)
             ), '[]'::jsonb)
           )) order by s.ord)
      into v_secoes
      from jsonb_array_elements(c -> 'sections') with ordinality as s(sec, ord);
    return jsonb_strip_nulls(jsonb_build_object(
      'tipo', 'lista',
      'titulo', nullif(btrim(c ->> 'title'), ''),
      'corpo', nullif(btrim(c ->> 'description'), ''),
      'rodape', nullif(btrim(c ->> 'footerText'), ''),
      'botao_lista', nullif(btrim(c ->> 'buttonText'), ''),
      'secoes', coalesce(v_secoes, '[]'::jsonb)));
  end if;

  return null;
end;
$$;

-- O texto da mensagem quando o evento veio sem ele: é o que a lista de
-- conversas mostra como prévia e o que a busca encontra.
create or replace function public.whatsapp_texto_do_interativo(p_interativo jsonb)
returns text
language sql
immutable
as $$
  select case p_interativo ->> 'tipo'
    when 'escolha' then p_interativo -> 'escolha' ->> 'texto'
    else nullif(concat_ws(E'\n', p_interativo ->> 'titulo', p_interativo ->> 'corpo'), '')
  end
$$;

create or replace function public.mensagens_whatsapp_interativo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.interativo := public.whatsapp_interativo(new.payload);
  if new.interativo is not null and coalesce(btrim(new.texto), '') = '' then
    new.texto := public.whatsapp_texto_do_interativo(new.interativo);
  end if;
  return new;
exception when others then
  -- Formato que ninguém previu nunca pode impedir a mensagem de ser gravada.
  new.interativo := null;
  return new;
end;
$$;

drop trigger if exists trg_mensagens_whatsapp_interativo on public.mensagens_whatsapp;
create trigger trg_mensagens_whatsapp_interativo
  before insert on public.mensagens_whatsapp
  for each row execute function public.mensagens_whatsapp_interativo();

-- As mensagens que já estavam gravadas ganham os botões também.
with achadas as (
  select m.id, public.whatsapp_interativo(m.payload) as i
    from public.mensagens_whatsapp m
   where m.payload is not null
     and (m.payload -> 'message' ->> 'messageType' in (
            'NativeFlowMessage', 'InteractiveMessage', 'ButtonsMessage', 'TemplateMessage', 'ListMessage',
            'TemplateButtonReplyMessage', 'ButtonsResponseMessage', 'ListResponseMessage', 'InteractiveResponseMessage')
          or coalesce(m.payload -> 'message' ->> 'buttonOrListid', '') <> '')
)
update public.mensagens_whatsapp m
   set interativo = a.i,
       texto = case when coalesce(btrim(m.texto), '') = '' then public.whatsapp_texto_do_interativo(a.i) else m.texto end
  from achadas a
 where a.id = m.id
   and a.i is not null
   and m.interativo is distinct from a.i;
