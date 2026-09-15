-- Vendedores e demonstração.
--
-- VENDEDOR é uma conta normal de restaurante, com duas diferenças:
--
--   · Não paga. Fica com assinatura 'ativa' e sem data de expiração, e assim
--     passa por TODAS as travas de assinatura que já existem (painel, IA, fila do
--     n8n, limpeza noturna de contas e de instâncias do WhatsApp) sem abrir uma
--     exceção em cada uma. O status de antes fica guardado e volta se a conta
--     deixar de ser de vendedor.
--
--   · Abre DEMONSTRAÇÃO. No perfil aparece um código de 6 dígitos que muda a
--     cada 30 s (o mesmo cálculo do Google Authenticator). Digitado em /demo,
--     no computador do cliente, ele dá 2 h de acesso à conta do vendedor.
--
-- A marca é por EMAIL, e não por conta: o admin marca antes de o vendedor criar
-- a conta, e ela já nasce ativa.
--
-- COMO O CÓDIGO VIRA LOGIN. A edge function `entrar-demo` confere o código aqui
-- (`validar_codigo_demo`) e gera um link mágico da conta do vendedor, sem mandar
-- email. O navegador troca o link por uma sessão de verdade e a registra
-- (`registrar_sessao_demo`). Por ser sessão de verdade, tudo funciona igual:
-- mesmos dados, mesmas permissões.
--
-- COMO A DEMONSTRAÇÃO ACABA. No navegador, um cronômetro fecha a aba na hora. No
-- servidor, `encerrar_sessoes_demo` roda a cada minuto e apaga a sessão vencida,
-- o que derruba a renovação do login mesmo com a aba aberta ou reaberta.

-- ---------------------------------------------------------------------------
-- Tabelas (todas fechadas: só funções deste arquivo e o service_role leem)
-- ---------------------------------------------------------------------------
create table if not exists public.vendedores (
  email                text primary key
                       check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Semente do código. Nunca sai do banco: o código é calculado aqui dentro e
  -- só ele vai para a tela.
  segredo_demo         text not null default encode(extensions.gen_random_bytes(20), 'hex'),
  -- "Próximo acesso: teste de 3 min". Desliga sozinho quando o código é usado.
  proximo_acesso_teste boolean not null default false,
  -- Como a assinatura estava antes de a conta virar de vendedor.
  assinatura_anterior  text,
  expira_anterior      timestamptz,
  criado_em            timestamptz not null default now(),
  criado_por           text
);

create table if not exists public.sessoes_demo (
  id              uuid primary key default gen_random_uuid(),
  email_vendedor  text not null references public.vendedores(email) on delete cascade on update cascade,
  restaurante_id  bigint not null references public.restaurantes(id) on delete cascade,
  auth_user_id    uuid not null,
  -- Janela de 30 s do código usado. Com o unique abaixo, um código vale uma vez.
  janela          bigint not null,
  duracao_minutos int not null check (duracao_minutos between 1 and 120),
  criado_em       timestamptz not null default now(),
  -- Preenchidos quando o navegador troca o link pela sessão e registra.
  session_id      uuid unique,
  iniciada_em     timestamptz,
  expira_em       timestamptz,
  encerrada_em    timestamptz,
  unique (email_vendedor, janela)
);

create index if not exists sessoes_demo_abertas
  on public.sessoes_demo (expira_em) where encerrada_em is null;

create table if not exists public.demo_tentativas (
  id        bigint generated always as identity primary key,
  ip        text not null,
  acertou   boolean not null,
  criado_em timestamptz not null default now()
);

create index if not exists demo_tentativas_ip on public.demo_tentativas (ip, criado_em desc);

alter table public.vendedores      enable row level security;
alter table public.sessoes_demo    enable row level security;
alter table public.demo_tentativas enable row level security;
revoke all on public.vendedores, public.sessoes_demo, public.demo_tentativas from anon, authenticated;

-- ---------------------------------------------------------------------------
-- O código de 6 dígitos (TOTP, RFC 6238, HMAC-SHA1, passo de 30 s)
-- ---------------------------------------------------------------------------
-- Os operadores de bit do Postgres têm todos a mesma precedência: cada
-- deslocamento vai entre parênteses, senão `a << 24 | b << 16` desloca a soma.
create or replace function public.codigo_demo(p_segredo text, p_janela bigint)
returns text
language sql
stable
set search_path = ''
as $$
  select lpad(
           ((  ((get_byte(y.h, y.o) & 127) << 24)
             | (get_byte(y.h, y.o + 1) << 16)
             | (get_byte(y.h, y.o + 2) << 8)
             |  get_byte(y.h, y.o + 3)) % 1000000)::text,
           6, '0')
    from (
      select x.h, get_byte(x.h, 19) & 15 as o
        from (select extensions.hmac(int8send(p_janela), decode(p_segredo, 'hex'), 'sha1') as h) x
    ) y
