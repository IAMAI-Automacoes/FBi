-- Feedback da equipe no MESMO motor dos clientes.
--
-- O desenho anterior (20261013000000) guardava as respostas da equipe em
-- tabelas próprias e falava por um número só do EasyFeed. O Raver mudou em
-- 11/10/2026: o funcionário fala com o MESMO WhatsApp do restaurante (o n8n
-- "Feedback Restaurante" separa quem é da equipe) e as páginas da equipe são
-- cópias de Feedbacks, Insights e Ações, com a mesma IA.
--
-- Como fica:
--   1. As tabelas do motor ganham a coluna `publico` ('cliente' | 'equipe').
--      Tudo o que já existe é 'cliente', e nada muda para os clientes.
--   2. O banco separa os dois por REQUISIÇÃO: a tela manda o cabeçalho
--      `x-publico: equipe` quando está nas páginas da equipe, e uma política
--      restritiva só deixa ver/gravar as linhas daquele público. Sem o
--      cabeçalho vale 'cliente': nenhuma tela dos clientes enxerga a equipe.
--      (As funções de IA usam a chave de serviço e filtram no código:
--      supabase/functions/_shared/publico.ts.)
--   3. Linha da equipe NUNCA guarda telefone. Quem falou fica em
--      `equipe_autorias`, que nenhuma tela lê direto: o nome só sai pela
--      função `equipe_autoria_visivel`, e só quando a pessoa deixou (ou não
--      respondeu a pergunta do anonimato no prazo).
--   4. Enquanto a pessoa não decide, e para sempre se pedir anonimato, a
--      conversa dela fica fora da tela WhatsApp do sistema (`oculta`).
--
-- Por enquanto só o admin da plataforma vê o público 'equipe'
-- (`equipe_liberada()`): para liberar aos donos, é ali que muda.

-- ---------------------------------------------------------------------------
-- 0. Sai o que era do desenho antigo (tabelas vazias: nunca chegou resposta)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.equipe_respostas)
     or exists (select 1 from public.equipe_pontos)
     or exists (select 1 from public.equipe_mensagens) then
    raise exception 'equipe_respostas, equipe_pontos ou equipe_mensagens têm dados: não apago sem olhar.';
  end if;
end $$;

drop view if exists public.equipe_respostas_anonimas;
drop function if exists public.equipe_pegar_mensagens_prontas(integer, integer);
drop table if exists public.equipe_pontos;
drop table if exists public.equipe_mensagens;
drop table if exists public.equipe_respostas;
alter table public.equipe_envios drop column if exists resumo, drop column if exists resumo_em;

-- ---------------------------------------------------------------------------
-- 1. De que público é esta requisição, e quem pode ver a equipe
-- ---------------------------------------------------------------------------
create or replace function public.publico_da_requisicao()
returns text
language sql
stable
set search_path = public
as $$
  -- Fora do PostgREST (cron, gatilho solto) não há cabeçalho: vale 'cliente'.
  select case
    when lower(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-publico', '')) = 'equipe'
      then 'equipe'
    else 'cliente'
  end
$$;

create or replace function public.equipe_liberada()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email()))
$$;

-- Quanto tempo a pessoa tem para responder a pergunta do anonimato.
create or replace function public.equipe_prazo_identidade()
returns interval
language sql
stable
security definer
set search_path = public
as $$
  select make_interval(hours => least(greatest(coalesce(
    (select nullif(btrim(valor), '')::int from public.integracao_config where chave = 'EQUIPE_PRAZO_IDENTIDADE_HORAS'),
    24), 1), 720))
$$;
revoke all on function public.equipe_prazo_identidade() from public, anon, authenticated;
grant execute on function public.equipe_prazo_identidade() to service_role;

-- ---------------------------------------------------------------------------
-- 2. A coluna `publico` nas tabelas do motor
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['feedbacks_originais', 'feedbacks_restaurante', 'feedback_temas', 'insights', 'acoes_operacionais'] loop
    execute format('alter table public.%I add column if not exists publico text not null default ''cliente''', t);
    if not exists (select 1 from pg_constraint where conname = t || '_publico_check') then
      execute format('alter table public.%I add constraint %I check (publico in (''cliente'', ''equipe''))', t, t || '_publico_check');
    end if;
    -- O padrão passa a ser o público da requisição: o que a tela cria nas
    -- páginas da equipe nasce 'equipe' sem a tela precisar dizer.
    execute format('alter table public.%I alter column publico set default public.publico_da_requisicao()', t);
    execute format('create index if not exists %I on public.%I (restaurante_id, publico)', t || '_publico_idx', t);
  end loop;
