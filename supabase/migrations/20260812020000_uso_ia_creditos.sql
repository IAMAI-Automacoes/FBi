-- Registro de uso da IA e cota de crédito por restaurante.
--
-- Até aqui o objeto `usage` devolvido pelo OpenRouter (que traz o custo em
-- dólares) era descartado em todas as edge functions, então não havia como
-- saber quanto cada restaurante consumia nem impedir abuso.

create table if not exists public.uso_ia (
  id uuid primary key default gen_random_uuid(),
  restaurante_id bigint references public.restaurantes(id) on delete cascade,
  -- 'chat', 'gerar-insights', 'sugerir-acoes', … (quem originou a chamada)
  origem text not null,
  agente_id text,
  modelo text,
  prompt_tokens int,
  completion_tokens int,
  custo_usd numeric(12,8) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists uso_ia_restaurante_data
  on public.uso_ia (restaurante_id, created_at desc);

alter table public.uso_ia enable row level security;

-- O dono lê o próprio consumo (a barra de crédito no chat); admin lê tudo.
-- Ninguém escreve pelo PostgREST: só service_role, de dentro das edge functions.
drop policy if exists "uso_ia leitura propria" on public.uso_ia;
create policy "uso_ia leitura propria" on public.uso_ia
  for select to authenticated
  using (
    restaurante_id = public.get_user_restaurante_id()
    or exists (select 1 from public.platform_admins where email = auth.email())
  );

alter table public.restaurantes
  add column if not exists credito_ia_limite_usd numeric(10,4) not null default 3,
  add column if not exists credito_ia_ciclo_inicio timestamptz not null default now();

comment on column public.restaurantes.credito_ia_limite_usd is
  'Teto de gasto com IA por ciclo mensal. Ajustável por restaurante.';
comment on column public.restaurantes.credito_ia_ciclo_inicio is
  'Início do ciclo de crédito atual; rola de mês em mês junto com a assinatura.';

/**
 * Verifica (e opcionalmente debita) a cota de IA do restaurante.
 *
 * Rola o ciclo automaticamente quando o início já tem mais de um mês, de modo
 * que o crédito zera no aniversário da assinatura sem precisar de cron.
 * Devolve o estado ANTES da chamada — quem decide seguir é a edge function,
 * que só sabe o custo real depois da resposta do OpenRouter.
 */
create or replace function public.consumir_credito_ia(
  p_restaurante_id bigint,
  p_custo numeric default 0
)
returns table (permitido boolean, gasto numeric, limite numeric, ciclo_inicio timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio timestamptz;
  v_limite numeric;
  v_gasto numeric;
begin
  select credito_ia_ciclo_inicio, credito_ia_limite_usd
    into v_inicio, v_limite
  from public.restaurantes
  where id = p_restaurante_id
  for update;

  if not found then
    raise exception 'Restaurante % não encontrado', p_restaurante_id;
  end if;

  -- Ciclo vencido: recomeça a contagem a partir de agora.
  if v_inicio < now() - interval '1 month' then
    v_inicio := now();
    update public.restaurantes
       set credito_ia_ciclo_inicio = v_inicio
     where id = p_restaurante_id;
  end if;

  select coalesce(sum(u.custo_usd), 0) into v_gasto
  from public.uso_ia u
  where u.restaurante_id = p_restaurante_id
    and u.created_at >= v_inicio;

  return query select (v_gasto + p_custo) <= v_limite, v_gasto, v_limite, v_inicio;
end;
$$;

revoke execute on function public.consumir_credito_ia(bigint, numeric) from public, anon, authenticated;
grant execute on function public.consumir_credito_ia(bigint, numeric) to service_role;

/** Gasto do ciclo corrente — usado pela barra de crédito no chat. */
create or replace function public.meu_uso_ia()
returns table (gasto numeric, limite numeric, ciclo_inicio timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  v_id := public.get_user_restaurante_id();
  if v_id is null then
    return;
  end if;

  return query
  select coalesce((
      select sum(u.custo_usd) from public.uso_ia u
      where u.restaurante_id = v_id and u.created_at >= r.credito_ia_ciclo_inicio
    ), 0),
    r.credito_ia_limite_usd,
    r.credito_ia_ciclo_inicio
  from public.restaurantes r
  where r.id = v_id;
end;
$$;

revoke execute on function public.meu_uso_ia() from public, anon;
grant execute on function public.meu_uso_ia() to authenticated, service_role;
