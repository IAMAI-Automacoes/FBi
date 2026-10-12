-- Equipe: onde começa a conversa de cada feedback (a janela de sigilo).
--
-- Achado no primeiro teste real (12/10/2026): a pessoa deu um feedback, tocou em
-- "Mostrar meu nome" e, 49 segundos depois, mandou outro, que ficou anônimo. A
-- janela do segundo começava no REGISTRO do primeiro, então escondeu junto a
-- pergunta, o toque e a confirmação do primeiro: na tela WhatsApp o feedback
-- identificado aparecia sem o botão e sem a resposta.
--
-- Agora a janela de um feedback novo começa na primeira mensagem que a pessoa
-- mandou depois do feedback anterior (toque em botão não conta). O que é do
-- anterior fica com o anterior.
--
-- A função é a mesma da 20261015000000, só com esse trecho trocado. Pode rodar
-- mais de uma vez.

create or replace function public.equipe_registrar_feedback(
  p_restaurante_id bigint,
  p_telefone text,
  p_texto text,
  p_sentimento text,
  p_pontos jsonb,
  p_sensivel boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_func       public.equipe_funcionarios%rowtype;
  v_conv       public.equipe_convites%rowtype;
  v_aberta     public.equipe_autorias%rowtype;
  v_original   uuid;
  v_autoria    uuid;
  v_primeiro   boolean;
  v_anterior   timestamptz;
  v_primeira   timestamptz;
  v_perguntado timestamptz;
  v_ate        timestamptz;
  v_janela     timestamptz;
  v_perguntar  boolean := true;
  v_ponto      jsonb;
  v_sent       text;
  v_texto      text := left(btrim(coalesce(p_texto, '')), 6000);
begin
  select * into v_func
    from public.equipe_funcionarios f
   where f.restaurante_id = p_restaurante_id
     and f.ativo
     and public.telefone_chave(f.telefone) = public.telefone_chave(p_telefone)
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_da_equipe');
  end if;
  if v_texto = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sem_texto');
  end if;

  -- Quando esta pessoa falou pela última vez (nulo = nunca).
  select max(a.criado_em) into v_anterior
    from public.equipe_autorias a
   where a.funcionario_id = v_func.id;
  v_primeiro := v_anterior is null;

  -- A que pedido esta resposta pertence: o último PEDIDO que saiu para a pessoa.
  select c.* into v_conv
    from public.equipe_convites c
    join public.equipe_envios e on e.id = c.envio_id
   where c.funcionario_id = v_func.id
     and c.status = 'enviado'
     and e.tipo = 'pedido'
     and c.enviado_em > now() - interval '30 days'
   order by c.enviado_em desc
   limit 1;

  insert into public.feedbacks_originais (restaurante_id, texto_original, sentimento, publico)
  values (p_restaurante_id, v_texto, nullif(btrim(coalesce(p_sentimento, '')), ''), 'equipe')
  returning id into v_original;

  for v_ponto in select * from jsonb_array_elements(coalesce(p_pontos, '[]'::jsonb)) loop
    v_sent := case
      when v_ponto ->> 'sentimento' ilike '%negativ%' then 'Negativo'
      when v_ponto ->> 'sentimento' ilike '%sugest%' then 'Sugestão'
      when v_ponto ->> 'sentimento' ilike '%positiv%' then 'Positivo'
      when v_ponto ->> 'sentimento' ilike '%neutr%' then 'Neutro'
    end;
    continue when v_sent is null or btrim(coalesce(v_ponto ->> 'texto_original', v_ponto ->> 'resumo', '')) = '';
    insert into public.feedbacks_restaurante (restaurante_id, origem_id, texto_original, categoria, sentimento, resumo, publico)
    values (
      p_restaurante_id,
      v_original,
      left(coalesce(nullif(btrim(v_ponto ->> 'texto_original'), ''), v_ponto ->> 'resumo'), 1000),
      coalesce(nullif(btrim(v_ponto ->> 'categoria'), ''), 'Outros'),
      v_sent,
      left(coalesce(nullif(btrim(v_ponto ->> 'resumo'), ''), v_ponto ->> 'texto_original'), 120),
      'equipe');
  end loop;

  -- Pergunta no ar, feita agora há pouco: o botão que está na tela vale para
  -- este também (mesmo prazo, mesma janela de sigilo).
  select * into v_aberta
    from public.equipe_autorias a
   where a.funcionario_id = v_func.id
     and a.identidade = 'pendente'
     and a.perguntado_em > now() - interval '10 minutes'
     and (a.identidade_ate is null or a.identidade_ate > now())
   order by a.perguntado_em desc
   limit 1;

  if v_aberta.id is not null then
    v_perguntado := v_aberta.perguntado_em;
    v_ate := v_aberta.identidade_ate;
    v_janela := v_aberta.janela_inicio;
    v_perguntar := false;
  else
    -- Onde começa a conversa DESTE feedback. Quando a pessoa já falou antes, é
    -- na primeira mensagem que ela mandou depois do feedback anterior ter sido
    -- registrado (o toque num botão não conta: ele ainda é a resposta do
    -- anterior). Assim a pergunta, o toque e a confirmação do feedback anterior
    -- continuam com ele, e não somem quando este fica anônimo.
    if v_anterior is not null then
      select min(m.enviada_em) into v_primeira
        from public.mensagens_whatsapp m
       where m.restaurante_id = p_restaurante_id
         and public.telefone_chave(m.telefone) = public.telefone_chave(v_func.telefone)
         and not m.de_mim
         and not coalesce(m.grupo, false)
         and m.enviada_em > v_anterior
         and coalesce(m.interativo ->> 'tipo', '') <> 'escolha';
    end if;
    -- Do pedido para cá (ou da última meia hora, sem pedido recente), mas nunca
    -- antes do feedback anterior desta pessoa: o que ela já decidiu fica como
    -- está. Sem achar a mensagem (ela ainda está sendo gravada), vale o registro
    -- do feedback anterior: esconde um pouco mais, nunca menos.
    v_janela := greatest(
      coalesce(
        case when v_conv.enviado_em > now() - interval '7 days' then v_conv.enviado_em - interval '1 minute' end,
        now() - interval '30 minutes'),
      coalesce(v_primeira - interval '1 second', v_anterior, '-infinity'::timestamptz));
  end if;

  insert into public.equipe_autorias
    (restaurante_id, feedback_original_id, funcionario_id, envio_id, identidade,
     perguntado_em, identidade_ate, janela_inicio, sensivel)
  values
    (p_restaurante_id, v_original, v_func.id, v_conv.envio_id, 'pendente',
     v_perguntado, v_ate, v_janela, coalesce(p_sensivel, false))
  returning id into v_autoria;

  if v_conv.id is not null and v_conv.respondeu_em is null then
    update public.equipe_convites set respondeu_em = now() where id = v_conv.id;
  end if;

  -- Enquanto a pessoa não escolhe, a conversa fica fora da tela WhatsApp.
  update public.mensagens_whatsapp m
     set oculta = true
   where m.restaurante_id = p_restaurante_id
     and not m.oculta
     and not coalesce(m.grupo, false)
     and (not m.de_mim or m.por_api)
     and public.telefone_chave(m.telefone) = public.telefone_chave(v_func.telefone)
     and m.enviada_em >= v_janela;

  return jsonb_build_object(
    'ok', true,
    'original_id', v_original,
    'autoria_id', v_autoria,
    'identidade', 'pendente',
    'primeiro', v_primeiro,
    'perguntar_identidade', v_perguntar,
    'sensivel', coalesce(p_sensivel, false),
    'prazo_horas', (extract(epoch from public.equipe_prazo_identidade()) / 3600)::int);
end;
$$;
revoke all on function public.equipe_registrar_feedback(bigint, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.equipe_registrar_feedback(bigint, text, text, text, jsonb, boolean) to service_role;

-- Os feedbacks que já existiam ganham a janela pela regra nova, e a tela mostra
-- de novo o que não precisa de sigilo.
with nova as (
  select a.id,
         (select min(m.enviada_em) - interval '1 second'
            from public.mensagens_whatsapp m
            join public.equipe_funcionarios f on f.id = a.funcionario_id
           where m.restaurante_id = a.restaurante_id
             and public.telefone_chave(m.telefone) = public.telefone_chave(f.telefone)
             and not m.de_mim
             and not coalesce(m.grupo, false)
             and coalesce(m.interativo ->> 'tipo', '') <> 'escolha'
             and m.enviada_em <= a.criado_em
             and m.enviada_em > (select max(b.criado_em) from public.equipe_autorias b
                                  where b.funcionario_id = a.funcionario_id and b.criado_em < a.criado_em)) as inicio
    from public.equipe_autorias a
   where exists (select 1 from public.equipe_autorias b where b.funcionario_id = a.funcionario_id and b.criado_em < a.criado_em)
)
update public.equipe_autorias a
   set janela_inicio = n.inicio
  from nova n
 where n.id = a.id
   and n.inicio is not null
   and n.inicio > a.janela_inicio;

select public.equipe_revelar_mensagens();
