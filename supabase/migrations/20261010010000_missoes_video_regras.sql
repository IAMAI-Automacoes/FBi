-- Missões de vídeo: as ferramentas do admin.
--   · roteiro de cada missão (o cliente segue; a IA confere se seguiu, mas
--     quem decide continuam sendo os requisitos);
--   · duração mínima e máxima do vídeo, por missão;
--   · período em que a missão fica disponível (de / até);
--   · máximo de vídeos aprovados por ano, por restaurante (somando todas as
--     missões), em video_config;
--   · a escada de prêmios recomeça todo ano (1º de janeiro, horário de
--     Brasília): a 1ª missão aprovada no ano dá o prêmio 1 daquele ano.

alter table public.video_missoes
  add column if not exists roteiro text not null default '',
  add column if not exists duracao_min_s integer,
  add column if not exists duracao_max_s integer,
  add column if not exists disponivel_de date,
  add column if not exists disponivel_ate date;

alter table public.video_missoes drop constraint if exists video_missoes_duracao_ok;
alter table public.video_missoes add constraint video_missoes_duracao_ok check (
  (duracao_min_s is null or duracao_min_s between 0 and 300)
  and (duracao_max_s is null or duracao_max_s between 5 and 300)
  and (duracao_min_s is null or duracao_max_s is null or duracao_min_s <= duracao_max_s)
);
alter table public.video_missoes drop constraint if exists video_missoes_periodo_ok;
alter table public.video_missoes add constraint video_missoes_periodo_ok check (
  disponivel_de is null or disponivel_ate is null or disponivel_de <= disponivel_ate
);

comment on column public.video_missoes.roteiro is 'Passo a passo para gravar (um passo por linha). A IA confere se o vídeo seguiu, mas quem aprova são os requisitos.';
comment on column public.video_missoes.disponivel_ate is 'Último dia (inclusive, horário de Brasília) em que dá para mandar vídeo.';

-- O restaurante lê as missões ativas e também as que ele já mandou vídeo
-- (o histórico mostra o nome mesmo depois que a missão sai do ar).
drop policy if exists video_missoes_le on public.video_missoes;
create policy video_missoes_le on public.video_missoes for select to authenticated
  using (
    ativa
    or exists (
      select 1 from public.video_envios e
       where e.missao_id = video_missoes.id and e.restaurante_id = public.get_user_restaurante_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Regras gerais (uma linha só)
-- ---------------------------------------------------------------------------
create table if not exists public.video_config (
  id             boolean primary key default true check (id),
  -- Vídeos aprovados por ano, por restaurante, somando todas as missões. Vazio = sem limite.
  max_por_ano    integer check (max_por_ano is null or max_por_ano >= 1),
  atualizado_em  timestamptz not null default now()
);
insert into public.video_config (id, max_por_ano) values (true, 4) on conflict (id) do nothing;

drop trigger if exists video_config_atualizado on public.video_config;
create trigger video_config_atualizado before update on public.video_config
  for each row execute function public.video_tocar_atualizado();

alter table public.video_config enable row level security;
drop policy if exists video_config_admin on public.video_config;
create policy video_config_admin on public.video_config for all
  using (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())))
  with check (exists (select 1 from public.platform_admins pa where lower(pa.email) = lower(auth.email())));
drop policy if exists video_config_le on public.video_config;
create policy video_config_le on public.video_config for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Quando foi aprovado (para contar por ano)
-- ---------------------------------------------------------------------------
alter table public.video_envios add column if not exists aprovado_em timestamptz;
update public.video_envios set aprovado_em = coalesce(revisado_em, analisado_em, atualizado_em)
 where status = 'aprovado' and aprovado_em is null;

create or replace function public.video_marcar_aprovado_em()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'aprovado' then
    new.aprovado_em := null;
  elsif tg_op = 'INSERT' then
    new.aprovado_em := coalesce(new.aprovado_em, now());
  elsif old.status is distinct from 'aprovado' then
    new.aprovado_em := now();
  else
    -- Continua aprovado (mudou outro campo): mantém a data da aprovação.
    new.aprovado_em := coalesce(old.aprovado_em, new.aprovado_em, now());
  end if;
  return new;
end;
$$;

drop trigger if exists video_envios_aprovado_em on public.video_envios;
create trigger video_envios_aprovado_em before insert or update on public.video_envios
  for each row execute function public.video_marcar_aprovado_em();

create index if not exists video_envios_aprovados_idx on public.video_envios (restaurante_id, aprovado_em) where status = 'aprovado';

-- ---------------------------------------------------------------------------
-- A escada por ano
-- ---------------------------------------------------------------------------
alter table public.video_premios add column if not exists ano integer;
update public.video_premios p
   set ano = extract(year from (coalesce(e.aprovado_em, p.criado_em) at time zone 'America/Sao_Paulo'))::int
  from public.video_envios e
 where e.id = p.envio_id and p.ano is null;
update public.video_premios set ano = extract(year from (criado_em at time zone 'America/Sao_Paulo'))::int where ano is null;
alter table public.video_premios alter column ano set not null;

drop index if exists public.video_premios_um_por_degrau;
create unique index if not exists video_premios_um_por_degrau_ano
  on public.video_premios (restaurante_id, ano, recompensa_ordem) where status <> 'cancelado';

create or replace function public.video_envio_premio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    select descricao into texto from public.video_recompensas where ordem = n;
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
$$;

-- ---------------------------------------------------------------------------
-- As missões de exemplo: roteiro e duração viram campos (o requisito
-- "tem pelo menos N segundos" sai da lista, a tela confere antes de enviar).
-- Só mexe se o admin ainda não editou.
-- ---------------------------------------------------------------------------
update public.video_missoes
   set roteiro = E'Diga seu nome e o nome do restaurante.\nConte como vocês ficavam sabendo da opinião dos clientes antes.\nFale o nome EasyFeed e conte uma coisa que melhorou depois que começaram a usar.\nTermine com uma frase sua recomendando (ou não) o EasyFeed.',
       duracao_min_s = 30, duracao_max_s = 120,
       requisitos = (select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(requisitos) r where r->>'id' <> 'duracao')
 where titulo = 'Depoimento sobre o EasyFeed' and roteiro = '' and requisitos @> '[{"id": "duracao"}]';

update public.video_missoes
   set roteiro = E'Mostre a mesa, o balcão ou a parede com o QR Code do EasyFeed.\nAponte o celular para o QR Code (ou mostre alguém fazendo isso).\nExplique: o cliente escaneia, manda a opinião pelo WhatsApp e o restaurante recebe no painel.',
       duracao_min_s = 20, duracao_max_s = 90,
       requisitos = (select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(requisitos) r where r->>'id' <> 'duracao')
 where titulo = 'Mostre o QR Code' and roteiro = '' and requisitos @> '[{"id": "duracao"}]';
