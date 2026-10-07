-- Admin da plataforma entra na conta de um cliente com um clique (painel Admin
-- → Contas → "Entrar"), para ver e mexer em tudo exatamente como o cliente.
--
-- COMO VIRA LOGIN. A edge function `entrar-na-conta` confere que quem pede é
-- admin, gera um link mágico da conta (sem mandar e-mail) e o troca por uma
-- sessão de verdade ali mesmo. O id dessa sessão fica em `acessos_admin`: é por
-- ele que o banco sabe que aquela sessão é o admin dentro da conta (e não o
-- cliente), sem depender de nada que o navegador possa forjar.
--
-- COMO ACABA. "Voltar para minha conta" chama `encerrar_acesso_admin`: fecha o
-- registro e apaga só aquela sessão (os aparelhos do cliente seguem logados).

create table if not exists public.acessos_admin (
  id              uuid primary key default gen_random_uuid(),
  admin_email     text not null,
  admin_user_id   uuid not null,
  alvo_user_id    uuid not null,
  restaurante_id  bigint not null,
  -- Sessão (auth.sessions.id) aberta para o admin; nula até o link virar sessão.
  session_id      uuid unique,
  iniciado_em     timestamptz not null default now(),
  encerrado_em    timestamptz
);

create index if not exists acessos_admin_restaurante on public.acessos_admin (restaurante_id, iniciado_em desc);
create index if not exists acessos_admin_abertos on public.acessos_admin (session_id) where encerrado_em is null;

-- Quem grava é só a função (chave de serviço). O admin pode ler o histórico.
alter table public.acessos_admin enable row level security;
drop policy if exists acessos_admin_admin_le on public.acessos_admin;
create policy acessos_admin_admin_le on public.acessos_admin
  for select
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));

-- ---------------------------------------------------------------------------
-- A sessão atual é o admin dentro da conta? (a tela mostra a barra "Voltar")
-- ---------------------------------------------------------------------------
create or replace function public.acesso_admin_atual()
returns table (admin_email text, restaurante_id bigint, iniciado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.admin_email, a.restaurante_id, a.iniciado_em
    from public.acessos_admin a
   where a.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
     and a.encerrado_em is null
$$;

revoke execute on function public.acesso_admin_atual() from public, anon;
grant execute on function public.acesso_admin_atual() to authenticated;

-- ---------------------------------------------------------------------------
-- "Voltar para minha conta": fecha o registro e apaga só esta sessão
-- ---------------------------------------------------------------------------
create or replace function public.encerrar_acesso_admin()
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sessao uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_sessao is null then
    return false;
  end if;
  update public.acessos_admin
     set encerrado_em = now()
   where session_id = v_sessao
     and encerrado_em is null;
  if not found then
    return false;
  end if;
  -- Apaga a sessão e, em cascata, os tokens de renovação dela.
  delete from auth.sessions where id = v_sessao;
  return true;
end;
$$;

revoke execute on function public.encerrar_acesso_admin() from public, anon;
grant execute on function public.encerrar_acesso_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Demonstração: o acesso do admin também é login por link mágico, mas não é
-- demonstração. Sem isto, numa conta de vendedor a tela contaria 2 h e
-- fecharia, e a limpeza de minuto em minuto apagaria a sessão.
-- ---------------------------------------------------------------------------
create or replace function public.meu_acesso()
returns table (eh_vendedor boolean, em_demonstracao boolean, demo_expira_em timestamptz, demo_duracao_minutos int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_claims   jsonb := auth.jwt();
  v_email    text  := lower(auth.email());
  v_sessao   uuid  := nullif(v_claims ->> 'session_id', '')::uuid;
  v_amr      jsonb := case when jsonb_typeof(v_claims -> 'amr') = 'array' then v_claims -> 'amr' else '[]'::jsonb end;
  v_vendedor boolean;
  v_expira   timestamptz;
  v_duracao  int;
  v_login    bigint;
begin
  if auth.uid() is null then
    return;
  end if;

  v_vendedor := exists (select 1 from public.vendedores v where v.email = v_email);

  -- Admin dentro da conta: nunca é demonstração.
  if exists (select 1 from public.acessos_admin a where a.session_id = v_sessao and a.encerrado_em is null) then
    return query select v_vendedor, false, null::timestamptz, null::int;
    return;
  end if;

  select s.expira_em, s.duracao_minutos into v_expira, v_duracao
    from public.sessoes_demo s
   where s.session_id = v_sessao;
  if found then
    return query select v_vendedor, true, v_expira, v_duracao;
    return;
  end if;

  -- Link mágico de vendedor ainda não registrado (o instante entre trocar o link
  -- e registrar, ou quem pulou o registro): é demonstração do mesmo jeito,
  -- contada do login, pelo teto de 2 h.
  if v_vendedor then
    select min((a ->> 'timestamp')::bigint) into v_login
      from jsonb_array_elements(v_amr) a
     where a ->> 'method' in ('magiclink', 'otp');
    if v_login is not null then
      return query select true, true, to_timestamp(v_login) + interval '120 minutes', 120;
      return;
    end if;
  end if;

  return query select v_vendedor, false, null::timestamptz, null::int;
end;
$$;

create or replace function public.encerrar_sessoes_demo()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n integer := 0;
  m integer := 0;
begin
  with vencidas as (
    update public.sessoes_demo s
       set encerrada_em = now()
     where s.encerrada_em is null
       and s.session_id is not null
       and s.expira_em <= now()
    returning s.session_id
  ), apagadas as (
    delete from auth.sessions a using vencidas v where a.id = v.session_id returning 1
  )
  select count(*) into n from apagadas;

  -- Link mágico de vendedor que nunca foi registrado: vale no máximo 2 h.
  -- (O acesso do admin à conta não entra aqui.)
  delete from auth.sessions a
   where a.created_at < now() - interval '120 minutes'
     and exists (select 1 from auth.mfa_amr_claims c
                  where c.session_id = a.id and c.authentication_method in ('magiclink', 'otp'))
     and exists (select 1 from auth.users u join public.vendedores v on v.email = lower(u.email)
                  where u.id = a.user_id)
     and not exists (select 1 from public.sessoes_demo s where s.session_id = a.id)
     and not exists (select 1 from public.acessos_admin x where x.session_id = a.id);
  get diagnostics m = row_count;

  -- Encerrada por logout (botão da tela) ou por qualquer outro caminho: a sessão
  -- sumiu, o registro fecha junto.
  update public.sessoes_demo s
     set encerrada_em = now()
   where s.encerrada_em is null
     and s.session_id is not null
     and not exists (select 1 from auth.sessions a where a.id = s.session_id);

  -- Código aceito cujo link nunca virou sessão.
  update public.sessoes_demo
     set encerrada_em = now()
   where session_id is null and encerrada_em is null and criado_em < now() - interval '10 minutes';

  delete from public.demo_tentativas where criado_em < now() - interval '1 day';

  -- Acesso do admin cuja sessão sumiu (saiu por outro caminho) ou nunca abriu.
  update public.acessos_admin x
     set encerrado_em = now()
   where x.encerrado_em is null
     and ((x.session_id is not null and not exists (select 1 from auth.sessions a where a.id = x.session_id))
          or (x.session_id is null and x.iniciado_em < now() - interval '10 minutes'));

  return n + m;
end;
$$;
