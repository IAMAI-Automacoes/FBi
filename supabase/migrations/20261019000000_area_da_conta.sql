-- EasyFeed em versões por área de atuação: Restaurante e RH.
--
-- Decisão do Raver (13/10/2026): logo depois de criar e-mail e senha a pessoa
-- escolhe a versão do software. "Restaurante" é o produto de sempre. "RH" é um
-- produto novo, para empresas que não são restaurante, feito com o agente de
-- feedback dos funcionários (as páginas /equipe). As duas versões dividem o
-- mesmo código e o mesmo banco: o que muda é a coluna `restaurantes.area`.
--
--   - a versão é fixa: o dono define uma vez, na escolha; depois, só o admin;
--   - por enquanto o RH é só por convite (link do admin). O cadastro comum
--     continua virando Restaurante;
--   - o restaurante não muda: a Equipe dentro da conta de restaurante continua
--     só para o admin da plataforma;
--   - na conta RH o WhatsApp só conversa com funcionário cadastrado. Número de
--     fora é ignorado em silêncio e não aparece na tela WhatsApp.
--
-- Pode rodar mais de uma vez.

-- ─────────────────────────────────────────────────────────────
-- 1. A área da conta
-- ─────────────────────────────────────────────────────────────
-- Vazio = ainda não escolheu. As contas que já existiam viram 'restaurante'
-- pelo valor padrão da criação da coluna (sem UPDATE, para não acordar os
-- gatilhos da tabela); logo depois o padrão sai, e conta nova nasce vazia.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'restaurantes' and column_name = 'area') then
    alter table public.restaurantes add column area text default 'restaurante';
    alter table public.restaurantes alter column area drop default;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurantes_area_check') then
    alter table public.restaurantes
      add constraint restaurantes_area_check check (area is null or area in ('restaurante', 'rh'));
  end if;
end $$;

comment on column public.restaurantes.area is
  'A versão do EasyFeed desta conta: restaurante (feedback dos clientes) ou rh (feedback dos funcionários, para qualquer empresa). Vazio = ainda não escolheu. Só a função escolher_area e o admin escrevem.';

-- ─────────────────────────────────────────────────────────────
-- 2. A trava dos campos que o dono não escolhe
-- ─────────────────────────────────────────────────────────────
-- Já existia para ALTERAÇÕES (plano, exclusão, crédito de IA). Faltava a
-- CRIAÇÃO: a política de insert só confere que a linha é da própria pessoa,
-- então quem criasse a própria conta direto pela API podia nascer com
-- assinatura_status = 'ativa' ou com o crédito de IA que quisesse. Agora, na
-- criação feita pela própria pessoa, esses campos nascem sempre com o padrão.
--
-- A área entra na mesma trava: o dono só define pela função escolher_area
-- (que marca a transação); fora disso, só o servidor e o admin.
create or replace function public.proteger_colunas_assinatura()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  claims text := current_setting('request.jwt.claims', true);
  papel  text := nullif(claims, '')::jsonb ->> 'role';
  padrao text;