end $$;

alter table public.restaurantes add column if not exists ultima_analise_insights_equipe timestamptz;

-- Tema com o mesmo nome pode existir nos dois públicos.
drop index if exists public.uq_feedback_temas_rotulo;
create unique index if not exists uq_feedback_temas_rotulo on public.feedback_temas (restaurante_id, publico, lower(rotulo));

-- Feedback da equipe não guarda telefone nem vira contato (o gatilho do contato
-- roda depois deste, pela ordem alfabética do nome).
create or replace function public.feedback_da_equipe_sem_telefone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.publico = 'equipe' then
    new.telefone_cliente := null;
    new.contato_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_feedbacks_originais_a_equipe on public.feedbacks_originais;
create trigger trg_feedbacks_originais_a_equipe
  before insert or update on public.feedbacks_originais
  for each row execute function public.feedback_da_equipe_sem_telefone();

-- O ponto herda o público da mensagem de onde saiu.
create or replace function public.herdar_publico_do_ponto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.origem_id is not null then
    new.publico := coalesce((select fo.publico from public.feedbacks_originais fo where fo.id = new.origem_id), new.publico);
  end if;
  if new.publico = 'equipe' then
    new.telefone_cliente := null;
    new.contato_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_feedbacks_a_publico on public.feedbacks_restaurante;
create trigger trg_feedbacks_a_publico
  before insert on public.feedbacks_restaurante
  for each row execute function public.herdar_publico_do_ponto();

-- A ação criada a partir de um insight herda o público dele.
create or replace function public.herdar_publico_da_acao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.insight_id is not null then
    new.publico := coalesce((select i.publico from public.insights i where i.id = new.insight_id), new.publico);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acoes_a_publico on public.acoes_operacionais;
create trigger trg_acoes_a_publico
  before insert on public.acoes_operacionais
  for each row execute function public.herdar_publico_da_acao();

