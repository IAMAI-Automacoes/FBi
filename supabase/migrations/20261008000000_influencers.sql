-- EasyFeed Influencers: parceiros (influenciadores que dão dicas para donos de
-- restaurante) veem, numa área escondida (/influencers), o que os clientes de
-- restaurante estão comentando, para usar de base nos vídeos.
--
-- SÓ DADOS ANÔNIMOS E AGRUPADOS: categorias, temas, números e os resumos curtos
-- dos pontos ("Pizza fria"). Nunca nome ou id de restaurante, telefone, nome de
-- cliente, a mensagem original nem dados do Google. Tudo sai de uma função só
-- (`influencers_painel`), que já devolve o agrupado: o influenciador não lê
-- nenhuma tabela de feedback.
--
-- LOGIN SEPARADO: a área tem sessão própria no navegador (outro cliente do
-- Supabase, ver src/lib/supabase/cliente-influencers.ts). Entrar ou sair de um
-- lado não mexe no outro.

-- ---------------------------------------------------------------------------
-- Quem tem acesso (o admin cadastra; o valor é o que o influenciador paga)
-- ---------------------------------------------------------------------------
create table if not exists public.influenciadores (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique check (email = lower(btrim(email)) and position('@' in email) > 1),
  -- Quanto paga por mês ao EasyFeed. Só registro (sem cobrança automática); vazio = não definido.
  valor_mensal      numeric(10,2) check (valor_mensal is null or valor_mensal >= 0),
  -- Preenchidos no onboarding, pelo próprio influenciador.
  nome              text,
  arroba            text,
  cidade            text,
  auth_user_id      uuid,
  onboarding_em     timestamptz,
  ultimo_acesso_em  timestamptz,
  criado_em         timestamptz not null default now(),
  criado_por        text default lower(auth.email())
);

alter table public.influenciadores enable row level security;

drop policy if exists influenciadores_admin on public.influenciadores;
create policy influenciadores_admin on public.influenciadores
  for all
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));

drop policy if exists influenciadores_proprio_le on public.influenciadores;
create policy influenciadores_proprio_le on public.influenciadores
  for select
  using (email = lower(auth.email()));

-- A lista do admin atualiza sozinha quando alguém termina o onboarding.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'influenciadores'
  ) then
    alter publication supabase_realtime add table public.influenciadores;
  end if;
end $$;

-- Trava das consultas da tela de entrada (quantas por IP por hora). Só a função lê.
create table if not exists public.influencer_consultas (
  id        bigserial primary key,
  ip_hash   text not null,
  criado_em timestamptz not null default now()
);
create index if not exists influencer_consultas_ip on public.influencer_consultas (ip_hash, criado_em desc);
alter table public.influencer_consultas enable row level security;

-- ---------------------------------------------------------------------------
-- O influenciador
-- ---------------------------------------------------------------------------
create or replace function public.eh_influencer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.influenciadores i where i.email = lower(auth.email()))
$$;

revoke execute on function public.eh_influencer() from public, anon;
grant execute on function public.eh_influencer() to authenticated;