begin
  if claims is null or claims = '' then
    return new;
  end if;
  if papel = 'service_role' then
    return new;
  end if;
  if exists (select 1 from public.platform_admins where email = auth.email()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.assinatura_status       := 'sem_assinatura';
    new.stripe_customer_id      := null;
    new.stripe_subscription_id  := null;
    new.plano_ciclo             := null;
    new.assinatura_expira_em    := null;
    new.assinatura_cancelada_em := null;
    new.excluida_em             := null;
    new.area                    := null;
    -- O crédito de IA volta para o padrão da coluna, seja ele qual for.
    select pg_get_expr(d.adbin, d.adrelid) into padrao
      from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'public.restaurantes'::regclass and a.attname = 'credito_ia_limite_usd';
    if padrao is null then new.credito_ia_limite_usd := null;
    else execute 'select (' || padrao || ')::numeric' into new.credito_ia_limite_usd; end if;
    new.credito_ia_ciclo_inicio := now();
    return new;
  end if;

  if new.assinatura_status       is distinct from old.assinatura_status
     or new.stripe_customer_id      is distinct from old.stripe_customer_id
     or new.stripe_subscription_id  is distinct from old.stripe_subscription_id
     or new.plano_ciclo             is distinct from old.plano_ciclo
     or new.assinatura_expira_em    is distinct from old.assinatura_expira_em
     or new.assinatura_cancelada_em is distinct from old.assinatura_cancelada_em
     or new.excluida_em             is distinct from old.excluida_em
     or new.credito_ia_limite_usd   is distinct from old.credito_ia_limite_usd
     or new.credito_ia_ciclo_inicio is distinct from old.credito_ia_ciclo_inicio
  then
    raise exception 'Campos de assinatura só podem ser alterados pelo servidor ou por um admin da plataforma';
  end if;

  if new.area is distinct from old.area
     and coalesce(current_setting('easyfeed.escolhendo_area', true), '') <> '1' then
    raise exception 'A versão da conta é definida na escolha inicial; depois, só um admin da plataforma troca';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_proteger_colunas_assinatura on public.restaurantes;
create trigger trg_proteger_colunas_assinatura
  before insert or update on public.restaurantes
  for each row execute function public.proteger_colunas_assinatura();

-- ─────────────────────────────────────────────────────────────
-- 3. Quem pode escolher RH
-- ─────────────────────────────────────────────────────────────
-- Uma linha só. 'convite': só quem chega pelo link do admin vê a opção RH.
-- 'aberto': toda conta nova escolhe. Ninguém lê direto: só as funções abaixo.
create table if not exists public.area_config (
  id             boolean primary key default true check (id),
  rh_modo        text not null default 'convite' check (rh_modo in ('convite', 'aberto')),
  rh_convite     text not null default replace(gen_random_uuid()::text, '-', ''),
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);
insert into public.area_config (id) values (true) on conflict do nothing;
alter table public.area_config enable row level security;
revoke all on public.area_config from anon, authenticated;

create or replace function public.area_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email()))
$$;

