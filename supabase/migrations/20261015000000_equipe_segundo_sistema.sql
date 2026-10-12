-- Equipe como segundo sistema: o que foi feito para os clientes, revisto regra
-- por regra para quem TRABALHA no restaurante (decisões do Raver, 12/10/2026).
--
--   1. O botão do anonimato sai em TODO feedback; texto de boas-vindas só no
--      primeiro (o banco diz qual é o primeiro).
--   2. Insights da equipe com gatilho próprio (config_insights.equipe).
--   3. Aviso para a equipe toda quando uma ação é concluída (equipe_envios.tipo).
--   4. Pedido de feedback automático (equipe_automatico).
--
-- Pode rodar mais de uma vez (create or replace / if not exists).

-- ---------------------------------------------------------------------------
-- 1. Pedido x aviso
-- ---------------------------------------------------------------------------
-- 'pedido' = pede a opinião da equipe (o que já existia).
-- 'aviso'  = conta para a equipe toda o que mudou quando uma ação é concluída.
alter table public.equipe_envios add column if not exists tipo text not null default 'pedido';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipe_envios_tipo_check') then
    alter table public.equipe_envios add constraint equipe_envios_tipo_check check (tipo in ('pedido', 'aviso'));
  end if;
end $$;
alter table public.equipe_envios add column if not exists acao_id bigint references public.acoes_operacionais(id) on delete set null;
create index if not exists equipe_envios_acao_idx on public.equipe_envios (acao_id) where acao_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Grava o feedback de um funcionário
-- ---------------------------------------------------------------------------
-- Mudou em relação à 20261014000000:
--   * devolve `primeiro` (é o primeiro feedback desta pessoa): o n8n manda as
--     boas-vindas só nele; nos seguintes, só o botão;
--   * pergunta em TODO feedback. Só não repete quando já existe uma pergunta no
--     ar feita há menos de 10 minutos (a pessoa mandando várias em seguida): aí
--     o botão que está na tela vale para todas;
--   * não herda mais a escolha do feedback anterior: cada um tem a sua;
--   * a janela de sigilo começa depois do feedback anterior, para não esconder
--     de novo uma conversa que a pessoa já deixou mostrar;
--   * a resposta só é ligada a um PEDIDO (aviso de ação concluída não conta).
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
    -- Do pedido para cá (ou da última meia hora, sem pedido recente), mas nunca
    -- antes do feedback anterior desta pessoa: o que ela já decidiu fica como está.
    v_janela := greatest(
      coalesce(
        case when v_conv.enviado_em > now() - interval '7 days' then v_conv.enviado_em - interval '1 minute' end,
        now() - interval '30 minutes'),
      coalesce(v_anterior, '-infinity'::timestamptz));
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

-- ---------------------------------------------------------------------------
-- 3. Insights da equipe: gatilho com configuração própria
-- ---------------------------------------------------------------------------
-- Cliente: `config_insights.feedbacks_por_analise` (padrão 6, de 3 a 30).
-- Equipe:  `config_insights.equipe.feedbacks_por_analise` (padrão 3, de 1 a 30):
-- a equipe fala bem menos que o salão, e esperar 6 pontos novos adiava a análise
-- por semanas.
create or replace function public.deve_gerar_insights(p_restaurante_id bigint, p_publico text default 'cliente')
returns table(deve boolean, livres_novos bigint, necessarios integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cfg as (
    select
      case when p_publico = 'equipe'
        then least(greatest(coalesce((r.config_insights -> 'equipe' ->> 'feedbacks_por_analise')::int, 3), 1), 30)
        else least(greatest(coalesce((r.config_insights ->> 'feedbacks_por_analise')::int, 6), 3), 30)
      end as necessarios,
      coalesce(case when p_publico = 'equipe' then r.ultima_analise_insights_equipe else r.ultima_analise_insights end,
               '-infinity'::timestamptz) as marco
    from public.restaurantes r
    where r.id = p_restaurante_id
      and r.excluida_em is null
  ),
  contagem as (
    select count(*) as livres
    from public.feedbacks_livres f, cfg
    where f.restaurante_id = p_restaurante_id
      and f.publico = p_publico
      and f.created_at > cfg.marco
      and f.invalidado_em is null
  )
  select contagem.livres >= cfg.necessarios, contagem.livres, cfg.necessarios
  from cfg, contagem;
$function$;
revoke all on function public.deve_gerar_insights(bigint, text) from public, anon, authenticated;
grant execute on function public.deve_gerar_insights(bigint, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Pedido automático
-- ---------------------------------------------------------------------------
-- O sistema pede feedback sozinho de tempos em tempos. Quem lê e grava é a
-- função `equipe` (chave de serviço): sem política nenhuma, a tela não alcança
-- a tabela direto.
create table if not exists public.equipe_automatico (
  restaurante_id  bigint primary key references public.restaurantes(id) on delete cascade,
  ativo           boolean not null default false,
  -- Toda semana, a cada 15 dias ou todo mês.
  cada_dias       integer not null default 30 check (cada_dias in (7, 14, 30)),
  pergunta        text not null,
  -- Quando o próximo pedido entra na fila (10h de Brasília, nunca no domingo).
  proximo_em      timestamptz,
  ultimo_em       timestamptz,
  -- Por que o último não saiu (WhatsApp desconectado, ninguém para receber).
  ultimo_erro     text,
  atualizado_por  text,
  atualizado_em   timestamptz not null default now()
);
create index if not exists equipe_automatico_vencidos_idx on public.equipe_automatico (proximo_em) where ativo;
alter table public.equipe_automatico enable row level security;
revoke all on public.equipe_automatico from anon, authenticated;