-- Onboarding: nome, @ e cidade. Não mexe no valor.
create or replace function public.influencer_salvar_perfil(p_nome text, p_arroba text, p_cidade text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nome   text := left(nullif(btrim(coalesce(p_nome, '')), ''), 60);
  v_arroba text := left(nullif(ltrim(btrim(coalesce(p_arroba, '')), '@'), ''), 40);
  v_cidade text := left(nullif(btrim(coalesce(p_cidade, '')), ''), 60);
begin
  if auth.uid() is null or v_nome is null then
    return false;
  end if;
  update public.influenciadores
     set nome = v_nome,
         arroba = v_arroba,
         cidade = v_cidade,
         auth_user_id = auth.uid(),
         onboarding_em = coalesce(onboarding_em, now())
   where email = lower(auth.email());
  return found;
end;
$$;

revoke execute on function public.influencer_salvar_perfil(text, text, text) from public, anon;
grant execute on function public.influencer_salvar_perfil(text, text, text) to authenticated;

create or replace function public.influencer_marcar_acesso()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.influenciadores
     set ultimo_acesso_em = now(),
         auth_user_id = coalesce(auth_user_id, auth.uid())
   where email = lower(auth.email())
$$;

revoke execute on function public.influencer_marcar_acesso() from public, anon;
grant execute on function public.influencer_marcar_acesso() to authenticated;

-- Para a função acesso-influencer: já existe usuário com este e-mail? Ele tem senha?
create or replace function public.influencer_conta(p_email text)
returns table (user_id uuid, tem_senha boolean)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, coalesce(u.encrypted_password, '') <> ''
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
   limit 1
$$;

revoke execute on function public.influencer_conta(text) from public, anon, authenticated;
grant execute on function public.influencer_conta(text) to service_role;

-- ---------------------------------------------------------------------------
-- Contas de teste (dos admins e as de demonstração dos vendedores) nos dados
-- ---------------------------------------------------------------------------
create or replace function public.influencers_incluem_testes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select c.valor from public.integracao_config c where c.chave = 'INFLUENCERS_INCLUIR_TESTES'), 'sim') <> 'nao'
$$;

grant execute on function public.influencers_incluem_testes() to authenticated;

create or replace function public.influencers_definir_incluir_testes(p_incluir boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())) then
    raise exception 'Só o admin da plataforma' using errcode = '42501';
  end if;
  insert into public.integracao_config (chave, valor, updated_at)
  values ('INFLUENCERS_INCLUIR_TESTES', case when p_incluir then 'sim' else 'nao' end, now())
  on conflict (chave) do update set valor = excluded.valor, updated_at = now();
  return p_incluir;
end;
$$;

revoke execute on function public.influencers_definir_incluir_testes(boolean) from public, anon;
grant execute on function public.influencers_definir_incluir_testes(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- O painel
-- ---------------------------------------------------------------------------
-- O sentimento vem com grafias misturadas (Negativo/negativo/Sugestão…).
create or replace function public.influencers_tipo(p_sentimento text)
returns text
language sql
immutable
as $$
  select case
           when p_sentimento ilike 'negativ%' then 'reclamacao'
           when p_sentimento ilike 'positiv%' then 'elogio'
           when p_sentimento ilike 'sugest%'  then 'sugestao'
           else 'neutro'
         end
$$;

-- Restaurantes que entram nos dados.
create or replace function public.influencers_restaurantes_base(p_testes boolean)
returns table (id bigint, tipo_culinaria text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, nullif(btrim(r.tipo_culinaria), '')
    from public.restaurantes r
   where r.excluida_em is null
     and (p_testes or not exists (
           select 1 from auth.users u
            where u.id = r.auth_user_id
              and (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(u.email))
                or exists (select 1 from public.vendedores v where v.email = lower(u.email)))))
$$;

revoke execute on function public.influencers_restaurantes_base(boolean) from public, anon, authenticated;

create or replace function public.influencers_painel(p_dias integer default 30, p_culinaria text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_dias       int := greatest(1, least(coalesce(p_dias, 30), 365));
  v_agora      timestamptz := now();
  v_ini        timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365)));
  v_ini_ant    timestamptz := now() - make_interval(days => 2 * greatest(1, least(coalesce(p_dias, 30), 365)));
  v_testes     boolean := public.influencers_incluem_testes();
  v_intervalo  text := case when coalesce(p_dias, 30) <= 31 then 'day' else 'week' end;
  v_culinarias jsonb;
  v_culinaria  text;
  v_res        jsonb;