$$;

create or replace function public.janela_demo_atual()
returns bigint
language sql
volatile
set search_path = ''
as $$
  select floor(extract(epoch from clock_timestamp()) / 30)::bigint
$$;

-- ---------------------------------------------------------------------------
-- Quem é a sessão
-- ---------------------------------------------------------------------------
-- Uma chamada só para a tela saber tudo que muda por causa de vendedor e de
-- demonstração. Quem decide o que é bloqueado é a SESSÃO, não o endereço: quem
-- tirar o /demo da URL continua em demonstração.
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

create or replace function public.sessao_eh_demo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select m.em_demonstracao from public.meu_acesso() m), false)
$$;

-- Admin da plataforma, ou uma conexão direta ao banco (console, cron), que não
-- tem JWT — o mesmo critério de `proteger_colunas_assinatura`.
create or replace function public.eh_admin_plataforma_ou_console()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') = ''
      or exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email()))
$$;

-- ---------------------------------------------------------------------------
-- O painel do vendedor
-- ---------------------------------------------------------------------------
create or replace function public.meu_codigo_demo()
returns table (codigo text, segundos_restantes int, proximo_acesso_teste boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_agora   numeric := extract(epoch from clock_timestamp());
  v_segredo text;
  v_teste   boolean;
begin
  -- Na demonstração o código não aparece: com ele, o cliente abriria uma
  -- demonstração nova depois das 2 h, para sempre.
  if public.sessao_eh_demo() then
    raise exception 'O código não aparece durante a demonstração' using errcode = '42501';
  end if;

  select v.segredo_demo, v.proximo_acesso_teste into v_segredo, v_teste
    from public.vendedores v
   where v.email = lower(auth.email());
  if not found then
    return;
  end if;

  return query
  select public.codigo_demo(v_segredo, floor(v_agora / 30)::bigint),
         (30 - (floor(v_agora)::bigint % 30))::int,
         v_teste;
end;
$$;

create or replace function public.definir_teste_demo(p_ligado boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.sessao_eh_demo() then
    raise exception 'Indisponível durante a demonstração' using errcode = '42501';
  end if;

  update public.vendedores v
     set proximo_acesso_teste = coalesce(p_ligado, false)
   where v.email = lower(auth.email());
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- A entrada por código
-- ---------------------------------------------------------------------------
-- Resultados: ok, invalido, usado, bloqueado, sem_conta, conta_incompleta.
create or replace function public.validar_codigo_demo(p_codigo text, p_ip text)
returns table (resultado text, sessao_demo_id uuid, email text, duracao_minutos int)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ip       text   := coalesce(nullif(btrim(p_ip), ''), 'desconhecido');
  v_janela   bigint := public.janela_demo_atual();
  v          record;
  v_j        bigint;
  v_user     uuid;
  v_rest     bigint;
  v_onb      boolean;
  v_excluida timestamptz;
  v_duracao  int;
  v_id       uuid;
begin
  -- A página é pública e pede só o código. Sem limite, um robô testaria os
  -- 6 dígitos até acertar: 5 erros por IP em 15 min, e 60 no total por hora.
  if (select count(*) from public.demo_tentativas t
       where t.ip = v_ip and not t.acertou and t.criado_em > now() - interval '15 minutes') >= 5
     or (select count(*) from public.demo_tentativas t
          where not t.acertou and t.criado_em > now() - interval '1 hour') >= 60 then
    return query select 'bloqueado'::text, null::uuid, null::text, null::int;
    return;
  end if;

  if coalesce(p_codigo, '') !~ '^[0-9]{6}$' then
    insert into public.demo_tentativas (ip, acertou) values (v_ip, false);
    return query select 'invalido'::text, null::uuid, null::text, null::int;
    return;
  end if;

  -- O código da janela atual e o da anterior: dá tempo de ler no tablet e digitar.
  for v in select * from public.vendedores loop
    foreach v_j in array array[v_janela, v_janela - 1] loop
      continue when public.codigo_demo(v.segredo_demo, v_j) <> p_codigo;

      select u.id into v_user from auth.users u where lower(u.email) = v.email limit 1;
      select r.id, r.onboarding_completo, r.excluida_em into v_rest, v_onb, v_excluida
        from public.restaurantes r
       where r.auth_user_id = v_user;

      if v_rest is null or v_excluida is not null then
        insert into public.demo_tentativas (ip, acertou) values (v_ip, false);
        return query select 'sem_conta'::text, null::uuid, null::text, null::int;
        return;
      end if;

      -- Sem a configuração inicial, o cliente cairia no onboarding da conta do
      -- vendedor — que inclui conectar o WhatsApp dele.
      if not coalesce(v_onb, false) then
        insert into public.demo_tentativas (ip, acertou) values (v_ip, true);
        return query select 'conta_incompleta'::text, null::uuid, null::text, null::int;
        return;
      end if;

      v_duracao := case when v.proximo_acesso_teste then 3 else 120 end;

      begin
        insert into public.sessoes_demo (email_vendedor, restaurante_id, auth_user_id, janela, duracao_minutos)
        values (v.email, v_rest, v_user, v_j, v_duracao)
        returning id into v_id;
      exception when unique_violation then
        insert into public.demo_tentativas (ip, acertou) values (v_ip, false);
        return query select 'usado'::text, null::uuid, null::text, null::int;
        return;
      end;

      if v.proximo_acesso_teste then
        update public.vendedores set proximo_acesso_teste = false where email = v.email;
      end if;

      insert into public.demo_tentativas (ip, acertou) values (v_ip, true);
      return query select 'ok'::text, v_id, v.email, v_duracao;
      return;
    end loop;
  end loop;

  insert into public.demo_tentativas (ip, acertou) values (v_ip, false);
  return query select 'invalido'::text, null::uuid, null::text, null::int;
end;
$$;

-- Chamado pelo navegador logo depois de trocar o link pela sessão: liga o
-- registro do código a ESTA sessão e começa a contar o tempo.
create or replace function public.registrar_sessao_demo(p_sessao_demo_id uuid)
returns table (expira_em timestamptz, duracao_minutos int)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_sessao uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if auth.uid() is null or v_sessao is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;

  return query
  update public.sessoes_demo s
     set session_id  = v_sessao,
         iniciada_em = now(),
         expira_em   = now() + make_interval(mins => s.duracao_minutos)
   where s.id = p_sessao_demo_id
     and s.auth_user_id = auth.uid()
     and s.session_id is null
     and s.encerrada_em is null
     and s.criado_em > now() - interval '5 minutes'
  returning s.expira_em, s.duracao_minutos;

  -- Registro repetido (a página recarregou): devolve o que já vale.
  if not found then
    return query
    select s.expira_em, s.duracao_minutos from public.sessoes_demo s where s.session_id = v_sessao;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- O fim
-- ---------------------------------------------------------------------------
-- Apagar a sessão de `auth.sessions` apaga junto os tokens de renovação
-- (cascata): o navegador não consegue mais renovar o login e cai.
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
  delete from auth.sessions a
   where a.created_at < now() - interval '120 minutes'
     and exists (select 1 from auth.mfa_amr_claims c
                  where c.session_id = a.id and c.authentication_method in ('magiclink', 'otp'))
     and exists (select 1 from auth.users u join public.vendedores v on v.email = lower(u.email)
                  where u.id = a.user_id)
     and not exists (select 1 from public.sessoes_demo s where s.session_id = a.id);
  get diagnostics m = row_count;

  -- Código aceito cujo link nunca virou sessão.
  update public.sessoes_demo
     set encerrada_em = now()
   where session_id is null and encerrada_em is null and criado_em < now() - interval '10 minutes';

  delete from public.demo_tentativas where criado_em < now() - interval '1 day';

  return n + m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: marcar e desmarcar vendedores
-- ---------------------------------------------------------------------------
create or replace function public.admin_listar_vendedores()
returns table (email text, restaurante_id bigint, nome_restaurante text, tem_conta boolean, criado_em timestamptz, ultima_demo_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.eh_admin_plataforma_ou_console() then
    raise exception 'Só o admin da plataforma' using errcode = '42501';
  end if;

  return query
  select v.email,
         r.id,
         r.nome_restaurante::text,
         u.id is not null,
         v.criado_em,
         (select max(s.iniciada_em) from public.sessoes_demo s where s.email_vendedor = v.email)
    from public.vendedores v
    left join auth.users u on lower(u.email) = v.email
    left join public.restaurantes r on r.auth_user_id = u.id
   order by v.criado_em;
end;
$$;

create or replace function public.admin_definir_vendedor(p_email text, p_vendedor boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email    text := lower(btrim(p_email));
  v_user     uuid;
  v_rest     bigint;
  v_status   text;
  v_expira   timestamptz;
  v_anterior text;
  v_exp_ant  timestamptz;
begin
  if not public.eh_admin_plataforma_ou_console() then
    raise exception 'Só o admin da plataforma' using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email inválido' using errcode = '22023';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email limit 1;
  select r.id, r.assinatura_status, r.assinatura_expira_em into v_rest, v_status, v_expira
    from public.restaurantes r
   where r.auth_user_id = v_user;

  if p_vendedor then
    if exists (select 1 from public.vendedores v where v.email = v_email) then
      return;
    end if;

    insert into public.vendedores (email, assinatura_anterior, expira_anterior, criado_por)
    values (v_email, v_status, v_expira, auth.email());

    if v_rest is not null then
      update public.restaurantes
         set assinatura_status = 'ativa', assinatura_expira_em = null
       where id = v_rest;
    end if;
    return;
  end if;

  select v.assinatura_anterior, v.expira_anterior into v_anterior, v_exp_ant
    from public.vendedores v
   where v.email = v_email;
  if not found then
    return;
  end if;

  -- Fecha as demonstrações abertas desta conta antes de tirar a marca.
  delete from auth.sessions a
   using public.sessoes_demo s
   where s.email_vendedor = v_email and s.session_id = a.id;
  delete from auth.sessions a
   where a.user_id = v_user
     and exists (select 1 from auth.mfa_amr_claims c
                  where c.session_id = a.id and c.authentication_method in ('magiclink', 'otp'));

  delete from public.vendedores v where v.email = v_email;

  if v_rest is not null then
    update public.restaurantes
       set assinatura_status = coalesce(v_anterior, 'sem_assinatura'),
           assinatura_expira_em = v_exp_ant
     where id = v_rest;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Travas nos restaurantes
-- ---------------------------------------------------------------------------
-- Conta criada por um email já marcado nasce ativa. BEFORE INSERT de propósito:
-- um UPDATE depois esbarraria em `proteger_colunas_assinatura`, porque quem
-- insere é o próprio vendedor, com o JWT dele.
create or replace function public.ativar_conta_de_vendedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from auth.users u
               join public.vendedores v on v.email = lower(u.email)
              where u.id = new.auth_user_id) then
    new.assinatura_status    := 'ativa';
    new.assinatura_expira_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restaurantes_vendedor_ativo on public.restaurantes;
create trigger trg_restaurantes_vendedor_ativo
  before insert on public.restaurantes
  for each row execute function public.ativar_conta_de_vendedor();

-- O número conectado e o dos avisos urgentes são da conta de verdade do
-- vendedor. A tela já esconde; isto impede também pela API.
create or replace function public.bloquear_whatsapp_na_demo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.whatsapp_dono   is distinct from old.whatsapp_dono
      or new.numero_whatsapp is distinct from old.numero_whatsapp
      or new.whatsapp_token  is distinct from old.whatsapp_token)
     and public.sessao_eh_demo() then
    raise exception 'O WhatsApp não pode ser alterado durante a demonstração' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restaurantes_bloquear_whatsapp_demo on public.restaurantes;
create trigger trg_restaurantes_bloquear_whatsapp_demo
  before update on public.restaurantes
  for each row execute function public.bloquear_whatsapp_na_demo();

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke execute on function public.codigo_demo(text, bigint)             from public, anon, authenticated;
revoke execute on function public.janela_demo_atual()                   from public, anon, authenticated;
revoke execute on function public.eh_admin_plataforma_ou_console()      from public, anon, authenticated;
revoke execute on function public.validar_codigo_demo(text, text)       from public, anon, authenticated;
revoke execute on function public.encerrar_sessoes_demo()               from public, anon, authenticated;
revoke execute on function public.meu_acesso()                          from public, anon;
revoke execute on function public.sessao_eh_demo()                      from public, anon;
revoke execute on function public.meu_codigo_demo()                     from public, anon;
revoke execute on function public.definir_teste_demo(boolean)           from public, anon;
revoke execute on function public.registrar_sessao_demo(uuid)           from public, anon;
revoke execute on function public.admin_listar_vendedores()             from public, anon;
revoke execute on function public.admin_definir_vendedor(text, boolean) from public, anon;

grant execute on function public.meu_acesso()                          to authenticated, service_role;
grant execute on function public.sessao_eh_demo()                      to authenticated, service_role;
grant execute on function public.meu_codigo_demo()                     to authenticated;
grant execute on function public.definir_teste_demo(boolean)           to authenticated;
grant execute on function public.registrar_sessao_demo(uuid)           to authenticated;
grant execute on function public.admin_listar_vendedores()             to authenticated;
grant execute on function public.admin_definir_vendedor(text, boolean) to authenticated;
grant execute on function public.validar_codigo_demo(text, text)       to service_role;
grant execute on function public.encerrar_sessoes_demo()               to service_role;

-- ---------------------------------------------------------------------------
-- Cron: a cada minuto
-- ---------------------------------------------------------------------------
do $$ begin perform cron.unschedule('encerrar-sessoes-demo'); exception when others then null; end $$;
select cron.schedule('encerrar-sessoes-demo', '* * * * *', $$ select public.encerrar_sessoes_demo(); $$);

notify pgrst, 'reload schema';
