-- Cupom só de vendedor, e fim do "teste de 3 minutos".
--
-- CUPOM DE VENDEDOR. O vendedor não paga: usa um cupom de acesso, como qualquer
-- conta. Mas um cupom sem data para acabar e com nome fácil de adivinhar
-- ("VENDEDOR100") daria o sistema de graça a qualquer restaurante que ouvisse o
-- nome. Com `somente_vendedores`, o resgate (`resgatar-cupom`) confere se o
-- email da conta está marcado como vendedor.
--
-- TESTE DE 3 MINUTOS. A chave saiu do card do código, a pedido do dono. Sem ela
-- a marca ficaria parada no banco: sai a coluna, sai a função que a ligava, e a
-- demonstração volta a ter uma duração só, 2 h.
alter table public.cupons
  add column if not exists somente_vendedores boolean not null default false;

comment on column public.cupons.somente_vendedores is
  'Só contas cujo email está em `vendedores` conseguem resgatar (conferido na edge function resgatar-cupom).';

drop function if exists public.definir_teste_demo(boolean);

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

      begin
        insert into public.sessoes_demo (email_vendedor, restaurante_id, auth_user_id, janela, duracao_minutos)
        values (v.email, v_rest, v_user, v_j, 120)
        returning id into v_id;
      exception when unique_violation then
        insert into public.demo_tentativas (ip, acertou) values (v_ip, false);
        return query select 'usado'::text, null::uuid, null::text, null::int;
        return;
      end;

      insert into public.demo_tentativas (ip, acertou) values (v_ip, true);
      return query select 'ok'::text, v_id, v.email, 120;
      return;
    end loop;
  end loop;

  insert into public.demo_tentativas (ip, acertou) values (v_ip, false);
  return query select 'invalido'::text, null::uuid, null::text, null::int;
end;
$$;

-- O retorno muda (sai `proximo_acesso_teste`), então a função é recriada.
drop function if exists public.meu_codigo_demo();
create function public.meu_codigo_demo()
returns table (codigo text, segundos_restantes int)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_agora   numeric := extract(epoch from clock_timestamp());
  v_segredo text;
begin
  -- Na demonstração o código não aparece: com ele, o cliente abriria uma
  -- demonstração nova depois das 2 h, para sempre.
  if public.sessao_eh_demo() then
    raise exception 'O código não aparece durante a demonstração' using errcode = '42501';
  end if;

  select v.segredo_demo into v_segredo
    from public.vendedores v
   where v.email = lower(auth.email());
  if not found then
    return;
  end if;

  return query
  select public.codigo_demo(v_segredo, floor(v_agora / 30)::bigint),
         (30 - (floor(v_agora)::bigint % 30))::int;
end;
$$;

revoke execute on function public.meu_codigo_demo() from public, anon;
grant execute on function public.meu_codigo_demo() to authenticated;

alter table public.vendedores drop column if exists proximo_acesso_teste;

notify pgrst, 'reload schema';