begin
  if not (public.eh_influencer() or public.eh_admin_plataforma_ou_console()) then
    raise exception 'Sem acesso ao EasyFeed Influencers' using errcode = '42501';
  end if;

  -- Culinária só aparece (e só filtra) com 3 restaurantes ou mais: com menos,
  -- o filtro apontaria um restaurante.
  select coalesce(jsonb_agg(c.nome order by c.nome), '[]'::jsonb) into v_culinarias
    from (select r.tipo_culinaria as nome
            from public.influencers_restaurantes_base(v_testes) r
           where r.tipo_culinaria is not null
             and exists (select 1 from public.feedbacks_restaurante f
                          where f.restaurante_id = r.id and f.invalidado_em is null and f.created_at >= v_ini_ant)
           group by 1
          having count(*) >= 3) c;
  v_culinaria := case when p_culinaria is not null and v_culinarias ? p_culinaria then p_culinaria end;

  with pts as (
    select f.created_at,
           coalesce(nullif(btrim(f.categoria), ''), 'Outros') as categoria,
           f.resumo,
           f.tema_id,
           f.restaurante_id,
           public.influencers_tipo(f.sentimento) as tipo
      from public.feedbacks_restaurante f
      join public.influencers_restaurantes_base(v_testes) r on r.id = f.restaurante_id
     where f.invalidado_em is null
       and f.created_at >= v_ini_ant
       and (v_culinaria is null or r.tipo_culinaria = v_culinaria)
  ),
  atual as (select * from pts where created_at >= v_ini),
  temas_agr as (
    select p.tipo,
           lower(btrim(t.rotulo)) as chave,
           mode() within group (order by btrim(t.rotulo)) as rotulo,
           count(*) filter (where p.created_at >= v_ini) as mencoes,
           count(*) filter (where p.created_at < v_ini) as mencoes_anterior,
           count(distinct p.restaurante_id) filter (where p.created_at >= v_ini) as restaurantes
      from pts p
      join public.feedback_temas t on t.id = p.tema_id
     where nullif(btrim(t.rotulo), '') is not null
     group by p.tipo, lower(btrim(t.rotulo))
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('dias', v_dias),
    'culinaria', v_culinaria,
    'culinarias', v_culinarias,
    'totais', (
      select jsonb_build_object(
        'pontos', count(*),
        'reclamacoes', count(*) filter (where tipo = 'reclamacao'),
        'elogios', count(*) filter (where tipo = 'elogio'),
        'sugestoes', count(*) filter (where tipo = 'sugestao'),
        'neutros', count(*) filter (where tipo = 'neutro'),
        'pontos_anterior', (select count(*) from pts where created_at < v_ini))
        from atual),
    'categorias', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'nome', c.categoria, 'reclamacoes', c.rec, 'elogios', c.elo, 'sugestoes', c.sug,
               'neutros', c.neu, 'total', c.total, 'total_anterior', c.total_ant)
             order by c.total desc, c.categoria), '[]'::jsonb)
        from (select categoria,
                     count(*) filter (where created_at >= v_ini and tipo = 'reclamacao') as rec,
                     count(*) filter (where created_at >= v_ini and tipo = 'elogio') as elo,
                     count(*) filter (where created_at >= v_ini and tipo = 'sugestao') as sug,
                     count(*) filter (where created_at >= v_ini and tipo = 'neutro') as neu,
                     count(*) filter (where created_at >= v_ini) as total,
                     count(*) filter (where created_at < v_ini) as total_ant
                from pts
               group by categoria) c
       where c.total > 0),
    -- "comum" = citado em mais de um restaurante; o número de restaurantes não sai daqui.
    'temas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tipo', x.tipo, 'rotulo', x.rotulo, 'mencoes', x.mencoes,
               'mencoes_anterior', x.mencoes_anterior, 'comum', x.restaurantes >= 2)
             order by x.tipo, x.mencoes desc, x.rotulo), '[]'::jsonb)
        from (select a.*, row_number() over (partition by a.tipo order by a.mencoes desc, a.rotulo) as n
                from temas_agr a
               where a.mencoes > 0) x
       where x.n <= 8),
    'em_alta', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tipo', x.tipo, 'rotulo', x.rotulo, 'mencoes', x.mencoes,
               'mencoes_anterior', x.mencoes_anterior, 'comum', x.restaurantes >= 2)
             order by x.mencoes - x.mencoes_anterior desc, x.mencoes desc), '[]'::jsonb)
        from (select * from temas_agr a
               where a.mencoes >= 2 and a.mencoes > a.mencoes_anterior
               order by a.mencoes - a.mencoes_anterior desc, a.mencoes desc
               limit 6) x),
    -- Resumos curtos, sem nada que identifique: fora telefone, link, e-mail ou @.
    'frases', (
      select coalesce(jsonb_agg(jsonb_build_object('tipo', x.tipo, 'texto', x.texto, 'categoria', x.categoria)
             order by x.tipo, x.n), '[]'::jsonb)
        from (select d.*, row_number() over (partition by d.tipo order by d.ultimo desc) as n
                from (select tipo,
                             min(categoria) as categoria,
                             min(btrim(resumo)) as texto,
                             max(created_at) as ultimo
                        from atual
                       where length(btrim(coalesce(resumo, ''))) between 3 and 160
                         and resumo !~ '\d{6,}'
                         and resumo !~* '(https?://|www\.|@)'
                       group by tipo, lower(btrim(resumo))) d) x
       where x.n <= 12),
    'evolucao', jsonb_build_object(
      'intervalo', case v_intervalo when 'day' then 'dia' else 'semana' end,
      'pontos', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'inicio', to_char(s.inicio, 'YYYY-MM-DD'),
                 'reclamacoes', c.rec, 'elogios', c.elo, 'sugestoes', c.sug)
               order by s.inicio), '[]'::jsonb)
          from generate_series(
                 date_trunc(v_intervalo, v_ini at time zone 'America/Sao_Paulo'),
                 date_trunc(v_intervalo, v_agora at time zone 'America/Sao_Paulo'),
                 case v_intervalo when 'day' then interval '1 day' else interval '1 week' end) as s(inicio)
          left join lateral (
                 select count(*) filter (where a.tipo = 'reclamacao') as rec,
                        count(*) filter (where a.tipo = 'elogio') as elo,
                        count(*) filter (where a.tipo = 'sugestao') as sug
                   from atual a
                  where date_trunc(v_intervalo, a.created_at at time zone 'America/Sao_Paulo') = s.inicio) c on true))
  ) into v_res;

  return v_res;
