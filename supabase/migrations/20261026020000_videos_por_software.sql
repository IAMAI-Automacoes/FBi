-- Descontos → Vídeos: os dados separados por software (Restaurante e RH).
--
-- Pedido do Raver (15/10/2026): "a página pode ser igual, mas os dados são
-- separados do outro software". Cada software tem as suas missões, a sua
-- escada de prêmios e o seu limite de vídeos por ano. Os envios e os prêmios já
-- são de uma conta, e a conta é de um software.
--
-- O que existia fica no restaurante; o RH começa vazio. Pode rodar mais de uma vez.

-- ── Missões ──────────────────────────────────────────────────────────────
alter table public.video_missoes add column if not exists area text not null default 'restaurante';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'video_missoes_area_check') then
    alter table public.video_missoes add constraint video_missoes_area_check check (area in ('restaurante', 'rh'));
  end if;
end $$;

-- A conta vê as missões ATIVAS do software dela (e as que já mandou vídeo).
drop policy if exists video_missoes_le on public.video_missoes;
create policy video_missoes_le on public.video_missoes for select to authenticated
  using ((ativa and area = public.area_da_conta_logada())
         or exists (select 1 from public.video_envios e where e.missao_id = video_missoes.id and e.restaurante_id = public.get_user_restaurante_id()));

-- ── Escada de prêmios: uma por software ──────────────────────────────────
alter table public.video_recompensas add column if not exists area text not null default 'restaurante';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'video_recompensas_area_check') then
    alter table public.video_recompensas add constraint video_recompensas_area_check check (area in ('restaurante', 'rh'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'video_recompensas_pkey'
               and pg_get_constraintdef(oid) = 'PRIMARY KEY (ordem)') then
    alter table public.video_recompensas drop constraint video_recompensas_pkey;
    alter table public.video_recompensas add constraint video_recompensas_pkey primary key (area, ordem);
  end if;
end $$;

-- ── Limite de vídeos por ano: um por software ────────────────────────────
alter table public.video_config add column if not exists area text not null default 'restaurante';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'video_config_area_check') then
    alter table public.video_config add constraint video_config_area_check check (area in ('restaurante', 'rh'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'video_config_pkey'
               and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)') then
    alter table public.video_config drop constraint video_config_pkey;
    alter table public.video_config add constraint video_config_pkey primary key (area);
  end if;
end $$;
comment on column public.video_config.area is 'Uma linha por software. A coluna `id` (sempre true) ficou de quando era uma linha só.';

-- ── O prêmio do degrau vem da escada do software da conta ────────────────
create or replace function public.video_envio_premio()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a integer;
  n integer;
  texto text;
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    a := extract(year from (new.aprovado_em at time zone 'America/Sao_Paulo'))::int;
    -- N = vídeos aprovados do restaurante NESTE ano (a escada recomeça em janeiro).
    select count(*) into n
      from public.video_envios
     where restaurante_id = new.restaurante_id and status = 'aprovado'
       and extract(year from (aprovado_em at time zone 'America/Sao_Paulo'))::int = a;
    -- A escada do software da conta (Restaurante ou RH).
    select descricao into texto from public.video_recompensas
     where ordem = n and area = public.area_da_conta(new.restaurante_id);
    if texto is null then
      return new; -- a escada não tem esse degrau: missão cumprida, sem prêmio novo
    end if;
    if exists (
      select 1 from public.video_premios
       where restaurante_id = new.restaurante_id and ano = a and recompensa_ordem = n
         and status <> 'cancelado' and envio_id <> new.id
    ) then
      return new;
    end if;
    insert into public.video_premios (restaurante_id, ano, recompensa_ordem, descricao, envio_id)
    values (new.restaurante_id, a, n, texto, new.id)
    on conflict (envio_id) do update
      set ano = excluded.ano, recompensa_ordem = excluded.recompensa_ordem, descricao = excluded.descricao,
          status = 'pendente', aplicado_em = null, aplicado_por = null
      where public.video_premios.status = 'cancelado';
  elsif old.status = 'aprovado' and new.status is distinct from 'aprovado' then
    update public.video_premios set status = 'cancelado'
     where envio_id = new.id and status = 'pendente';
  end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