-- ---------------------------------------------------------------------------
-- 3. O banco separa os públicos (política restritiva, vale junto com as do restaurante)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['feedbacks_originais', 'feedbacks_restaurante', 'feedback_temas', 'insights', 'acoes_operacionais'] loop
    execute format('drop policy if exists publico_da_requisicao on public.%I', t);
    execute format($p$
      create policy publico_da_requisicao on public.%I as restrictive for all
        using (publico = public.publico_da_requisicao() and (publico = 'cliente' or public.equipe_liberada()))
        with check (publico = public.publico_da_requisicao() and (publico = 'cliente' or public.equipe_liberada()))
    $p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Quem falou (ninguém lê esta tabela pela tela)
-- ---------------------------------------------------------------------------
create table if not exists public.equipe_autorias (
  id                    uuid primary key default gen_random_uuid(),
  restaurante_id        bigint not null references public.restaurantes(id) on delete cascade,
  feedback_original_id  uuid not null unique references public.feedbacks_originais(id) on delete cascade,
  funcionario_id        bigint references public.equipe_funcionarios(id) on delete set null,
  -- Nulo = falou sem ter um pedido recente.
  envio_id              bigint references public.equipe_envios(id) on delete set null,
  -- pendente: a pessoa ainda não escolheu (o nome fica escondido);
  -- anonimo: pediu para não aparecer; identificado: deixou, ou o prazo passou.
  identidade            text not null default 'pendente' check (identidade in ('pendente', 'anonimo', 'identificado')),
  decidido_por          text check (decidido_por in ('pessoa', 'prazo')),
  decidido_em           timestamptz,
  -- Quando a pergunta do anonimato foi ENTREGUE. O prazo só conta daqui: se a
  -- pergunta não saiu, o nome fica escondido.
  perguntado_em         timestamptz,
  identidade_ate        timestamptz,
  -- De quando em diante a conversa desta pessoa fica fora da tela WhatsApp.
  janela_inicio         timestamptz not null default now(),
  -- Relato grave (assédio, discriminação, ameaça, risco à segurança): se o
  -- prazo passar sem resposta, fica ANÔNIMO em vez de mostrar o nome.
  sensivel              boolean not null default false,
  criado_em             timestamptz not null default now()
);
create index if not exists equipe_autorias_funcionario_idx on public.equipe_autorias (funcionario_id, criado_em desc);
create index if not exists equipe_autorias_pendentes_idx on public.equipe_autorias (identidade_ate) where identidade = 'pendente';
create index if not exists equipe_autorias_restaurante_idx on public.equipe_autorias (restaurante_id, criado_em desc);
alter table public.equipe_autorias enable row level security;
-- Sem política nenhuma: só a chave de serviço e as funções abaixo.

-- O que a tela pode saber de quem falou. Devolve o nome só quando a pessoa
-- está identificada; nos outros casos, só a situação.
create or replace function public.equipe_autoria_visivel(p_original_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.equipe_liberada() then null
    when not exists (select 1 from public.feedbacks_originais o
                      where o.id = p_original_id and o.restaurante_id = public.get_user_restaurante_id()) then null
    else coalesce((
      select case
        when f.id is not null and a.identidade = 'identificado'
          then jsonb_build_object('situacao', 'identificado', 'nome', f.nome, 'funcao', nullif(f.funcao, ''), 'sensivel', a.sensivel)
        -- Prazo vencido continua "pendente" até a rotina decidir (a cada 2 min):
        -- é ela que sabe se o relato grave segura o nome.
        when a.identidade = 'pendente'
          then jsonb_build_object('situacao', 'pendente', 'ate', a.identidade_ate, 'sensivel', a.sensivel)
        else jsonb_build_object('situacao', 'anonimo', 'sensivel', a.sensivel)
      end
      from public.equipe_autorias a
      left join public.equipe_funcionarios f on f.id = a.funcionario_id
      where a.feedback_original_id = p_original_id
    ), jsonb_build_object('situacao', 'anonimo', 'sensivel', false))
  end
$$;

-- ---------------------------------------------------------------------------
-- 5. As visões das telas passam a dizer o público (e a autoria, na equipe)
-- ---------------------------------------------------------------------------
create or replace view public.feedbacks_originais_view
with (security_invoker = true) as
 select o.id,
    o.restaurante_id,
    o.texto_original,
    o.texto_destacado,
    o.telefone_cliente,
    o.created_at,
    coalesce(o.sentimento,
        case
            when bool_or(lower(f.sentimento) = any (array['negativo'::text, 'negative'::text])) and bool_or(lower(f.sentimento) = any (array['positivo'::text, 'positive'::text])) then 'positivo e negativo'::text
            when bool_or(lower(f.sentimento) = any (array['negativo'::text, 'negative'::text])) then 'negativo'::text
            when bool_or(lower(f.sentimento) = any (array['positivo'::text, 'positive'::text])) then 'positivo'::text
            when bool_or(f.sentimento ~~* '%sugest%'::text) then 'Sugestão'::text
            else 'neutro'::text
        end) as sentimento,
    array_remove(array_agg(distinct f.categoria), null::text) as categorias,
    coalesce(o.texto_destacado, o.texto_original, nullif(string_agg(distinct coalesce(f.texto_original, f.resumo), '. '::text), ''::text)) as texto_exibicao,
    o.publico,
    case when o.publico = 'equipe' then public.equipe_autoria_visivel(o.id) end as autoria
   from public.feedbacks_originais o
     left join public.feedbacks_restaurante f on f.origem_id = o.id
  group by o.id, o.restaurante_id, o.texto_original, o.texto_destacado, o.telefone_cliente, o.created_at, o.sentimento, o.publico;

create or replace view public.feedbacks_livres
with (security_invoker = true) as
 select fr.id,
    fr.created_at,
    fr.texto_original,
    fr.categoria,
    fr.sentimento,
    fr.resumo,
    fr.telefone_cliente,
    fr.restaurante_id,
    fr.origem_id,
    fr.tema_id,
    fr.usado_em,
    fr.usado_por_insight_id,
    fr.usado_por_acao_id,
    fr.contato_id,
    fr.invalidado_em,
    fr.triado_em,
    fr.publico
   from public.feedbacks_restaurante fr
  where fr.triado_em is not null
    and (fr.sentimento ~~* '%positiv%'::text or fr.sentimento ~~* '%negativ%'::text or fr.sentimento ~~* '%sugest%'::text)
    and not (exists ( select 1
           from public.insight_feedback vi
             join public.insights i on i.id = vi.insight_id
          where vi.feedback_restaurante_id = fr.id and i.ativo and i.deletado_em is null))
    and not (exists ( select 1
           from public.feedback_acao fa
          where fa.feedback_restaurante_id = fr.id or fa.feedback_restaurante_id is null and fa.feedback_original_id = fr.origem_id and fr.created_at <= fa.created_at));

-- ---------------------------------------------------------------------------
-- 6. O motor de insights não mistura os públicos
-- ---------------------------------------------------------------------------
drop function if exists public.feedbacks_para_geracao(bigint, integer);
create or replace function public.feedbacks_para_geracao(p_restaurante_id bigint, p_dias integer default 14, p_publico text default 'cliente')
returns setof public.feedbacks_restaurante
language sql
stable
security definer
set search_path to 'public'
as $function$
  select fr.*
  from public.feedbacks_restaurante fr
  where fr.restaurante_id = p_restaurante_id
    and fr.publico = p_publico
    and fr.created_at >= now() - make_interval(days => p_dias)
    and fr.triado_em is not null
    and fr.invalidado_em is null
    -- Neutro não gera insight (ver 20261004010000).
    and (fr.sentimento ilike '%positiv%' or fr.sentimento ilike '%negativ%' or fr.sentimento ilike '%sugest%')
    and not exists (
      select 1 from public.feedback_acao fa
      where fa.feedback_restaurante_id = fr.id
         or (fa.feedback_restaurante_id is null
             and fa.feedback_original_id = fr.origem_id
             and fr.created_at <= fa.created_at))
    and not exists (
      select 1 from public.insight_feedback vi
      join public.insights i on i.id = vi.insight_id
      where vi.feedback_restaurante_id = fr.id
        and i.ativo
        and i.deletado_em is null)
$function$;
revoke all on function public.feedbacks_para_geracao(bigint, integer, text) from public, anon, authenticated;
grant execute on function public.feedbacks_para_geracao(bigint, integer, text) to service_role;

drop function if exists public.deve_gerar_insights(bigint);
create or replace function public.deve_gerar_insights(p_restaurante_id bigint, p_publico text default 'cliente')
returns table(deve boolean, livres_novos bigint, necessarios integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cfg as (
    select
      least(greatest(
        coalesce((r.config_insights ->> 'feedbacks_por_analise')::int, 6),
      3), 30) as necessarios,
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

-- O teto de 8 insights por aba conta cada público separado.
create or replace function public.aparar_insights_da_aba()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_aba text := public.aba_do_insight(new.prioridade);
begin
  -- Só apara quando o que entrou está de fato na tela.
  if not coalesce(new.ativo, false) or new.deletado_em is not null then
    return null;
  end if;

  update public.insights alvo
  set ativo = false,
      desativado_em = now(),
      deletado_em = now(),
      motivo_encerramento = 'excedente'
  where alvo.id in (
    select x.id
    from (
      select i.id,
             row_number() over (
               -- Fixados primeiro, para que nunca caiam na faixa de corte;
               -- depois os mais recentes. O `id` desempata para a ordem ser
               -- determinística quando dois nascem no mesmo instante — sem
               -- ele, duas execuções poderiam escolher vítimas diferentes.
               order by coalesce(i.fixado, false) desc, i.created_at desc, i.id desc
             ) as posicao
      from public.insights i
      where i.restaurante_id is not distinct from new.restaurante_id
        and i.publico = new.publico
        and public.aba_do_insight(i.prioridade) = v_aba
        and i.ativo
        and i.deletado_em is null
    ) x
    where x.posicao > 8
  )
  -- Rede dupla: fixar é o dono dizendo "mantenha isto à vista", e isso pesa
  -- mais que o teto. Se ele fixar mais de 8, a aba passa de 8 — escolha dele.
  and not coalesce(alvo.fixado, false);

  return null;
end;
$function$;

-- O painel dos influencers conta só o que veio de cliente.
do $$
declare
  v_def text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'influencers_painel';
  if v_def is null or v_def like '%f.publico = ''cliente''%' then
    return;
  end if;
  v_novo := replace(v_def, 'f.invalidado_em is null', 'f.invalidado_em is null and f.publico = ''cliente''');
  if (length(v_novo) - length(v_def)) <> 2 * length(' and f.publico = ''cliente''') then
    raise exception 'influencers_painel mudou: confira à mão onde filtrar o público.';
  end if;
  execute v_novo;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Sigilo na tela WhatsApp
-- ---------------------------------------------------------------------------
alter table public.mensagens_whatsapp add column if not exists oculta boolean not null default false;
create index if not exists mensagens_whatsapp_ocultas_idx on public.mensagens_whatsapp (restaurante_id, enviada_em) where oculta;

-- A conversa com quem é da equipe nasce escondida (a resposta chega aqui antes
-- de a análise rodar). Fica de fora só o que o dono digita no celular.
create or replace function public.mensagens_whatsapp_sigilo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(new.grupo, false)
     and new.telefone is not null
     and (not new.de_mim or new.por_api)
     and exists (select 1 from public.equipe_funcionarios f
                  where f.restaurante_id = new.restaurante_id
                    and f.ativo
                    and public.telefone_chave(f.telefone) = public.telefone_chave(new.telefone)) then
    new.oculta := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mensagens_whatsapp_sigilo on public.mensagens_whatsapp;
create trigger trg_mensagens_whatsapp_sigilo
  before insert on public.mensagens_whatsapp
  for each row execute function public.mensagens_whatsapp_sigilo();

drop policy if exists sem_mensagens_ocultas on public.mensagens_whatsapp;
create policy sem_mensagens_ocultas on public.mensagens_whatsapp as restrictive for select
  using (not oculta);

-- Mensagem escondida não vira notificação no celular do dono.
create or replace function public.notificar_push_whatsapp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  if new.oculta then
    return null;
  end if;

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
$function$;

-- Volta a mostrar o que não precisa mais de sigilo. Uma mensagem continua
-- escondida enquanto houver, cobrindo a hora dela, uma autoria pendente (ainda
-- no prazo) ou anônima. Fora isso, aparece quando a pessoa deixou mostrar ou
-- quando já passou o prazo (pedido sem resposta, conversa que não era feedback).
create or replace function public.equipe_revelar_mensagens(p_restaurante_id bigint default null, p_telefone text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.mensagens_whatsapp m
     set oculta = false
   where m.oculta
     and (p_restaurante_id is null or m.restaurante_id = p_restaurante_id)
     and (p_telefone is null or public.telefone_chave(m.telefone) = public.telefone_chave(p_telefone))
     and not exists (
       select 1
         from public.equipe_autorias a
         join public.equipe_funcionarios f on f.id = a.funcionario_id
        where a.restaurante_id = m.restaurante_id
          and public.telefone_chave(f.telefone) = public.telefone_chave(m.telefone)
          and m.enviada_em >= a.janela_inicio
          and ((a.identidade = 'pendente' and (a.identidade_ate is null or a.identidade_ate > now()))
            or (a.identidade = 'anonimo' and m.enviada_em <= coalesce(a.decidido_em, a.criado_em) + interval '30 minutes')))
     and (m.enviada_em < now() - public.equipe_prazo_identidade() - interval '1 hour'
       or exists (
         select 1
           from public.equipe_autorias a
           join public.equipe_funcionarios f on f.id = a.funcionario_id
          where a.restaurante_id = m.restaurante_id
            and public.telefone_chave(f.telefone) = public.telefone_chave(m.telefone)
            and a.identidade = 'identificado'
            and m.enviada_em >= a.janela_inicio
            and m.enviada_em <= coalesce(a.decidido_em, a.criado_em) + interval '30 minutes'));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Prazo vencido sem resposta: mostra quem foi. Relato grave fica anônimo, e
-- leva junto o que a mesma pessoa falou na mesma leva (senão o nome no
-- comentário leve entregaria quem fez o relato grave do mesmo dia).
create or replace function public.equipe_vencer_identidades()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.equipe_autorias a
     set identidade = case
           when a.sensivel or exists (
                  select 1 from public.equipe_autorias b
                   where b.funcionario_id = a.funcionario_id
                     and b.sensivel
                     and b.identidade in ('pendente', 'anonimo')
                     and b.criado_em between a.criado_em - interval '48 hours' and a.criado_em + interval '48 hours')
             then 'anonimo'
           else 'identificado'
         end,
         decidido_por = 'prazo',
         decidido_em = now()
   where a.identidade = 'pendente'
     and a.identidade_ate is not null
     and a.identidade_ate <= now();
  get diagnostics n = row_count;
  perform public.equipe_revelar_mensagens();
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. O que o n8n ("Feedback Restaurante") chama
-- ---------------------------------------------------------------------------

-- Quem escreveu é da equipe deste restaurante?
create or replace function public.equipe_quem_e(p_restaurante_id bigint, p_telefone text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'ok', true,
      'funcionario_id', f.id,
      'nome', f.nome,
      -- Já recebeu a pergunta do anonimato há pouco: "anônimo" escrito por
      -- extenso também vale como resposta.
      'pode_escolher', exists (
        select 1 from public.equipe_autorias a
         where a.funcionario_id = f.id
           and a.perguntado_em > now() - interval '7 days'),
      -- A pergunta está no ar agora (feita e ainda no prazo): só aqui um
      -- "sim" ou "não" solto vale como resposta a ela.
      'aguardando_escolha', exists (
        select 1 from public.equipe_autorias a
         where a.funcionario_id = f.id
           and a.identidade = 'pendente'
           and a.perguntado_em is not null
           and (a.identidade_ate is null or a.identidade_ate > now())))
      from public.equipe_funcionarios f
     where f.restaurante_id = p_restaurante_id
       and f.ativo
       and public.telefone_chave(f.telefone) = public.telefone_chave(p_telefone)
     limit 1
  ), jsonb_build_object('ok', true, 'funcionario_id', null))
$$;

-- Grava o feedback de um funcionário: a mensagem inteira, os pontos e a autoria.
-- Os gatilhos de sempre classificam o tema e ligam aos insights.
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
  v_ant        public.equipe_autorias%rowtype;
  v_original   uuid;
  v_autoria    uuid;
  v_identidade text := 'pendente';
  v_por        text;
  v_decidido   timestamptz;
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

  -- A que pedido esta resposta pertence: o último que saiu para a pessoa.
  select * into v_conv
    from public.equipe_convites c
   where c.funcionario_id = v_func.id
     and c.status = 'enviado'
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

  -- A mesma leva (o mesmo pedido, ou as últimas 24 h) vale uma pergunta só.
  select * into v_ant
    from public.equipe_autorias a
   where a.funcionario_id = v_func.id
     and ((v_conv.envio_id is not null and a.envio_id = v_conv.envio_id) or a.criado_em > now() - interval '24 hours')
   order by a.criado_em desc
   limit 1;

  if v_ant.id is not null then
    if v_ant.identidade = 'pendente' and (v_ant.identidade_ate is null or v_ant.identidade_ate > now()) then
      v_perguntado := v_ant.perguntado_em;
      v_ate := v_ant.identidade_ate;
      v_janela := v_ant.janela_inicio;
      v_perguntar := v_ant.perguntado_em is null;
    elsif v_ant.decidido_por = 'pessoa' then
      v_identidade := v_ant.identidade;
      v_por := 'pessoa';
      v_decidido := now();
      v_janela := v_ant.janela_inicio;
      v_perguntar := false;
    end if;
  end if;

  v_janela := coalesce(
    v_janela,
    case when v_conv.enviado_em > now() - interval '7 days' then v_conv.enviado_em - interval '1 minute' end,
    now() - interval '30 minutes');

  insert into public.equipe_autorias
    (restaurante_id, feedback_original_id, funcionario_id, envio_id, identidade, decidido_por, decidido_em,
     perguntado_em, identidade_ate, janela_inicio, sensivel)
  values
    (p_restaurante_id, v_original, v_func.id, v_conv.envio_id, v_identidade, v_por, v_decidido,
     v_perguntado, v_ate, v_janela, coalesce(p_sensivel, false))
  returning id into v_autoria;

  if v_conv.id is not null and v_conv.respondeu_em is null then
    update public.equipe_convites set respondeu_em = now() where id = v_conv.id;
  end if;

  if v_identidade = 'identificado' then
    perform public.equipe_revelar_mensagens(p_restaurante_id, v_func.telefone);
  else
    update public.mensagens_whatsapp m
       set oculta = true
     where m.restaurante_id = p_restaurante_id
       and not m.oculta
       and not coalesce(m.grupo, false)
       and (not m.de_mim or m.por_api)
       and public.telefone_chave(m.telefone) = public.telefone_chave(v_func.telefone)
       and m.enviada_em >= v_janela;
  end if;

  return jsonb_build_object(
    'ok', true,
    'original_id', v_original,
    'autoria_id', v_autoria,
    'identidade', v_identidade,
    'perguntar_identidade', v_perguntar,
    'sensivel', coalesce(p_sensivel, false),
    'prazo_horas', (extract(epoch from public.equipe_prazo_identidade()) / 3600)::int);
end;
$$;

-- A pergunta do anonimato chegou no WhatsApp da pessoa: o prazo começa agora.
create or replace function public.equipe_identidade_perguntada(p_restaurante_id bigint, p_telefone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ate timestamptz := now() + public.equipe_prazo_identidade();
  n integer;
begin
  update public.equipe_autorias a
     set perguntado_em = now(),
         identidade_ate = v_ate
    from public.equipe_funcionarios f
   where f.id = a.funcionario_id
     and f.restaurante_id = p_restaurante_id
     and public.telefone_chave(f.telefone) = public.telefone_chave(p_telefone)
     and a.identidade = 'pendente'
     and a.perguntado_em is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'marcadas', n, 'ate', v_ate);
end;
$$;

-- A pessoa escolheu: 'anonimo' ou 'identificado'. Vale para o que está
-- pendente; sem nada pendente, vale para a última leva (mudou de ideia).
create or replace function public.equipe_escolher_identidade(p_restaurante_id bigint, p_telefone text, p_escolha text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_func   public.equipe_funcionarios%rowtype;
  v_ult    public.equipe_autorias%rowtype;
  v_inicio timestamptz;
  n integer := 0;
begin
  if p_escolha not in ('anonimo', 'identificado') then
    return jsonb_build_object('ok', false, 'motivo', 'escolha_invalida');
  end if;

  select * into v_func
    from public.equipe_funcionarios f
   where f.restaurante_id = p_restaurante_id
     and public.telefone_chave(f.telefone) = public.telefone_chave(p_telefone)
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_da_equipe');
  end if;

  with mudou as (
    update public.equipe_autorias a
       set identidade = p_escolha, decidido_por = 'pessoa', decidido_em = now()
     where a.funcionario_id = v_func.id
       and a.identidade = 'pendente'
    returning a.janela_inicio
  )
  select count(*), min(janela_inicio) into n, v_inicio from mudou;

  if n = 0 then
    select * into v_ult
      from public.equipe_autorias a
     where a.funcionario_id = v_func.id
       and a.criado_em > now() - interval '30 days'
     order by a.criado_em desc
     limit 1;
    if v_ult.id is not null then
      with mudou as (
        update public.equipe_autorias a
           set identidade = p_escolha, decidido_por = 'pessoa', decidido_em = now()
         where a.funcionario_id = v_func.id
           and a.identidade <> p_escolha
           and (a.id = v_ult.id or (v_ult.envio_id is not null and a.envio_id = v_ult.envio_id))
        returning a.janela_inicio
      )
      select count(*), min(janela_inicio) into n, v_inicio from mudou;
    end if;
  end if;

  if p_escolha = 'identificado' then
    perform public.equipe_revelar_mensagens(p_restaurante_id, v_func.telefone);
  elsif v_inicio is not null then
    update public.mensagens_whatsapp m
       set oculta = true
     where m.restaurante_id = p_restaurante_id
       and not m.oculta
       and not coalesce(m.grupo, false)
       and (not m.de_mim or m.por_api)
       and public.telefone_chave(m.telefone) = public.telefone_chave(v_func.telefone)
       and m.enviada_em >= v_inicio;
  end if;

  return jsonb_build_object('ok', true, 'escolha', p_escolha, 'mudou', n);
end;
$$;

-- PARAR da equipe: mesmo formato de contato_contexto_parar / contato_parar_atualizacoes,
-- para o n8n usar os mesmos nós. Aqui "parar" = não receber mais pedidos de feedback.
create or replace function public.equipe_contexto_parar(p_restaurante_id bigint, p_telefone text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select * from public.equipe_funcionarios
     where restaurante_id = p_restaurante_id
       and public.telefone_chave(telefone) = public.telefone_chave(p_telefone)
     limit 1
  ),
  ultimo as (
    select c.texto, c.enviado_em
      from public.equipe_convites c
      join f on f.id = c.funcionario_id
     where c.status = 'enviado'
     order by c.enviado_em desc
     limit 1
  )
  select jsonb_build_object(
    'contato_id', (select id from f),
    'ja_parou', coalesce((select opt_out_em is not null from f), false),
    -- O pedido de feedback sempre termina avisando do PARAR.
    'aviso_parar_em', (select enviado_em from ultimo),
    'ultima_atualizacao', (select jsonb_build_object('texto', texto, 'enviada_em', enviado_em) from ultimo),
    'conversa', coalesce((
      select jsonb_agg(jsonb_build_object('quem', x.quem, 'texto', x.texto, 'enviada_em', x.enviada_em) order by x.enviada_em)
        from (select case when w.de_mim then 'restaurante' else 'cliente' end as quem,
                     left(coalesce(nullif(btrim(w.texto), ''), nullif(btrim(w.transcricao), ''), '[' || coalesce(w.tipo, 'mensagem') || ']'), 500) as texto,
                     w.enviada_em
                from public.mensagens_whatsapp w
               where w.restaurante_id = p_restaurante_id
                 and coalesce(w.grupo, false) = false
                 and coalesce(w.tipo, '') <> 'reaction'
                 and public.telefone_chave(w.telefone) = public.telefone_chave(p_telefone)
               order by w.enviada_em desc
               limit 12) x), '[]'::jsonb)
  )
$$;

create or replace function public.equipe_parar(p_restaurante_id bigint, p_telefone text, p_motivo text default null)
returns table(marcou boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.equipe_funcionarios
     set opt_out_em = now(),
         opt_out_motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 300)
   where restaurante_id = p_restaurante_id
     and public.telefone_chave(telefone) = public.telefone_chave(p_telefone)
     and opt_out_em is null;
  get diagnostics n = row_count;
  return query select n > 0;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'equipe_revelar_mensagens(bigint, text)',
    'equipe_vencer_identidades()',
    'equipe_quem_e(bigint, text)',
    'equipe_registrar_feedback(bigint, text, text, text, jsonb, boolean)',
    'equipe_identidade_perguntada(bigint, text)',
    'equipe_escolher_identidade(bigint, text, text)',
    'equipe_contexto_parar(bigint, text)',
    'equipe_parar(bigint, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Rotinas
-- ---------------------------------------------------------------------------
-- A fila dos pedidos de feedback (a função `equipe` manda um por minuto).
select cron.unschedule('equipe-tick')
 where exists (select 1 from cron.job where jobname = 'equipe-tick');

select cron.schedule(
  'equipe-tick',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://lixrcruilisncfhfhndo.supabase.co/functions/v1/equipe',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeHJjcnVpbGlzbmNmaGZobmRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MzkyNTcsImV4cCI6MjA3ODUxNTI1N30.dm3PN80PogMaEHK5ZxHhEyacMbb3PMUoHCUwaDbePmM',
        'x-cron-secret', (select valor from public.integracao_config where chave = 'PUSH_TRIGGER_SECRET')
      ),
      body := '{"acao": "tick"}'::jsonb,
      timeout_milliseconds := 30000
    )
     where exists (select 1 from public.equipe_convites where status in ('na_fila', 'enviando'));
  $cron$
);

-- O prazo do anonimato e a volta das mensagens à tela WhatsApp.
select cron.unschedule('equipe-identidades')
 where exists (select 1 from cron.job where jobname = 'equipe-identidades');

select cron.schedule(
  'equipe-identidades',
  '*/2 * * * *',
  $cron$
    select public.equipe_vencer_identidades()
     where exists (select 1 from public.equipe_autorias where identidade = 'pendente' and identidade_ate <= now())
        or exists (select 1 from public.mensagens_whatsapp where oculta);
  $cron$
);