-- A conta logada pode escolher RH? Modo aberto, convite certo, ou é o admin.
create or replace function public.area_rh_permitida(p_convite text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.area_eh_admin()
      or exists (select 1 from public.area_config c
                  where c.id and (c.rh_modo = 'aberto' or (btrim(coalesce(p_convite, '')) <> '' and c.rh_convite = btrim(p_convite))))
$$;

-- O que a tela de escolha mostra: a versão que a conta já tem (se tiver) e as
-- que este cadastro pode escolher.
create or replace function public.area_opcoes(p_convite text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'atual',  (select r.area from public.restaurantes r where r.auth_user_id = auth.uid()),
    'opcoes', case when public.area_rh_permitida(p_convite)
                   then jsonb_build_array('restaurante', 'rh') else jsonb_build_array('restaurante') end)
$$;

-- A conta escolhe a versão. Vale uma vez só.
create or replace function public.escolher_area(p_area text, p_convite text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rid   bigint;
  v_atual text;
begin
  select r.id, r.area into v_rid, v_atual from public.restaurantes r where r.auth_user_id = auth.uid() for update;
  if v_rid is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_conta');
  end if;
  if p_area is null or p_area not in ('restaurante', 'rh') then
    return jsonb_build_object('ok', false, 'motivo', 'area_invalida');
  end if;
  if v_atual is not null then
    -- Pedir de novo a mesma não é erro (duas abas, clique repetido).
    return jsonb_build_object('ok', v_atual = p_area, 'motivo', case when v_atual = p_area then null else 'ja_escolhida' end, 'area', v_atual);
  end if;
  if p_area = 'rh' and not public.area_rh_permitida(p_convite) then
    return jsonb_build_object('ok', false, 'motivo', 'convite_invalido');
  end if;

  perform set_config('easyfeed.escolhendo_area', '1', true);
  update public.restaurantes set area = p_area where id = v_rid and area is null;
  perform set_config('easyfeed.escolhendo_area', '', true);

  return jsonb_build_object('ok', true, 'area', p_area);
end;
$$;

-- Admin: troca a versão de uma conta (erro de escolha, teste).
create or replace function public.admin_definir_area(p_restaurante_id bigint, p_area text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.area_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  if p_area is not null and p_area not in ('restaurante', 'rh') then
    return jsonb_build_object('ok', false, 'motivo', 'area_invalida');
  end if;
  update public.restaurantes set area = p_area where id = p_restaurante_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'conta_nao_encontrada');
  end if;
  return jsonb_build_object('ok', true, 'area', p_area);
end;
$$;

-- Admin: o modo do RH e o código do link de convite.
create or replace function public.admin_area_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.area_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  return (select jsonb_build_object(
            'rh_modo', c.rh_modo, 'rh_convite', c.rh_convite,
            'contas_rh', (select count(*) from public.restaurantes r where r.area = 'rh' and r.excluida_em is null))
            from public.area_config c where c.id);
end;
$$;

-- Admin: muda o modo e, se pedir, troca o código (o link antigo para de valer).
create or replace function public.admin_area_salvar(p_modo text, p_novo_convite boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.area_eh_admin() then
    raise exception 'Só o admin da plataforma.' using errcode = '42501';
  end if;
  if p_modo not in ('convite', 'aberto') then
    return jsonb_build_object('ok', false, 'motivo', 'modo_invalido');
  end if;
  update public.area_config
     set rh_modo = p_modo,
         rh_convite = case when coalesce(p_novo_convite, false) then replace(gen_random_uuid()::text, '-', '') else rh_convite end,
         atualizado_por = lower(auth.email()), atualizado_em = now()
   where id;
  return public.admin_area_config() || jsonb_build_object('ok', true);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. A conta RH enxerga o feedback da equipe
-- ─────────────────────────────────────────────────────────────
-- Era só o admin da plataforma. Agora também o dono de uma conta RH. As
-- políticas de público das tabelas de feedback, a autoria visível e a
-- participação do relatório já perguntam a esta função.
create or replace function public.equipe_liberada()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email()))
      or exists (select 1 from public.restaurantes r
                  where r.auth_user_id = auth.uid() and r.area = 'rh' and r.excluida_em is null)
$$;

-- O dono da conta RH cuida dos próprios funcionários e vê os próprios pedidos.
-- (As políticas do admin continuam como estavam.)
drop policy if exists equipe_funcionarios_dono on public.equipe_funcionarios;
create policy equipe_funcionarios_dono on public.equipe_funcionarios
  for all to authenticated
  using      (restaurante_id = public.get_user_restaurante_id() and public.equipe_liberada())
  with check (restaurante_id = public.get_user_restaurante_id() and public.equipe_liberada());

drop policy if exists equipe_envios_dono_le on public.equipe_envios;
create policy equipe_envios_dono_le on public.equipe_envios
  for select to authenticated
  using (restaurante_id = public.get_user_restaurante_id() and public.equipe_liberada());

-- Os convites NÃO ganham política para o dono: a linha diz qual funcionário
-- respondeu e quando, e isso entregaria de quem é o feedback anônimo. A tela
-- lê por aqui, que devolve só de qual pedido é, a situação e se houve resposta.
create or replace function public.equipe_convites_anonimos()
returns table (envio_id bigint, status text, respondeu boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.envio_id, c.status, c.respondeu_em is not null
    from public.equipe_convites c
   where public.equipe_liberada()
     and c.restaurante_id = public.get_user_restaurante_id()
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. WhatsApp na conta RH
-- ─────────────────────────────────────────────────────────────
-- Tela WhatsApp: a conversa com funcionário já nascia escondida e só aparecia
-- quando a pessoa deixava mostrar o nome. Na conta RH o número de quem NÃO é
-- funcionário também nasce escondido, e esse nunca é revelado (a revelação só
-- acontece por autoria de funcionário).
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
     and (exists (select 1 from public.equipe_funcionarios f
                   where f.restaurante_id = new.restaurante_id
                     and f.ativo
                     and public.telefone_chave(f.telefone) = public.telefone_chave(new.telefone))
          or exists (select 1 from public.restaurantes r
                      where r.id = new.restaurante_id and r.area = 'rh')) then
    new.oculta := true;
  end if;
  return new;
end;
$$;

-- Workflow "Feedback Restaurante", nó "Quem escreveu?": além de dizer se o
-- telefone é de um funcionário, agora diz `ignorar` quando a conta é RH e o
-- número não é de funcionário. Nesse caso o fluxo para: não responde e não
-- registra (na conta RH não existe conversa de cliente).
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
      'ignorar', false,
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
  ), jsonb_build_object(
       'ok', true,
       'funcionario_id', null,
       'ignorar', exists (select 1 from public.restaurantes r where r.id = p_restaurante_id and r.area = 'rh')))
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Quem chama o quê
-- ─────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  -- Só o servidor.
  foreach f in array array['area_rh_permitida(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- A conta logada (cada função confere por dentro quem pode).
  foreach f in array array[
    'area_eh_admin()', 'area_opcoes(text)', 'escolher_area(text, text)', 'admin_definir_area(bigint, text)',
    'admin_area_config()', 'admin_area_salvar(text, boolean)', 'equipe_convites_anonimos()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