end;
$$;

revoke execute on function public.influencers_painel(integer, text) from public, anon;
grant execute on function public.influencers_painel(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A limpeza de contas abandonadas nunca apaga um influenciador
-- ---------------------------------------------------------------------------
create or replace function public.limpar_contas_abandonadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  alvos uuid[];
begin
  select array_agg(r.auth_user_id) into alvos
  from public.restaurantes r
  where r.assinatura_status = 'sem_assinatura'
    and coalesce(r.onboarding_completo, false) = false
    and r.whatsapp_token is null
    and r.created_at < now() - interval '7 days'
    and not exists (select 1 from public.feedbacks_restaurante f where f.restaurante_id = r.id)
    and not exists (
      select 1 from public.platform_admins pa
      join auth.users u on u.id = r.auth_user_id
      where lower(pa.email) = lower(u.email)
    )
    -- Pagou (ou está pagando: boleto/Pix pendente, webhook atrasado): a conta
    -- é o único lugar de onde a pessoa cancela. Apagar deixaria o Stripe
    -- cobrando uma assinatura sem dono.
    and not exists (
      select 1 from public.stripe_assinaturas s
       where s.restaurante_id = r.id
         and s.status not in ('canceled', 'incomplete_expired')
    )
    and not exists (
      select 1 from public.stripe_checkout_sessions cs
       where (cs.restaurante_id_origem = r.id or cs.restaurante_id_vinculado = r.id)
         and cs.status in ('paga', 'vinculada')
    )
    -- Influenciador: a conta dele é do EasyFeed Influencers, não um restaurante abandonado.
    and not exists (
      select 1 from public.influenciadores i
      join auth.users u on u.id = r.auth_user_id
      where i.email = lower(u.email)
    );

  if alvos is null or array_length(alvos, 1) is null then
    return 0;
  end if;

  delete from public.usuarios where id = any(alvos);   -- usuarios não tem FK cascade
  delete from auth.users where id = any(alvos);        -- cascata: restaurantes + push_subscriptions

  return array_length(alvos, 1);
end;
$$;
